import Foundation
import XCTest
@testable import GODLCore

@MainActor
final class EarningsHistoryTests: XCTestCase {
    private let now = ISO8601DateFormatter().date(from: "2026-10-11T12:00:00Z")!

    func testCalendarWindowsCrossDSTLeapDayAndYear() throws {
        for (end, start, zone) in [("2026-03-30", "2026-03-24", "Europe/Sofia"),
                                   ("2026-11-02", "2026-10-27", "America/New_York"),
                                   ("2024-03-02", "2024-02-25", "Europe/Sofia"),
                                   ("2027-01-03", "2026-12-28", "Pacific/Auckland")] {
            let window = try EarningsHistoryWindow(endDay: end, timeZone: zone, today: end, historyStartDay: nil)
            XCTAssertEqual(window.startDay, start)
            XCTAssertEqual(window.days.count, 7)
            XCTAssertFalse(window.hasLater)
        }
        for day in ["2026-02-29", "2026-13-01", "2026-2-01"] {
            XCTAssertThrowsError(try EarningsHistoryWindow(endDay: day, timeZone: "UTC", today: "2026-12-31", historyStartDay: nil))
        }
    }

    func testEarliestPageCanIncludeUnknownDaysBeforeAnchor() throws {
        let window = try EarningsHistoryWindow(endDay: "2026-10-04", timeZone: "Europe/Sofia", today: "2026-10-11", historyStartDay: "2026-10-01")
        XCTAssertEqual(window.startDay, "2026-09-28")
        XCTAssertFalse(window.hasEarlier)
        XCTAssertTrue(window.hasLater)
        let controller = EarningsHistoryController()
        controller.configure(try monitor(anchor: "2026-10-01"), now: now)
        controller.previous(now: now)
        XCTAssertEqual(controller.selectedEndDay, "2026-10-04")
        controller.previous(now: now)
        XCTAssertEqual(controller.selectedEndDay, "2026-10-04")
        controller.next(now: now)
        XCTAssertNil(controller.selectedEndDay)
        controller.stop()
    }

    func testDecoderAcceptsOnlyExactIdentityRequestAndCanonicalProvenance() throws {
        let view = try monitor()
        let valid = try response(endDay: "2026-10-04")
        XCTAssertEqual(try EarningsHistoryResponse.decode(valid, monitor: view, endDay: "2026-10-04", now: now).days.count, 7)
        for (key, value) in [("wallet", "other"), ("genesisHash", "other"), ("programAddress", "other"),
                             ("sourceCommit", "other"), ("commitment", "processed"), ("slot", "0100"),
                             ("slot", "99"), ("slot", "18446744073709551616"), ("endDay", "2026-10-03"),
                             ("observedAt", "2026-10-11T11:59:59.000Z"), ("observedAt", "2026-10-11T12:00:06.000Z"),
                             ("observedAt", "2026-10-11T12:00:00Z")] {
            XCTAssertThrowsError(try EarningsHistoryResponse.decode(try altered(valid) { $0[key] = value }, monitor: view, endDay: "2026-10-04", now: now), key)
        }
        XCTAssertThrowsError(try EarningsHistoryResponse.decode(valid, monitor: view, endDay: "2026-10-12", now: now))
    }

    func testDecoderRejectsWrongOrderMissingDaysInvalidMoneyAndOutOfDayBoundaries() throws {
        let valid = try response(endDay: "2026-10-04")
        let view = try monitor()
        let mutations: [(inout [String: Any]) -> Void] = [
            { $0["timeZone"] = "UTC" },
            { $0["historyStartDay"] = "2026-02-29" },
            { $0["historyStartDay"] = "2026-10-12" },
            { var days = $0["days"] as! [[String: Any]]; days.removeLast(); $0["days"] = days },
            { $0["days"] = Array(($0["days"] as! [[String: Any]]).reversed()) },
            { var days = $0["days"] as! [[String: Any]]; days[0]["day"] = "2026-10-05"; $0["days"] = days },
            { var days = $0["days"] as! [[String: Any]]; days[0]["netSpendUsd"] = "NaN"; $0["days"] = days },
            { var days = $0["days"] as! [[String: Any]]; days[0].merge(["fromAt": "2026-10-03T20:00:00.000Z", "throughAt": "2026-10-04T12:00:00.000Z", "fromSlot": "90", "throughSlot": "100", "coverage": "partial"]) { _, new in new }; $0["days"] = days },
            { var days = $0["days"] as! [[String: Any]]; days[0].merge(["fromAt": "2026-10-04T12:00:00.000Z", "throughAt": "2026-10-04T21:00:00.000Z", "fromSlot": "90", "throughSlot": "100", "coverage": "partial"]) { _, new in new }; $0["days"] = days }
        ]
        for mutation in mutations {
            let data = try altered(valid) { root in var earnings = root["earnings"] as! [String: Any]; mutation(&earnings); root["earnings"] = earnings }
            XCTAssertThrowsError(try EarningsHistoryResponse.decode(data, monitor: view, endDay: "2026-10-04", now: now))
        }
    }

