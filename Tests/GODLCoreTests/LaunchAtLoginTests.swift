import Foundation
import XCTest
@testable import GODLCore

@MainActor
private final class LoginItemStub: LoginItemService {
    var status: LoginItemStatus = .off
    var registeredStatus: LoginItemStatus = .enabled
    var unregisteredStatus: LoginItemStatus = .off
    var error: Error?
    var applyBeforeError = false
    var registrations = 0, removals = 0, settingsOpened = 0
    var pauseRemoval = false
    var continuation: CheckedContinuation<Void, Never>?

    func register() throws {
        registrations += 1
        if applyBeforeError || error == nil { status = registeredStatus }
        if let error { throw error }
    }
    func unregister() async throws {
        removals += 1
        if pauseRemoval { await withCheckedContinuation { continuation = $0 } }
        if applyBeforeError || error == nil { status = unregisteredStatus }
        if let error { throw error }
    }
    func openSettings() { settingsOpened += 1 }
}

@MainActor
final class LaunchAtLoginTests: XCTestCase {
    func testInitializationAndRefreshNeverRegisterOrChangeOSPreference() {
        for state in LoginItemStatus.allCases {
            let service = LoginItemStub(); service.status = state
            let model = LaunchAtLoginController(service: service)
            model.refresh()
            XCTAssertEqual(model.status, state)
            XCTAssertEqual(service.registrations + service.removals + service.settingsOpened, 0)
        }
    }

    func testExplicitEnableDisableAndRepeatedChoicesUseActualState() async {
        let service = LoginItemStub(), model: LaunchAtLoginController
        model = LaunchAtLoginController(service: service)
        await model.setEnabled(true)
        XCTAssertEqual(model.status, .enabled)
        XCTAssertNil(model.errorMessage)
        await model.setEnabled(true)
        XCTAssertEqual(service.registrations, 1)
        await model.setEnabled(false)
        XCTAssertEqual(model.status, .off)
        await model.setEnabled(false)
        XCTAssertEqual(service.removals, 1)
        XCTAssertFalse(model.isUpdating)
    }

    func testApprovalIsDistinctAndDoesNotReregisterAfterDenial() async {
        let service = LoginItemStub(); service.registeredStatus = .requiresApproval
        let model = LaunchAtLoginController(service: service)
        await model.setEnabled(true)
        XCTAssertEqual(model.status, .requiresApproval)
        XCTAssertNil(model.errorMessage)
        await model.setEnabled(true)
        model.refresh()
        XCTAssertEqual(service.registrations, 1)
        model.openSettings()
        XCTAssertEqual(service.settingsOpened, 1)
        await model.setEnabled(false)
        XCTAssertEqual(service.removals, 1)
        XCTAssertEqual(model.status, .off)
    }

    func testExternalOSChangesAreRespectedAndRefreshedBeforeMutation() async {
        let service = LoginItemStub(), model: LaunchAtLoginController
        model = LaunchAtLoginController(service: service)
        service.status = .enabled
        await model.setEnabled(true)
        XCTAssertEqual(service.registrations, 0)
        XCTAssertEqual(model.status, .enabled)
        service.status = .requiresApproval
        model.refresh()
        XCTAssertEqual(model.status, .requiresApproval)
        service.status = .off
        model.refresh()
        XCTAssertEqual(model.status, .off)
        XCTAssertEqual(service.registrations + service.removals, 0)
    }

    func testFailuresPreserveActualStateAndNeverEchoSystemDetails() async {
        let service = LoginItemStub()
        service.error = NSError(domain: "synthetic", code: 1,
            userInfo: [NSLocalizedDescriptionKey: "/private/SYNTHETIC_INSTALL_PATH"])
        let model = LaunchAtLoginController(service: service)
        await model.setEnabled(true)
        XCTAssertEqual(model.status, .off)
        XCTAssertNotNil(model.errorMessage)
        XCTAssertFalse(model.errorMessage!.contains("SYNTHETIC"))
        service.status = .enabled
        model.refresh()
        XCTAssertNil(model.errorMessage)
        await model.setEnabled(false)
        XCTAssertEqual(model.status, .enabled)
        XCTAssertNotNil(model.errorMessage)
        XCTAssertFalse(model.errorMessage!.contains("SYNTHETIC"))
        XCTAssertFalse(model.isUpdating)
    }

    func testReadBackWinsOverReturnValueWithoutFalseSuccess() async {
        let service = LoginItemStub(); service.registeredStatus = .off
        let model = LaunchAtLoginController(service: service)
        await model.setEnabled(true)
        XCTAssertEqual(model.status, .off)
        XCTAssertNotNil(model.errorMessage)
        service.registeredStatus = .requiresApproval
        service.applyBeforeError = true
        service.error = CocoaError(.executableNotLoadable)
        await model.setEnabled(true)
        XCTAssertEqual(model.status, .requiresApproval)
        XCTAssertNil(model.errorMessage)
        service.unregisteredStatus = .enabled
        await model.setEnabled(false)
        XCTAssertEqual(model.status, .enabled)
        XCTAssertNotNil(model.errorMessage)
    }

    func testPendingRemovalSerializesMutationAndSurvivesRefresh() async throws {
        let service = LoginItemStub(); service.status = .enabled; service.pauseRemoval = true
        let model = LaunchAtLoginController(service: service)
        let removal = Task { await model.setEnabled(false) }
        for _ in 0..<100 where service.continuation == nil { await Task.yield() }
        let continuation = try XCTUnwrap(service.continuation)
        XCTAssertTrue(model.isUpdating)
        model.refresh()
        await model.setEnabled(false)
        await model.setEnabled(true)
        XCTAssertEqual(service.removals, 1)
        XCTAssertEqual(service.registrations, 0)
        continuation.resume()
        await removal.value
        XCTAssertFalse(model.isUpdating)
        XCTAssertEqual(model.status, .off)
        XCTAssertNil(model.errorMessage)
    }

    func testUnavailableServiceDoesNotAttemptRegistrationOrRemoval() async {
        let service = LoginItemStub(); service.status = .unavailable
        let model = LaunchAtLoginController(service: service)
        await model.setEnabled(true)
        await model.setEnabled(false)
        XCTAssertEqual(service.registrations + service.removals, 0)
        XCTAssertEqual(model.status, .unavailable)
        XCTAssertFalse(model.isUpdating)
    }
}
