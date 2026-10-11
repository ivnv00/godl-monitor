import Darwin
import Foundation

public enum WalletSettingsError: Error, LocalizedError {
    case invalidAddress, unsupportedVersion, invalidEndpoint, preservedSettings
    public var errorDescription: String? {
        switch self {
        case .invalidAddress: "Enter a valid Solana public address. Never enter a recovery phrase or private key."
        case .unsupportedVersion: "This settings file uses an unsupported version. It has been preserved."
        case .invalidEndpoint: "Use an HTTPS RPC URL without a username, password or fragment."
        case .preservedSettings: "Existing wallet settings could not be safely loaded and have been preserved. Restore a readable, supported settings file before saving."
        }
    }
}

public struct WalletSettings: Codable, Equatable, Sendable {
    public let version: Int
    public let wallet: String
    public let legacyWallet: String?

    public init(wallet: String, legacyWallet: String? = nil) throws {
        version = 1
        self.wallet = try Self.validateAddress(wallet)
        self.legacyWallet = try legacyWallet.map(Self.validateAddress)
    }

    public static func validateAddress(_ input: String) throws -> String {
        let value = input.trimmingCharacters(in: .whitespacesAndNewlines)
        let alphabet = Array("123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz".utf8)
        guard (32...44).contains(value.utf8.count) else { throw WalletSettingsError.invalidAddress }
        var decoded = [UInt8]()
        for character in value.utf8 {
            guard let digit = alphabet.firstIndex(of: character) else { throw WalletSettingsError.invalidAddress }
            var carry = digit
            for index in decoded.indices {
                carry += Int(decoded[index]) * 58
                decoded[index] = UInt8(carry & 255)
                carry >>= 8
            }
            while carry > 0 { decoded.append(UInt8(carry & 255)); carry >>= 8 }
        }
        let zeroes = value.utf8.prefix(while: { $0 == 49 }).count
        guard decoded.count + zeroes == 32 else { throw WalletSettingsError.invalidAddress }
        return value
    }

    public func dataDirectory(in root: URL) -> URL {
        wallet == legacyWallet ? root : root.appendingPathComponent("Wallets", isDirectory: true)
            .appendingPathComponent(wallet, isDirectory: true)
    }

    private enum CodingKeys: String, CodingKey { case version, wallet, legacyWallet }
    public init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        guard try values.decode(Int.self, forKey: .version) == 1 else { throw WalletSettingsError.unsupportedVersion }
        try self.init(wallet: values.decode(String.self, forKey: .wallet),
                      legacyWallet: values.decodeIfPresent(String.self, forKey: .legacyWallet))
    }
}

public struct WalletSettingsStore: Sendable {
    public let directory: URL
    public var url: URL { directory.appendingPathComponent("wallet-settings.json") }
    public init(directory: URL) { self.directory = directory }
    public func load() throws -> WalletSettings? {
        do { return try JSONDecoder().decode(WalletSettings.self, from: Data(contentsOf: url)) }
        catch let error as CocoaError where error.code == .fileReadNoSuchFile { return nil }
    }
    public func save(_ settings: WalletSettings) throws {
        // A valid replacement must never destroy unreadable or newer-version settings.
        do { _ = try load() }
        catch { throw WalletSettingsError.preservedSettings }
        try writePrivate(JSONEncoder().encode(settings), to: url)
    }
    public func saveRPC(_ input: String) throws {
        let endpoint = try Self.rpcEndpoint(input)
        let provider = endpoint.host == "mainnet.helius-rpc.com" ? "Helius" : "Custom RPC"
        let data = try JSONSerialization.data(withJSONObject: ["provider": provider, "rpcUrl": endpoint.absoluteString])
        try writePrivate(data, to: directory.appendingPathComponent("rpc-config.json"))
    }
    public static func rpcEndpoint(_ input: String) throws -> URL {
        let raw = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let components = URLComponents(string: raw), components.scheme == "https",
              let host = components.host, !host.isEmpty, components.user == nil,
              components.password == nil, components.fragment == nil, let endpoint = components.url else {
            throw WalletSettingsError.invalidEndpoint
        }
        return endpoint
    }
    private func writePrivate(_ data: Data, to destination: URL) throws {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true,
            attributes: [.posixPermissions: 0o700])
        let temporary = directory.appendingPathComponent(".settings-\(UUID().uuidString).tmp")
        defer { try? FileManager.default.removeItem(at: temporary) }
        let descriptor = open(temporary.path, O_WRONLY | O_CREAT | O_EXCL | O_CLOEXEC, mode_t(0o600))
        guard descriptor >= 0 else { throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO) }
        let file = FileHandle(fileDescriptor: descriptor, closeOnDealloc: true)
        try file.write(contentsOf: data)
        try file.close()
        guard rename(temporary.path, destination.path) == 0 else { throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO) }
    }
}