    func testLoadFailureRetryAndLatestDoNotBorrowLiveData() async throws {
        let controller = EarningsHistoryController()
        let view = try monitor()
        controller.configure(view, now: now)
        XCTAssertEqual(controller.displayedEarnings, view.earnings)
        controller.load = { _, _ in throw MonitorLoadError.invalidEarnings }
        controller.previous(now: now)
        XCTAssertNil(controller.displayedEarnings)
        await settle(controller)
        XCTAssertNotNil(controller.error)
        XCTAssertEqual(controller.selectedEndDay, "2026-10-04")
        let data = try response(endDay: "2026-10-04")
        controller.load = { _, _ in data }
        controller.retry()
        await settle(controller)
        XCTAssertNil(controller.error)
        XCTAssertEqual(controller.displayedEarnings?.days.first?.day, "2026-10-04")
        controller.latest()
        XCTAssertEqual(controller.displayedEarnings, view.earnings)
    }

    func testOutOfOrderResponsesStopAndIdentityChangeCannotPublish() async throws {
        let controller = EarningsHistoryController()
        var completions: [String: CheckedContinuation<Data, Error>] = [:]
        controller.load = { day, _ in try await withCheckedThrowingContinuation { completions[day] = $0 } }
        controller.configure(try monitor(), now: now)
        controller.previous(now: now)
        while completions["2026-10-04"] == nil { await Task.yield() }
        controller.previous(now: now)
        while completions["2026-09-27"] == nil { await Task.yield() }
        completions.removeValue(forKey: "2026-09-27")!.resume(returning: try response(endDay: "2026-09-27"))
        await settle(controller)
        completions.removeValue(forKey: "2026-10-04")!.resume(returning: try response(endDay: "2026-10-04"))
        for _ in 0..<20 { await Task.yield() }
        XCTAssertEqual(controller.earnings?.days.first?.day, "2026-09-27")
        controller.previous(now: now)
        while completions["2026-09-20"] == nil { await Task.yield() }
        controller.configure(try monitor(wallet: "fixture-other"), now: now)
        completions.removeValue(forKey: "2026-09-20")!.resume(returning: try response(endDay: "2026-09-20"))
        for _ in 0..<20 { await Task.yield() }
        XCTAssertNil(controller.selectedEndDay)
        XCTAssertNil(controller.earnings)
        controller.previous(now: now)
        while completions["2026-10-04"] == nil { await Task.yield() }
        controller.stop()
        completions.removeValue(forKey: "2026-10-04")!.resume(returning: try response(endDay: "2026-10-04"))
        for _ in 0..<20 { await Task.yield() }
        XCTAssertNil(controller.earnings)
        XCTAssertFalse(controller.isLoading)
    }

    func testContextChangesRefetchButObservationTicksDoNot() async throws {
        let controller = EarningsHistoryController()
        var calls = 0
        let data = try response(endDay: "2026-10-04")
        controller.load = { _, _ in calls += 1; return data }
        controller.configure(try monitor(), now: now)
        controller.previous(now: now)
        await settle(controller)
        controller.configure(try monitor(observed: now.addingTimeInterval(1)), now: now.addingTimeInterval(1))
        XCTAssertEqual(calls, 1)
        controller.configure(try monitor(totalReason: "Revised accounting"), now: now)
        XCTAssertNil(controller.displayedEarnings)
        await settle(controller)
        XCTAssertEqual(calls, 2)
        controller.configure(try monitor(zone: "UTC"), now: now)
        XCTAssertNil(controller.selectedEndDay)
        XCTAssertNil(controller.earnings)
    }

