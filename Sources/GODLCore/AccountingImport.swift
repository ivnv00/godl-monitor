import Darwin
import Foundation

/// This is an engine-checked file summary, not independent historical verification.
public struct AccountingAnchorReview: Codable, Equatable, Sendable {
    public let wallet: String
    public let sha256: String
    public let startedAt: String
    public let throughAt: String
    public let observedAt: String
    public let closingSlot: String
    public let earnedGodl: String
    public let netSpendSol: String
    public let netSpendUsd: String
    public let baselineBasis: String
    public let priceBasis: String
    public let caveats: [String]

    fileprivate func validate() throws {
        func require(_ valid: Bool) throws {
            if !valid { throw AccountingImportError.invalidResponse }
        }
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        func date(_ value: String) throws -> Date {
            guard value.range(of: "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{3}Z$", options: .regularExpression) != nil,
                  let parsed = iso.date(from: value), iso.string(from: parsed) == value else {
                throw AccountingImportError.invalidResponse
            }
            return parsed
        }
        let start = try date(startedAt), through = try date(throughAt), observed = try date(observedAt)
        try require(start <= through && through <= observed && observed <= Date())
        try require(closingSlot.range(of: "^(0|[1-9][0-9]*)$", options: .regularExpression) != nil)
        guard let slot = UInt64(closingSlot), slot <= 9_007_199_254_740_991 else { throw AccountingImportError.invalidResponse }
        func amount(_ value: String, places: Int, signed: Bool) throws {
            let pattern = "^\(signed ? "-?" : "")(0|[1-9][0-9]*)(\\.[0-9]{1,\(places)})?$"
            try require(value.utf8.count <= 64
                        && value.range(of: pattern, options: .regularExpression) == value.startIndex..<value.endIndex)
        }
        try amount(earnedGodl, places: 11, signed: false)
        try require(earnedGodl.contains(where: { "123456789".contains($0) }))
        try amount(netSpendSol, places: 9, signed: true)
        try amount(netSpendUsd, places: 6, signed: true)
        func validText(_ value: String) -> Bool { !value.isEmpty && value.utf16.count <= 3000 }
        try require(validText(baselineBasis) && validText(priceBasis)
                    && !caveats.isEmpty && caveats.count <= 10 && caveats.allSatisfy(validText))
    }
}

public struct AccountingImportResponse: Decodable, Sendable {
    public let schemaVersion: Int
    public let status: String
    public let review: AccountingAnchorReview?
    public let message: String?

    public static func decode(_ data: Data, expectedWallet: String, importing: Bool) throws -> Self {
        let response = try JSONDecoder().decode(Self.self, from: data)
        guard response.schemaVersion == 1 else { throw AccountingImportError.invalidResponse }
        if response.status == "error" { throw AccountingImportError.rejected(response.message ?? "The file could not be checked.") }
        guard response.status == (importing ? "imported" : "review"), let review = response.review,
              review.wallet == expectedWallet,
              review.sha256.utf8.count == 64,
              review.sha256.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil else {
            throw AccountingImportError.invalidResponse
        }
        try review.validate()
        return response
    }
}

public enum AccountingImportError: Error, LocalizedError {
    case unavailable, busy, timedOut, cancelled, invalidResponse, rejected(String)
    public var errorDescription: String? {
        switch self {
        case .unavailable: "The accounting helper is unavailable. Open a complete packaged app and try again."
        case .busy: "A file check is already running."
        case .timedOut: "The file check took too long. Existing accounting has been preserved. Try again."
        case .cancelled: "File check cancelled."
        case .invalidResponse: "The accounting helper returned an unreadable result. Existing accounting has been preserved."
        case .rejected(let message): message
        }
    }
}

/// Runs only the bundled offline helper. Output goes to a private temporary file
/// so a full pipe can never block the child or the main thread.
@MainActor
public final class AccountingImportClient {
    private var child: Process?
    private var timeoutTask: Task<Void, Never>?
    private var stopped: AccountingImportError?
    private let instanceLease: MonitorInstanceLease?
    public init(instanceLease: MonitorInstanceLease? = nil) { self.instanceLease = instanceLease }

    public func cancel() {
        guard let child, child.isRunning else { return }
        stopped = .cancelled
        kill(child.processIdentifier, SIGKILL)
    }

    public func run(executable: URL, arguments: [String], timeout: TimeInterval = 30) async throws -> Data {
        guard child == nil else { throw AccountingImportError.busy }
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("godl-import-\(UUID().uuidString)")
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: false,
                                                    attributes: [.posixPermissions: 0o700])
            let output = directory.appendingPathComponent("result.json")
            guard FileManager.default.createFile(atPath: output.path, contents: nil, attributes: [.posixPermissions: 0o600]) else {
                throw AccountingImportError.unavailable
            }
            let handle = try FileHandle(forWritingTo: output)
            defer { try? handle.close() }
            let process = Process()
            process.executableURL = executable
            process.arguments = arguments
            process.environment = ProcessInfo.processInfo.environment.filter { !["NODE_OPTIONS", "NODE_PATH"].contains($0.key) }
            process.standardInput = FileHandle.nullDevice
            process.standardOutput = handle
            process.standardError = FileHandle.nullDevice
            stopped = nil
            child = process
            let status: Int32 = try await withCheckedThrowingContinuation { continuation in
                process.terminationHandler = { process in
                    continuation.resume(returning: process.terminationStatus)
                }
                do {
                    if let instanceLease { try instanceLease.run(process) }
                    else { try process.run() }
                }
                catch { process.terminationHandler = nil; continuation.resume(throwing: AccountingImportError.unavailable); return }
                timeoutTask = Task { [weak self] in
                    do { try await Task.sleep(for: .seconds(timeout)) } catch { return }
                    guard let self, self.child === process, process.isRunning else { return }
                    self.stopped = .timedOut
                    kill(process.processIdentifier, SIGKILL)
                }
            }
            if let stopped { throw stopped }
            guard status == 0 || status == 1 else { throw AccountingImportError.invalidResponse }
            let reader = try FileHandle(forReadingFrom: output)
            defer { try? reader.close() }
            let bytes = try reader.read(upToCount: 262_145) ?? Data()
            guard !bytes.isEmpty, bytes.count <= 262_144 else { throw AccountingImportError.invalidResponse }
            finish(directory)
            return bytes
        } catch {
            finish(directory)
            throw (error as? AccountingImportError) ?? .unavailable
        }
    }

    private func finish(_ directory: URL) {
        timeoutTask?.cancel()
        timeoutTask = nil
        child = nil
        try? FileManager.default.removeItem(at: directory)
    }
}
