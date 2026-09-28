import Foundation
import XCTest
@testable import GODLCore

final class AccountingImportTests: XCTestCase {
    private let wallet = String(repeating: "1", count: 32)
    private func response(status: String = "review", wallet: String? = nil) throws -> Data {
        try JSONSerialization.data(withJSONObject: ["schemaVersion": 1, "status": status, "review": [
            "wallet": wallet ?? self.wallet, "sha256": String(repeating: "a", count: 64),
            "startedAt": "2026-01-02T09:00:00.000Z", "throughAt": "2026-01-02T09:30:00.000Z",
            "observedAt": "2026-01-02T10:00:00.000Z", "closingSlot": "20",
            "earnedGodl": "10.00000000000", "netSpendSol": "0.100005000", "netSpendUsd": "10.000500",
            "baselineBasis": "Synthetic reviewed opening", "priceBasis": "Synthetic historical prices", "caveats": ["Synthetic scope"]
        ]])
    }

    func testReviewPreservesExactAmountsAndRejectsWrongWalletOrOperation() throws {
        let data = try response()
        let value = try AccountingImportResponse.decode(data, expectedWallet: wallet, importing: false)
        XCTAssertEqual(value.review?.netSpendUsd, "10.000500")
        XCTAssertEqual(value.review?.earnedGodl, "10.00000000000")
        XCTAssertThrowsError(try AccountingImportResponse.decode(data, expectedWallet: "wrong", importing: false))
        XCTAssertThrowsError(try AccountingImportResponse.decode(data, expectedWallet: wallet, importing: true))
        XCTAssertEqual(try AccountingImportResponse.decode(response(status: "imported"), expectedWallet: wallet, importing: true).status, "imported")
        for invalid in ["{}", "broken", "{\"schemaVersion\":2,\"status\":\"review\"}", "{\"schemaVersion\":1,\"status\":\"review\"}"] {
            XCTAssertThrowsError(try AccountingImportResponse.decode(Data(invalid.utf8), expectedWallet: wallet, importing: false))
        }
    }

    func testHelperFailureIsNotAcceptedAsAReview() {
        let bytes = Data(#"{"schemaVersion":1,"status":"error","message":"Wrong wallet."}"#.utf8)
        XCTAssertThrowsError(try AccountingImportResponse.decode(bytes, expectedWallet: wallet, importing: false)) { error in
            XCTAssertEqual(error.localizedDescription, "Wrong wallet.")
        }
    }

    @MainActor func testRunnerDrainsLargeOutputWithoutBlockingAndLimitsResultSize() async throws {
        let client = AccountingImportClient()
        let text = String(repeating: "a", count: 40_000)
        let bytes = try await client.run(executable: URL(fileURLWithPath: "/usr/bin/printf"), arguments: ["%s", text])
        XCTAssertEqual(bytes, Data(text.utf8))
        do {
            _ = try await client.run(executable: URL(fileURLWithPath: "/bin/sh"), arguments: ["-c", "dd if=/dev/zero bs=1024 count=257 2>/dev/null"])
            XCTFail("Oversized output must be rejected")
        } catch { XCTAssertEqual(error.localizedDescription, AccountingImportError.invalidResponse.localizedDescription) }
    }

    @MainActor func testRunnerTimesOutAndCanBeReusedAfterFailures() async throws {
        let client = AccountingImportClient()
        do {
            _ = try await client.run(executable: URL(fileURLWithPath: "/bin/sleep"), arguments: ["5"], timeout: 0.05)
            XCTFail("Expected timeout")
        } catch { XCTAssertEqual(error.localizedDescription, AccountingImportError.timedOut.localizedDescription) }
        do {
            _ = try await client.run(executable: URL(fileURLWithPath: "/nonexistent-synthetic-helper"), arguments: [])
            XCTFail("Expected launch failure")
        } catch { XCTAssertEqual(error.localizedDescription, AccountingImportError.unavailable.localizedDescription) }
        let data = try await client.run(executable: URL(fileURLWithPath: "/usr/bin/printf"), arguments: ["%s", "ready"])
        XCTAssertEqual(String(decoding: data, as: UTF8.self), "ready")
    }

    @MainActor func testRunnerCancellationFinishesWithoutLeavingBusyState() async throws {
        let client = AccountingImportClient()
        let pending = Task { try await client.run(executable: URL(fileURLWithPath: "/bin/sleep"), arguments: ["5"]) }
        try await Task.sleep(for: .milliseconds(50))
        client.cancel()
        do { _ = try await pending.value; XCTFail("Expected cancellation") }
        catch { XCTAssertEqual(error.localizedDescription, AccountingImportError.cancelled.localizedDescription) }
        let bytes = try await client.run(executable: URL(fileURLWithPath: "/usr/bin/printf"), arguments: ["%s", "ready"])
        XCTAssertEqual(bytes.count, 5)
    }
}