    func testNewDayKeepsHistoricalSelectionAndHidesStaleLatestDays() async throws {
        let controller = EarningsHistoryController()
        controller.configure(try monitor(), now: now)
        controller.configure(try monitor(), now: now.addingTimeInterval(86400))
        XCTAssertEqual(controller.window.endDay, "2026-10-12")
        XCTAssertNil(controller.displayedEarnings)
        controller.previous(now: now.addingTimeInterval(86400))
        XCTAssertEqual(controller.selectedEndDay, "2026-10-05")
        controller.configure(try monitor(), now: now.addingTimeInterval(172800))
        XCTAssertEqual(controller.window.endDay, "2026-10-05")
        controller.stop()
    }

    func testMissingAnchorDisablesEarlierAndFutureAnchorCannotCrashWindow() throws {
        let controller = EarningsHistoryController()
        controller.configure(try monitor(anchor: nil), now: now)
        XCTAssertFalse(controller.window.hasEarlier)
        controller.previous(now: now)
        XCTAssertNil(controller.selectedEndDay)
        controller.configure(try monitor(anchor: "2026-10-12"), now: now)
        XCTAssertFalse(controller.window.hasEarlier)
        XCTAssertEqual(controller.window.endDay, "2026-10-11")
    }

    func testClockMovingBackResetsFutureSelectionToLatest() throws {
        let controller = EarningsHistoryController()
        controller.configure(try monitor(), now: now)
        controller.previous(now: now)
        controller.configure(try monitor(), now: now.addingTimeInterval(-86400 * 14))
        XCTAssertNil(controller.selectedEndDay)
        XCTAssertEqual(controller.window.endDay, "2026-09-27")
        XCTAssertNil(controller.displayedEarnings)
        controller.stop()
    }

    func testHistoricalUSDExpiresWhileNativeValuesStayAvailable() throws {
        let valid = try altered(response(endDay: "2026-10-04")) { root in
            var earnings = root["earnings"] as! [String: Any]
            earnings["market"] = ["source": "DEX Screener", "observedAt": "2026-10-11T11:59:00.000Z", "expiresAt": "2026-10-11T12:01:00.000Z",
                "quotes": [["asset": "GODL", "mint": "GodL6KZ9uuUoQwELggtVzQkKmU1LfqmDokPibPeDKkhF", "priceUsd": "1", "pairAddress": "fixture-pair", "dexId": "fixture-dex", "liquidityUsd": "20000", "volume24hUsd": "500"]]]
            var days = earnings["days"] as! [[String: Any]]
            days[0].merge(["fromAt": "2026-10-04T11:00:00.000Z", "throughAt": "2026-10-04T12:00:00.000Z", "fromSlot": "90", "throughSlot": "100", "coverage": "partial",
                "unrefinedGodl": ["baseUnits": "1", "decimals": 11, "display": "0.00000000001"],
                "refinedGodl": ["baseUnits": "0", "decimals": 11, "display": "0.00000000000"],
                "gold": ["baseUnits": "0", "decimals": 6, "display": "0.000000"],
                "netSpendUsd": "1.000000", "rewardValueUsd": "0.000000", "netRewardUsd": "-1.000000"]) { _, new in new }
            earnings["days"] = days
            root["earnings"] = earnings
        }
        let value = try EarningsHistoryResponse.decode(valid, monitor: monitor(), endDay: "2026-10-04", now: now)
        XCTAssertEqual(EarningsPlot(earnings: value, metric: .net, now: now).points.last?.raw, "-1.000000")
        let expired = now.addingTimeInterval(60)
        XCTAssertNil(EarningsPlot(earnings: value, metric: .net, now: expired).points.last?.raw)
        XCTAssertEqual(EarningsPlot(earnings: value, metric: .unrefined, now: expired).points.last?.raw, "0.00000000001")
    }

    private func settle(_ controller: EarningsHistoryController) async {
        for _ in 0..<200 where controller.isLoading { await Task.yield() }
        XCTAssertFalse(controller.isLoading)
    }

