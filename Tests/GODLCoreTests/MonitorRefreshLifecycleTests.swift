import XCTest
@testable import GODLCore

final class MonitorRefreshLifecycleTests: XCTestCase {
    func testKnownUnsupportedAccountingRevisionStopsOnlyAutomaticRetries() {
        let program = "mineWsRs2Rmw2jPMkVbgAbDjV1E23yQ8TEodaX3iza4"
        let current = "8cbbc86341445d11e3779dfd5be9363474d75683"
        let old = "4b7bb4c6619d25f52ef9152de906a46027995143"
        XCTAssertFalse(MonitorRefreshLifecycle.shouldReconcileAccounting(automatic: true,
            program: program, source: current, accountingSource: old))
        XCTAssertTrue(MonitorRefreshLifecycle.shouldReconcileAccounting(automatic: false,
            program: program, source: current, accountingSource: old))
        for source in [nil, current, "future-supported-source"] {
            XCTAssertTrue(MonitorRefreshLifecycle.shouldReconcileAccounting(automatic: true,
                program: program, source: current, accountingSource: source))
        }
        XCTAssertTrue(MonitorRefreshLifecycle.shouldReconcileAccounting(automatic: true,
            program: "another-program", source: current, accountingSource: old))
    }

    func testExplicitRefreshDuringActiveWorkQueuesExactlyOneFollowUp() {
        var lifecycle = MonitorRefreshLifecycle()
        XCTAssertTrue(lifecycle.begin(.observation))
        for _ in 0..<3 {
            XCTAssertFalse(lifecycle.begin(.observation, queueIfBusy: true))
        }
        XCTAssertTrue(lifecycle.finish(.observation))
        XCTAssertTrue(lifecycle.begin(.observation))
        XCTAssertFalse(lifecycle.finish(.observation))
    }

    func testPeriodicTicksDoNotCreateContinuousCatchUpWork() {
        var lifecycle = MonitorRefreshLifecycle()
        XCTAssertTrue(lifecycle.begin(.observation))
        XCTAssertFalse(lifecycle.begin(.observation, queueIfBusy: false))
        XCTAssertFalse(lifecycle.finish(.observation))
    }

    func testQueuedRefreshCannotRestartAfterStopOrDuringSleep() {
        var lifecycle = MonitorRefreshLifecycle()
        XCTAssertTrue(lifecycle.begin(.observation))
        XCTAssertFalse(lifecycle.begin(.observation, queueIfBusy: true))
        lifecycle.willSleep()
        XCTAssertFalse(lifecycle.finish(.observation))
        XCTAssertFalse(lifecycle.begin(.observation, queueIfBusy: true))
        lifecycle.stop()
        XCTAssertFalse(lifecycle.didWake())
        XCTAssertFalse(lifecycle.begin(.observation))
    }

    func testSleepPausesBothChannelsAndWakeRequestsEachOnce() {
        var lifecycle = MonitorRefreshLifecycle()
        lifecycle.willSleep()
        XCTAssertFalse(lifecycle.begin(.observation))
        XCTAssertFalse(lifecycle.begin(.accounting))
        XCTAssertTrue(lifecycle.didWake())
        XCTAssertFalse(lifecycle.didWake(), "Repeated wake notifications must not enqueue more work")
        for channel in MonitorRefreshLifecycle.Channel.allCases {
            XCTAssertTrue(lifecycle.begin(channel))
            XCTAssertFalse(lifecycle.begin(channel), "Only one helper per channel")
            XCTAssertFalse(lifecycle.finish(channel), "No extra follow-up after a post-wake refresh")
        }
    }

    func testWakeDuringActiveHelpersQueuesOneFollowUpPerChannel() {
        var lifecycle = MonitorRefreshLifecycle()
        XCTAssertTrue(lifecycle.begin(.observation))
        XCTAssertTrue(lifecycle.begin(.accounting))
        for _ in 0..<3 {
            lifecycle.willSleep()
            XCTAssertTrue(lifecycle.didWake())
            XCTAssertFalse(lifecycle.begin(.observation))
            XCTAssertFalse(lifecycle.begin(.accounting))
        }
        for channel in MonitorRefreshLifecycle.Channel.allCases {
            XCTAssertTrue(lifecycle.finish(channel))
            XCTAssertTrue(lifecycle.begin(channel))
            XCTAssertFalse(lifecycle.finish(channel))
        }
    }

    func testCompletionDuringAnotherSleepWaitsForWake() {
        var lifecycle = MonitorRefreshLifecycle()
        XCTAssertTrue(lifecycle.begin(.observation))
        lifecycle.willSleep()
        XCTAssertTrue(lifecycle.didWake())
        lifecycle.willSleep()
        XCTAssertFalse(lifecycle.finish(.observation))
        XCTAssertFalse(lifecycle.begin(.observation))
        XCTAssertTrue(lifecycle.didWake())
        XCTAssertTrue(lifecycle.begin(.observation))
        XCTAssertFalse(lifecycle.finish(.observation))
    }

    func testStoppedMonitorCannotRestartFromLateCallbacksOrWake() {
        var lifecycle = MonitorRefreshLifecycle()
        XCTAssertTrue(lifecycle.begin(.accounting))
        lifecycle.willSleep()
        XCTAssertTrue(lifecycle.didWake())
        lifecycle.stop()
        XCTAssertFalse(lifecycle.finish(.accounting))
        lifecycle.willSleep()
        XCTAssertFalse(lifecycle.didWake())
        XCTAssertFalse(lifecycle.begin(.observation))
        XCTAssertFalse(lifecycle.begin(.accounting))
    }

    func testFailedOrCompletedAttemptCanRetryNormally() {
        var lifecycle = MonitorRefreshLifecycle()
        for _ in 0..<3 {
            XCTAssertTrue(lifecycle.begin(.observation))
            XCTAssertFalse(lifecycle.finish(.observation))
        }
        XCTAssertFalse(lifecycle.finish(.accounting), "An idle channel has no completion work")
    }
}
