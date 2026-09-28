import Foundation
import XCTest
@testable import GODLCore

final class MonitorGoalsTests: XCTestCase {
    private let now = Date(timeIntervalSince1970: 1_790_547_000) // 2026-09-27 22:10 UTC, Sep 28 in Sofia

    func testTargetValidationNormalizesPrecisionAndGrouping() throws {
        XCTAssertEqual(try MonitorGoal.normalizedTarget(" 1,234.5000 ", metric: .unrefined), "1234.5")
        XCTAssertEqual(try MonitorGoal.normalizedTarget("001234", metric: .unrefined), "1234")
        XCTAssertEqual(try MonitorGoal.normalizedTarget("0.000001", metric: .gold), "0.000001")
        XCTAssertEqual(try MonitorGoal.normalizedTarget("999999999999999999", metric: .gold), "999999999999999999")
        XCTAssertEqual(try MonitorGoal(title: "  A goal  ", metric: .claimableUsd, target: "1,000.20").title, "A goal")

        for invalid in ["0", "-1", "+1", "1e3", "NaN", "1.0x", "12,34", "1,00.00"] {
            XCTAssertThrowsError(try MonitorGoal.normalizedTarget(invalid, metric: .unrefined), invalid)
        }
        XCTAssertThrowsError(try MonitorGoal.normalizedTarget("1,5", metric: .unrefined)) {
            XCTAssertTrue($0.localizedDescription.contains("decimal point"))
        }
        XCTAssertThrowsError(try MonitorGoal.normalizedTarget("1.001", metric: .claimableUsd)) {
            XCTAssertEqual($0 as? MonitorGoalError, .tooPrecise(2))
        }
        XCTAssertThrowsError(try MonitorGoal.normalizedTarget("1000000000000000000", metric: .gold)) {
            XCTAssertEqual($0 as? MonitorGoalError, .targetTooLarge)
        }
        XCTAssertThrowsError(try MonitorGoal(title: " \n ", metric: .gold, target: "1"))
        XCTAssertThrowsError(try MonitorGoal(title: String(repeating: "a", count: 61), metric: .gold, target: "1"))
    }

    func testNativeProgressDistinguishesUnavailableFromExactZeroAndKeepsPrecision() throws {
        let goal = try MonitorGoal(title: "Tiny", metric: .unrefined, target: "0.00000000002")
        let unavailable = goal.progress(in: monitor(unrefined: .unavailable(.init(status: "unavailable", reason: "missing"))))
        XCTAssertNil(unavailable.current)
        XCTAssertNil(unavailable.fraction)
        XCTAssertNil(unavailable.remaining)

        let zero = goal.progress(in: monitor(unrefined: observed("0", decimals: 11)))
        XCTAssertEqual(zero.current, "0.00000000000")
        XCTAssertEqual(zero.remaining, "0.00000000002")
        XCTAssertEqual(zero.fraction, 0)
        XCTAssertEqual(zero.percent, "0")
        XCTAssertFalse(zero.isReached)

        let halfway = goal.progress(in: monitor(unrefined: observed("1", decimals: 11)))
        XCTAssertEqual(halfway.current, "0.00000000001")
        XCTAssertEqual(halfway.remaining, "0.00000000001")
        XCTAssertEqual(halfway.fraction, 0.5)
        XCTAssertEqual(halfway.percent, "50")

        let exact = goal.progress(in: monitor(unrefined: observed("2", decimals: 11)))
        XCTAssertTrue(exact.isReached)
        XCTAssertEqual(exact.remaining, "0")
        XCTAssertEqual(exact.fraction, 1)
        let over = goal.progress(in: monitor(unrefined: observed("3", decimals: 11)))
        XCTAssertEqual(over.current, "0.00000000003")
        XCTAssertEqual(over.fraction, 1)
        XCTAssertEqual(over.percent, "100")
        XCTAssertTrue(over.isReached)
    }

    func testNativeProgressUsesClaimableFieldsAndDescribesStaleObservation() throws {
        let refined = try MonitorGoal(title: "Refined", metric: .refined, target: "2")
        let gold = try MonitorGoal(title: "Gold", metric: .gold, target: "1")
        let value = monitor(refined: observed("100000000000", decimals: 11), gold: observed("500000", decimals: 6),
                            observedAt: now.addingTimeInterval(-3_700))
        let refinedProgress = refined.progress(in: value, now: now)
        XCTAssertEqual(refinedProgress.current, "1.00000000000")
        XCTAssertTrue(refinedProgress.note.lowercased().contains("claimable"))
        XCTAssertTrue(refinedProgress.note.lowercased().contains("stale"))
        XCTAssertTrue(refinedProgress.note.contains("last observed"))
        XCTAssertEqual(gold.progress(in: value, now: now).current, "0.500000")
    }

