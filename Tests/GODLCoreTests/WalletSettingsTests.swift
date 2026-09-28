import Foundation
import XCTest
@testable import GODLCore

final class WalletSettingsTests: XCTestCase {
    // Synthetic 32-byte addresses, not a user's account.
    private let first = String(repeating: "1", count: 32)
    private let second = String(repeating: "1", count: 31) + "2"
    func testValidatesDecodedLengthAndRejectsSecretsPathsAndURLs() throws {
        XCTAssertEqual(try WalletSettings.validateAddress(" \(first)\n"), first)
        XCTAssertEqual(try WalletSettings.validateAddress(second), second)
        for invalid in [String(repeating: "1", count: 31), String(repeating: "1", count: 33), String(repeating: "z", count: 44),
                        "https://example.com", "../somewhere", "a recovery phrase is never a public address", String(repeating: "0", count: 32)] {
            XCTAssertThrowsError(try WalletSettings(wallet: invalid))
        }
    }
    func testProfilesAreIsolatedAndLegacyDirectoryStaysInPlace() throws {
        let root = URL(fileURLWithPath: "/temporary/example")
        let legacy = try WalletSettings(wallet: first, legacyWallet: first)
        let other = try WalletSettings(wallet: second, legacyWallet: first)
        XCTAssertEqual(legacy.dataDirectory(in: root), root)
        XCTAssertNotEqual(other.dataDirectory(in: root), root)
        XCTAssertNotEqual(other.dataDirectory(in: root), try WalletSettings(wallet: first).dataDirectory(in: root))
        XCTAssertEqual(other.dataDirectory(in: root).lastPathComponent, second)
    }
    func testPrivateRoundTripAndFailClosedDecode() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = WalletSettingsStore(directory: directory)
        XCTAssertNil(try store.load())
        let settings = try WalletSettings(wallet: second, legacyWallet: first)
        try store.save(settings)
        XCTAssertEqual(try store.load(), settings)
        XCTAssertEqual((try FileManager.default.attributesOfItem(atPath: store.url.path)[.posixPermissions] as? NSNumber)?.intValue, 0o600)
        for invalid in ["broken", "{\"version\":2,\"wallet\":\"\(first)\"}", "{\"version\":1,\"wallet\":\"../escape\"}"] {
            let bytes = Data(invalid.utf8)
            try bytes.write(to: store.url)
            XCTAssertThrowsError(try store.load())
            XCTAssertEqual(try Data(contentsOf: store.url), bytes)
        }
    }
    func testRPCRequiresHTTPSAndPrivateFile() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = WalletSettingsStore(directory: directory)
        for invalid in ["http://example.com", "https://name:password@example.com", "https://example.com/#fragment", "not a URL"] {
            XCTAssertThrowsError(try store.saveRPC(invalid))
        }
        try store.saveRPC("https://example.invalid/?api-key=SYNTHETIC_TEST_ONLY")
        let url = directory.appendingPathComponent("rpc-config.json")
        XCTAssertEqual((try FileManager.default.attributesOfItem(atPath: url.path)[.posixPermissions] as? NSNumber)?.intValue, 0o600)
        XCTAssertEqual(try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String:String],
            ["provider":"Custom RPC", "rpcUrl":"https://example.invalid/?api-key=SYNTHETIC_TEST_ONLY"])
    }
}