    private func monitor(wallet: String = "fixture-wallet", zone: String = "Europe/Sofia", anchor: String? = "2026-09-01",
                         observed: Date? = nil, totalReason: String = "Unknown accounting") throws -> MonitorView {
        let missing = UnavailableValue(status: "unavailable", reason: "Synthetic unknown")
        return MonitorView(schemaVersion: 1, mode: "read-only", wallet: wallet, network: MonitorFileLoader.mainnetNetwork,
            provenance: Provenance(programAddress: "fixture-program", sourceCommit: "fixture-commit", genesisHash: MonitorFileLoader.mainnetGenesisHash,
                commitment: "finalized", slot: "100", observedAt: observed ?? now),
            observation: SerializedObservation(status: "current", ageMs: 0, staleAfterMs: 60000, caveat: "Synthetic"),
            capabilities: Capabilities(canObserve: true, canPause: false, canExecute: false, reason: "Read only"),
            balances: Balances(unrefinedGodl: .unavailable(missing), storedRefinedGodl: .unavailable(missing), storedClaimableSol: .unavailable(missing),
                refinedGodl: nil, pendingRefinedGodl: nil, claimableGold: nil, storedGold: nil, pendingGold: nil, notes: []),
            goal: .unavailable(UnavailableGoal(status: "unavailable", reason: "Synthetic", targetGodl: "1")), deployment: .unavailable(missing), automations: [],
            performance: Performance(netCostPerGodlUsd: missing, netSpendUsd: missing, earnedTodayGodl: missing, estimatedCompletionDate: missing),
            acquisitionPeriod: nil, accounting: nil, rewardObservation: nil,
            earnings: try earnings(endDay: "2026-10-11", zone: zone, anchor: anchor, totalReason: totalReason),
            history: History(coverage: "unknown", firstObservedAt: "", count: 0, series: [], note: "Synthetic"))
    }

    private func earnings(endDay: String, zone: String = "Europe/Sofia", anchor: String? = nil, totalReason: String = "Unknown accounting") throws -> Earnings {
        var calendar = Calendar(identifier: .gregorian); calendar.timeZone = TimeZone(identifier: zone)!
        let formatter = DateFormatter(); formatter.calendar = calendar; formatter.timeZone = calendar.timeZone; formatter.locale = Locale(identifier: "en_US_POSIX"); formatter.dateFormat = "yyyy-MM-dd"
        let end = formatter.date(from: endDay)!
        let days = (0..<7).map { offset in EarningsDay(day: formatter.string(from: calendar.date(byAdding: .day, value: -offset, to: end)!),
            fromAt: nil, throughAt: nil, fromSlot: nil, throughSlot: nil, coverage: "unavailable", reason: "No verified closing",
            unrefinedGodl: nil, refinedGodl: nil, gold: nil, unrefinedUsd: nil, refinedUsd: nil, goldUsd: nil,
            netSpendUsd: nil, rewardValueUsd: nil, netRewardUsd: nil) }
        return Earnings(schemaVersion: 1, timeZone: zone, market: MarketQuotes(observedAt: nil, expiresAt: nil, source: "DEX Screener", quotes: [], reason: "Unknown prices"),
            holdings: HoldingValues(unrefinedUsd: nil, refinedUsd: nil, goldUsd: nil), days: days,
            total: MiningResult(scope: "unrefined-only", fromAt: nil, throughAt: nil, throughSlot: nil, claimableGodl: nil, refiningFee: nil, referralFee: nil,
                rewardValueUsd: nil, netSpendUsd: nil, netPnlUsd: nil, reason: totalReason), historyStartDay: anchor)
    }

    private func response(endDay: String) throws -> Data {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .custom { date, encoder in
            var container = encoder.singleValueContainer()
            try container.encode(ISO8601DateFormatter.string(from: date, timeZone: .gmt, formatOptions: [.withInternetDateTime, .withFractionalSeconds]))
        }
        let earningsObject = try JSONSerialization.jsonObject(with: encoder.encode(earnings(endDay: endDay)))
        return try JSONSerialization.data(withJSONObject: ["schemaVersion": 1, "wallet": "fixture-wallet", "genesisHash": MonitorFileLoader.mainnetGenesisHash,
            "programAddress": "fixture-program", "sourceCommit": "fixture-commit", "commitment": "finalized", "observedAt": "2026-10-11T12:00:00.000Z",
            "slot": "100", "endDay": endDay, "earnings": earningsObject])
    }

    private func altered(_ data: Data, _ change: (inout [String: Any]) -> Void) throws -> Data {
        var object = try JSONSerialization.jsonObject(with: data) as! [String: Any]
        change(&object)
        return try JSONSerialization.data(withJSONObject: object)
    }
}