    func testClaimableUSDRequiresEveryObservedBalanceValueAndFreshMarket() throws {
        let goal = try MonitorGoal(title: "Value", metric: .claimableUsd, target: "6")
        let complete = monitor(earnings: earnings(holdings: .init(unrefinedUsd: "1.10", refinedUsd: "2.20", goldUsd: "3.30")))
        XCTAssertEqual(goal.progress(in: complete, now: now).current, "6.6")
        XCTAssertTrue(goal.progress(in: complete, now: now).isReached)

        XCTAssertNil(goal.progress(in: monitor(refined: .unavailable(.init(status: "unavailable", reason: "missing")),
                                                   earnings: complete.earnings), now: now).current)
        XCTAssertNil(goal.progress(in: monitor(gold: .unavailable(.init(status: "unavailable", reason: "missing")), earnings: complete.earnings), now: now).current)
        XCTAssertNil(goal.progress(in: monitor(unrefined: .unavailable(.init(status: "unavailable", reason: "missing")),
                                                   earnings: complete.earnings), now: now).current)
        for holdings in [
            HoldingValues(unrefinedUsd: nil, refinedUsd: "2", goldUsd: "3"),
            HoldingValues(unrefinedUsd: "1", refinedUsd: nil, goldUsd: "3"),
            HoldingValues(unrefinedUsd: "1", refinedUsd: "2", goldUsd: nil)
        ] {
            XCTAssertNil(goal.progress(in: monitor(earnings: earnings(holdings: holdings)), now: now).current)
        }
        let stale = earnings(holdings: .init(unrefinedUsd: "1", refinedUsd: "2", goldUsd: "3"), marketFresh: false)
        XCTAssertNil(goal.progress(in: monitor(earnings: stale), now: now).current)
    }

    func testDailyNetUsesEarningsTimezoneTodayKeepsNegativeAndNotesCoverage() throws {
        let yesterday = day("2026-09-27", net: "99.00")
        let today = day("2026-09-28", net: "-0.25", from: now.addingTimeInterval(-7_200), through: now)
        let goal = try MonitorGoal(title: "Daily", metric: .dailyNetUsd, target: "10")
        let progress = goal.progress(in: monitor(earnings: earnings(days: [yesterday, today])), now: now)
        XCTAssertEqual(progress.current, "-0.25")
        XCTAssertEqual(progress.fraction, 0)
        XCTAssertEqual(progress.percent, "0")
        XCTAssertEqual(progress.remaining, "10.25")
        XCTAssertFalse(progress.isReached)
        XCTAssertTrue(progress.note.contains("Partial day"))
        XCTAssertTrue(progress.note.contains("2 hours covered"))

        let missingToday = monitor(earnings: earnings(days: [yesterday]))
        XCTAssertNil(goal.progress(in: missingToday, now: now).current)
        let noNetToday = monitor(earnings: earnings(days: [day("2026-09-28", net: nil)]))
        XCTAssertNil(goal.progress(in: noNetToday, now: now).current)
        let stale = monitor(earnings: earnings(days: [today], marketFresh: false))
        XCTAssertNil(goal.progress(in: stale, now: now).current)
    }

    func testLibrarySeedsOnceAndPreservesExplicitEmptyAndArchivedLists() throws {
        var library = GoalLibrary()
        try library.seed(identity: "wallet-a")
        XCTAssertEqual(library.goalsByIdentity["wallet-a"]?.count, 1)
        XCTAssertEqual(library.goalsByIdentity["wallet-a"]?.first?.title, "Unrefined GODL")
        XCTAssertEqual(library.goalsByIdentity["wallet-a"]?.first?.target, "10000")
        XCTAssertEqual(library.goalsByIdentity["wallet-a"]?.first?.showsInWidget, true)
        XCTAssertEqual(library.goalsByIdentity["wallet-a"]?.first?.visualStyle, .roadmap)

        library.goalsByIdentity["empty"] = []
        try library.seed(identity: "empty")
        XCTAssertEqual(library.goalsByIdentity["empty"], [])
        let archived = try MonitorGoal(title: "Old", metric: .gold, target: "1", isArchived: true)
        library.goalsByIdentity["archived"] = [archived]
        try library.seed(identity: "archived")
        XCTAssertEqual(library.goalsByIdentity["archived"], [archived])
    }

