import Foundation
import XCTest
@testable import GODLCore

final class RuntimeFailureTests: XCTestCase {
    func testOnlyKnownVersionedCodesDriveDisplayCopy() throws {
        for code in RuntimeFailure.allCases {
            let data = try JSONSerialization.data(withJSONObject: ["schemaVersion": 1,
                "kind": "godl-runtime-failure", "code": code.rawValue,
                "message": "SYNTHETIC_SECRET_MUST_NOT_DISPLAY"])
            let decoded = RuntimeFailure.decode(stderr: "Node runtime warning\n" + String(decoding: data, as: UTF8.self) + "\n")
            XCTAssertEqual(decoded, code)
            XCTAssertFalse(decoded.message.contains("SYNTHETIC_SECRET"))
        }
    }

    func testUnknownLegacyMalformedAndOversizedOutputStaysGeneric() {
        for raw in ["Provider rejected SYNTHETIC_SECRET", "", "{}",
            #"{"schemaVersion":2,"kind":"godl-runtime-failure","code":"accessDenied"}"#,
            #"{"schemaVersion":1,"kind":"wrong","code":"accessDenied"}"#,
            #"{"schemaVersion":1,"kind":"godl-runtime-failure","code":"SYNTHETIC_SECRET"}"#,
            String(repeating: "SYNTHETIC_SECRET", count: 1_000)] {
            XCTAssertEqual(RuntimeFailure.decode(stderr: raw), .unexpected)
        }
    }

    private func accounting(state: String, code: String? = nil) throws -> AccountingStatus {
        var data: [String: Any] = ["state": state, "checkedAt": 100, "verifiedAt": 99,
            "verifiedThroughSlot": "42", "reason": "SYNTHETIC_SECRET_OLD_PROVIDER_BODY"]
        if let code { data["failureCode"] = code }
        return try JSONDecoder().decode(AccountingStatus.self, from: JSONSerialization.data(withJSONObject: data))
    }

    func testOldCheckpointsRemainReadableWithoutDisplayingProviderText() throws {
        for state in ["current", "waiting", "retrying", "blocked"] {
            let status = try accounting(state: state)
            XCTAssertEqual(status.verifiedThroughSlot, "42")
            XCTAssertFalse(status.displayReason.contains("SYNTHETIC_SECRET"))
        }
        XCTAssertEqual(try accounting(state: "retrying", code: "rateLimited").failure, .rateLimited)
        XCTAssertEqual(try accounting(state: "retrying", code: "futureCode").failure, .unexpected)
        XCTAssertNil(try accounting(state: "current", code: "accessDenied").failure)
    }
}
