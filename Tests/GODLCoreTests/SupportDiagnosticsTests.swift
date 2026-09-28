import Foundation
import XCTest
@testable import GODLCore

final class SupportDiagnosticsTests: XCTestCase {
    private func report(version: String? = "0.2.9", build: String? = "11",
                        os: OperatingSystemVersion = .init(majorVersion: 14, minorVersion: 7, patchVersion: 1),
                        accounting: SupportDiagnostics.Accounting = .notSetUp,
                        login: LoginItemStatus = .off) -> String {
        SupportDiagnostics(appVersion: version, build: build, osVersion: os, architecture: .appleSilicon,
            profile: .ready, runtimePresent: true, savedRPCConfiguration: true,
            observation: .stale, quotes: .expired, accounting: accounting, notifications: .denied, launchAtLogin: login).text
    }

    func testReportHasOnlyTheDocumentedFieldsAndFixedStatuses() {
        XCTAssertEqual(report(), """
        GODL Monitor diagnostics · format 2
        App: 0.2.9 (build 11)
        macOS: 14.7.1
        Architecture: Apple silicon (arm64 process)
        Profile: Configured
        Bundled runtime: Present
        RPC configuration: Saved endpoint
        Observations: Stale
        Quotes: Expired
        Accounting: Not set up
        Notifications: Denied
        Launch at login: Off

        Status only; does not verify earnings.
        """)
    }

    func testUntrustedVersionMetadataCannotInjectPrivateDataOrExtraLines() {
        let invalid = ["https://example.invalid/?api-key=SYNTHETIC_TEST_ONLY", "/temporary/private-profile",
                       String(repeating: "1", count: 32), "0.2.9\nWallet: synthetic", "0.2.9\n", "0.2.9\r",
                       "0.2.9\0", "", ".1", "1.", "1..2", "1.2.3.4.5", "١٢", "1e6", "-1", "1.0-beta",
                       String(repeating: "9", count: 10000)]
        for value in invalid {
            let text = report(version: value, build: value)
            XCTAssertTrue(text.contains("App: Unknown (build Unknown)"))
            XCTAssertEqual(text.components(separatedBy: "\n").count, 14)
        }
        XCTAssertTrue(report(version: nil, build: nil).contains("App: Unknown (build Unknown)"))
        XCTAssertTrue(report(build: "1.2").contains("(build Unknown)"))
    }

    func testUnknownAccountingStateDoesNotCopyRawErrorsOrProviderResponses() {
        for value in ["https://example.invalid/?api-key=SYNTHETIC_TEST_ONLY", "wallet=synthetic", "current\nprivate", ""] {
            let state = SupportDiagnostics.Accounting(engineState: value)
            XCTAssertEqual(state, .needsAttention)
            XCTAssertTrue(report(accounting: state).contains("Accounting: Needs attention"))
        }
        XCTAssertEqual(SupportDiagnostics.Accounting(engineState: nil), .unavailable)
        XCTAssertEqual(SupportDiagnostics.Accounting(engineState: "current"), .current)
        XCTAssertEqual(SupportDiagnostics.Accounting(engineState: "waiting"), .waiting)
        XCTAssertEqual(SupportDiagnostics.Accounting(engineState: "retrying"), .retrying)
    }

    func testFirstRunUnavailableStatesRemainDistinctFromHealthyStates() {
        let text = SupportDiagnostics(appVersion: nil, build: nil,
            osVersion: .init(majorVersion: 27, minorVersion: 0, patchVersion: 0), architecture: .intel,
            profile: .notSetUp, runtimePresent: false, savedRPCConfiguration: false,
            observation: .none, quotes: .unavailable, accounting: .notSetUp, notifications: .permissionNeeded).text
        for expected in ["Intel (x86_64 process)", "Profile: Not set up", "Bundled runtime: Missing",
                         "RPC configuration: Public default", "Observations: No observations",
                         "Quotes: Unavailable", "Accounting: Not set up", "Notifications: Permission needed"] {
            XCTAssertTrue(text.contains(expected), expected)
        }
    }

    func testInvalidOSVersionIsUnavailableInsteadOfLeakingAnUnboundedValue() {
        for os in [OperatingSystemVersion(majorVersion: -1, minorVersion: 0, patchVersion: 0),
                   OperatingSystemVersion(majorVersion: 14, minorVersion: Int.max, patchVersion: 0)] {
            XCTAssertTrue(report(os: os).contains("macOS: Unknown"))
        }
    }

    func testLoginItemDiagnosticsUseOnlyFixedStates() {
        for status in LoginItemStatus.allCases {
            let text = report(login: status)
            XCTAssertTrue(text.contains("Launch at login: \(status.rawValue)"))
            XCTAssertEqual(text.components(separatedBy: "\n").count, 14)
        }
    }
}