    func testVisualStylesRoundTripAndLegacyGoalsDefaultToRoadmap() throws {
        var styledGoals: [MonitorGoal] = []
        for style in GoalVisualStyle.allCases {
            let goal = try MonitorGoal(title: style.title, metric: .gold, target: "0.000001",
                                       showsInWidget: style != .bar, isArchived: style == .ring,
                                       visualStyle: style)
            styledGoals.append(goal)
            let decoded = try JSONDecoder().decode(MonitorGoal.self, from: JSONEncoder().encode(goal))
            XCTAssertEqual(decoded, goal)
            XCTAssertEqual(decoded.visualStyle, style)
            XCTAssertEqual(decoded.showsInWidget, style != .bar)
            XCTAssertEqual(decoded.isArchived, style == .ring)
        }

        let directory = try temporaryDirectory()
        let store = GoalStore(directory: directory)
        var library = GoalLibrary()
        library.goalsByIdentity["styles"] = styledGoals
        try store.save(library)
        XCTAssertEqual(try store.load().goalsByIdentity["styles"], styledGoals)

        let id = UUID()
        let legacy = Data("""
        {"id":"\(id.uuidString)","title":"Legacy","metric":"unrefined","target":"10000","showsInWidget":true,"isArchived":false}
        """.utf8)
        let decoded = try JSONDecoder().decode(MonitorGoal.self, from: legacy)
        XCTAssertEqual(decoded.visualStyle, .roadmap)
        XCTAssertEqual(decoded.id, id)
        XCTAssertEqual(decoded.target, "10000")
    }

    func testStoreRoundTripsIdentityPrivacyAndFailsClosed() throws {
        let directory = try temporaryDirectory()
        let store = GoalStore(directory: directory)
        XCTAssertEqual(store.url.lastPathComponent, "goals.json")
        XCTAssertEqual(try store.load(), GoalLibrary())
        var library = GoalLibrary()
        try library.seed(identity: "wallet-a", target: "1,234")
        library.goalsByIdentity["wallet-b"] = []
        try store.save(library)
        XCTAssertEqual(try store.load(), library)
        let attributes = try FileManager.default.attributesOfItem(atPath: store.url.path)
        XCTAssertEqual((attributes[.posixPermissions] as? NSNumber)?.intValue, 0o600)

        for invalid in [Data("broken".utf8), Data(#"{"version":2,"goalsByIdentity":{}}"#.utf8)] {
            try invalid.write(to: store.url)
            XCTAssertThrowsError(try store.load())
            XCTAssertEqual(try Data(contentsOf: store.url), invalid)
        }
        let duplicateID = UUID()
        let duplicate = try MonitorGoal(id: duplicateID, title: "One", metric: .gold, target: "1")
        let encoded = try JSONEncoder().encode(duplicate)
        let object = try XCTUnwrap(JSONSerialization.jsonObject(with: encoded) as? [String: Any])
        let duplicateDocument: [String: Any] = ["version": 1, "goalsByIdentity": ["wallet": [object, object]]]
        try JSONSerialization.data(withJSONObject: duplicateDocument).write(to: store.url)
        XCTAssertThrowsError(try store.load()) {
            XCTAssertEqual($0 as? MonitorGoalError, .duplicateID(duplicateID))
        }
        var invalidGoal = object
        invalidGoal["target"] = "1e3"
        let invalidGoalDocument: [String: Any] = ["version": 1, "goalsByIdentity": ["wallet": [invalidGoal]]]
        try JSONSerialization.data(withJSONObject: invalidGoalDocument).write(to: store.url)
        XCTAssertThrowsError(try store.load())
    }

    func testFailedAtomicSavePreservesDestinationAndCleansTemporaryFile() throws {
        let directory = try temporaryDirectory()
        let store = GoalStore(directory: directory)
        // A non-empty directory at the destination forces rename to fail while preserving its contents.
        try FileManager.default.createDirectory(at: store.url, withIntermediateDirectories: false)
        let sentinel = store.url.appendingPathComponent("keep")
        try Data("original".utf8).write(to: sentinel)
        var library = GoalLibrary()
        try library.seed(identity: "wallet")
        XCTAssertThrowsError(try store.save(library))
        XCTAssertEqual(try Data(contentsOf: sentinel), Data("original".utf8))
        XCTAssertFalse(try FileManager.default.contentsOfDirectory(atPath: directory.path).contains { $0.hasPrefix(".goals-") })
    }

    private func temporaryDirectory() throws -> URL {
        let result = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: result, withIntermediateDirectories: true)
        addTeardownBlock { try? FileManager.default.removeItem(at: result) }
        return result
    }

    private func observed(_ baseUnits: String, decimals: Int) -> Availability<TokenAmount> {
        let padded = baseUnits.count <= decimals ? String(repeating: "0", count: decimals + 1 - baseUnits.count) + baseUnits : baseUnits
        let split = padded.index(padded.endIndex, offsetBy: -decimals)
        let display = decimals == 0 ? padded : "\(padded[..<split]).\(padded[split...])"
        return .observed(.init(baseUnits: baseUnits, decimals: decimals, display: display))
    }

    private func day(_ key: String, net: String?, from: Date? = nil, through: Date? = nil) -> EarningsDay {
        EarningsDay(day: key, fromAt: from, throughAt: through, fromSlot: from == nil ? nil : "1",
                    throughSlot: through == nil ? nil : "2", coverage: net == nil ? "unavailable" : "partial",
                    reason: net == nil ? "No history" : "Covered interval only", unrefinedGodl: nil,
                    refinedGodl: nil, gold: nil, unrefinedUsd: nil, refinedUsd: nil, goldUsd: nil,
                    netSpendUsd: nil, rewardValueUsd: nil, netRewardUsd: net)
    }

    private func earnings(holdings: HoldingValues = .init(unrefinedUsd: "1", refinedUsd: "2", goldUsd: "3"),
                          days: [EarningsDay] = [], marketFresh: Bool = true) -> Earnings {
        let market = MarketQuotes(observedAt: now.addingTimeInterval(-60),
                                  expiresAt: marketFresh ? now.addingTimeInterval(60) : now,
                                  source: "DEX Screener",
                                  quotes: [.init(asset: "GODL", mint: "mint", priceUsd: "1", pairAddress: "pair",
                                                 dexId: "dex", liquidityUsd: "10000", volume24hUsd: "100")], reason: nil)
        return Earnings(schemaVersion: 1, timeZone: "Europe/Sofia", market: market, holdings: holdings, days: days,
                        total: .init(scope: "unrefined-only", fromAt: nil, throughAt: nil, throughSlot: nil,
                                     claimableGodl: nil, refiningFee: nil, referralFee: nil,
                                     rewardValueUsd: nil, netSpendUsd: nil, netPnlUsd: nil, reason: "fixture"))
    }

    private func monitor(unrefined: Availability<TokenAmount>? = nil,
                         refined: Availability<TokenAmount>? = nil,
                         gold: Availability<TokenAmount>? = nil,
                         earnings: Earnings? = nil,
                         observedAt: Date? = nil) -> MonitorView {
        let unavailable = UnavailableValue(status: "unavailable", reason: "fixture")
        return MonitorView(
            schemaVersion: 1, mode: "read-only", wallet: "fixture", network: "solana-mainnet-beta",
            provenance: .init(programAddress: "program", sourceCommit: "commit", genesisHash: "hash",
                              commitment: "finalized", slot: "1", observedAt: observedAt ?? now),
            observation: .init(status: "current", ageMs: 0, staleAfterMs: 60_000, caveat: "fixture"),
            capabilities: .init(canObserve: true, canPause: false, canExecute: false, reason: "read only"),
            balances: .init(unrefinedGodl: unrefined ?? observed("100000000000", decimals: 11),
                            storedRefinedGodl: observed("0", decimals: 11),
                            storedClaimableSol: .unavailable(unavailable), refinedGodl: refined ?? observed("100000000000", decimals: 11),
                            pendingRefinedGodl: nil, claimableGold: gold ?? observed("1000000", decimals: 6),
                            storedGold: nil, pendingGold: nil, notes: []),
            goal: .unavailable(.init(status: "unavailable", reason: "fixture", targetGodl: "10000")),
            deployment: .unavailable(unavailable), automations: [],
            performance: .init(netCostPerGodlUsd: unavailable, netSpendUsd: unavailable,
                               earnedTodayGodl: unavailable, estimatedCompletionDate: unavailable),
            acquisitionPeriod: nil, accounting: nil, rewardObservation: nil, earnings: earnings,
            history: .init(coverage: "fixture", firstObservedAt: "", count: 0, series: [], note: "fixture")
        )
    }
}
