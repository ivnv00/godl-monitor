import Foundation
import XCTest
@testable import GODLCore

final class RecordedAccrualsTests: XCTestCase {
    private let now = Date(timeIntervalSince1970: 1_790_596_800) // Sep 28 12:00 UTC
    private var calendar: Calendar {
        var result = Calendar(identifier: .gregorian)
        result.timeZone = TimeZone(identifier: "Europe/Sofia")!
        return result
    }

    func testRecordedTotalsAreExactAndNotNetIncome() throws {
        let entries = try [entry(refined: 10_000_000_001, gold: 1), entry(refined: 20_000_000_002, gold: 2)]
        let result = RecordedAccruals(entries: entries, calendar: calendar, now: now)
        XCTAssertTrue(result.isValid)
        XCTAssertNil(result.unrefinedUnits) // No recorded increase is not verified zero.
        XCTAssertEqual(result.refinedUnits, 30_000_000_003)
        XCTAssertEqual(result.goldUnits, 3)
        XCTAssertEqual(result.valueUsd(market: market(), now: now), "0.222000000021")
    }

    func testMissingQuoteCannotTurnASubtotalIntoCombinedValue() throws {
        let result = RecordedAccruals(entries: try [entry(refined: 100, gold: 1)], calendar: calendar, now: now)
        XCTAssertNil(result.valueUsd(market: market(gold: false), now: now))
        XCTAssertNil(result.valueUsd(market: market(expired: true), now: now))
        XCTAssertEqual(result.goldUnits, 1)
        let refinedOnly = RecordedAccruals(entries: try [entry(refined: 100)], calendar: calendar, now: now)
        XCTAssertEqual(refinedOnly.valueUsd(market: market(gold: false), now: now), "0.0000000007")
    }

    func testEmptyAndUnknownAreNotZero() {
        let result = RecordedAccruals(entries: [], calendar: calendar, now: now)
        XCTAssertTrue(result.isValid)
        XCTAssertFalse(result.hasAccruals)
        XCTAssertNil(result.valueUsd(market: market(), now: now))
    }

    func testHistoricalDayShowsSavedRewardsWithoutAccountingCoverage() throws {
        let yesterday = calendar.date(byAdding: .day, value: -1, to: now)!
        let entries = try [entry(from: yesterday.addingTimeInterval(-120), through: yesterday, refined: 10_000_000_001),
                           entry(refined: 20_000_000_002)]
        let history = RecordedAccrualHistory(entries: entries, calendar: calendar, now: now)
        XCTAssertEqual(history.days.count, 7)
        XCTAssertEqual(history.days[5].accruals.refinedUnits, 10_000_000_001)
        XCTAssertEqual(history.days[6].accruals.refinedUnits, 20_000_000_002)
        XCTAssertNil(history.days[4].accruals.refinedUnits)
        XCTAssertEqual(history.days[5].accruals.valueUsd(market: market(), now: now), "0.070000000007")
        XCTAssertEqual(DailyNetAvailability(day: nil, market: market(), accountingState: "waiting", now: now), .settling)
    }

    func testEarlierWindowsStayBrowsableWithoutInventingEmptyDays() throws {
        let old = calendar.date(byAdding: .day, value: -10, to: now)!
        let entries = try [entry(from: old.addingTimeInterval(-120), through: old, gold: 7)]
        let recent = RecordedAccrualHistory(entries: entries, calendar: calendar, now: now)
        XCTAssertTrue(recent.hasEarlier)
        XCTAssertFalse(recent.hasLater)
        XCTAssertTrue(recent.days.allSatisfy { !$0.accruals.hasAccruals })
        let previous = RecordedAccrualHistory(entries: entries, calendar: calendar,
            endingAt: calendar.date(byAdding: .day, value: -7, to: now), now: now)
        XCTAssertFalse(previous.hasEarlier)
        XCTAssertTrue(previous.hasLater)
        XCTAssertEqual(previous.days.compactMap { $0.accruals.goldUnits }, [7])
        let future = RecordedAccrualHistory(entries: entries, calendar: calendar,
            endingAt: now.addingTimeInterval(86_400), now: now)
        XCTAssertEqual(future.days.map(\.id), recent.days.map(\.id))
    }

    func testHistoricalDayBoundariesExcludeOvernightAndFutureIntervals() throws {
        let yesterday = calendar.date(byAdding: .day, value: -1, to: calendar.startOfDay(for: now))!
        let today = calendar.startOfDay(for: now)
        let entries = try [entry(from: yesterday.addingTimeInterval(-15), through: yesterday, refined: 100),
                           entry(from: yesterday, through: yesterday.addingTimeInterval(15), refined: 2),
                           entry(from: today.addingTimeInterval(-15), through: today, refined: 200),
                           entry(from: now, through: now.addingTimeInterval(15), refined: 300)]
        let history = RecordedAccrualHistory(entries: entries, calendar: calendar, now: now)
        XCTAssertEqual(history.days[5].accruals.refinedUnits, 2)
        XCTAssertEqual(history.days[5].accruals.excludedCrossDayCount, 1)
        XCTAssertNil(history.days[6].accruals.refinedUnits)
        XCTAssertEqual(history.days[6].accruals.excludedCrossDayCount, 1)
        XCTAssertNil(history.days[5].accruals.valueUsd(market: market(expired: true), now: now))
    }

    func testLiveAccountingStatusDoesNotPromiseToRecoverAnOlderUncoveredDay() throws {
        let old = try JSONDecoder().decode(EarningsDay.self, from: Data(#"{"day":"2026-09-27","coverage":"unavailable","reason":"No covered interval"}"#.utf8))
        for state in ["waiting", "retrying", "blocked"] {
            XCTAssertEqual(DailyNetAvailability(day: old, market: market(), accountingState: state, now: now), .noHistory)
        }
    }

    func testOnlyWhollySameDayIntervalsCountIncludingDST() throws {
        let start = calendar.startOfDay(for: now)
        let result = RecordedAccruals(entries: try [
            entry(from: start.addingTimeInterval(-1), through: start.addingTimeInterval(60), refined: 999),
            entry(from: start, through: start.addingTimeInterval(60), refined: 1),
            entry(from: now, through: now.addingTimeInterval(60), refined: 100),
            entry(from: start.addingTimeInterval(-120), through: start.addingTimeInterval(-60), refined: 200)
        ], calendar: calendar, now: now)
        XCTAssertEqual(result.refinedUnits, 1)
        XCTAssertEqual(result.excludedCrossDayCount, 1)
        // Sofia's spring-forward day is 23 hours. Calendar boundaries, not 86,400 seconds.
        let dstNow = ISO8601DateFormatter().date(from: "2026-03-29T20:00:00Z")!
        let dstStart = calendar.startOfDay(for: dstNow)
        let dst = RecordedAccruals(entries: try [entry(from: dstStart.addingTimeInterval(-1), through: dstStart.addingTimeInterval(1), gold: 9),
            entry(from: dstStart, through: dstNow, gold: 1)], calendar: calendar, now: dstNow)
        XCTAssertEqual(dst.goldUnits, 1)
        XCTAssertEqual(dst.excludedCrossDayCount, 1)
    }

    func testOverflowDuplicatesMixedWalletsAndReversedIntervalsFailClosed() throws {
        let duplicate = try entry(refined: 1)
        for entries in [try [entry(refined: UInt64.max), entry(refined: 1)],
                        [duplicate, duplicate], try [entry(refined: 1), entry(identity: "other", refined: 2)],
                        try [entry(from: now, through: now.addingTimeInterval(-10), refined: 1)]] {
            let result = RecordedAccruals(entries: entries, calendar: calendar, now: now)
            XCTAssertFalse(result.isValid)
            XCTAssertNil(result.valueUsd(market: market(), now: now))
            XCTAssertNil(result.refinedUnits)
        }
    }

    func testDirectGoldValuationRejectsUnverifiedQuoteWithoutErasingNativeAmounts() throws {
        let result = RecordedAccruals(entries: try [entry(refined: 100, gold: 1)], calendar: calendar, now: now)
        let verified = market()
        for proof in [nil, GoldReference(source: "CoinGecko", assetId: "tether-gold", priceUsd: "1", observedAt: now),
                      GoldReference(source: "CoinGecko", assetId: "tether-gold", priceUsd: "4000", observedAt: now.addingTimeInterval(-601))] {
            let invalid = MarketQuotes(observedAt: verified.observedAt, expiresAt: verified.expiresAt,
                                       source: verified.source, quotes: verified.quotes, reason: nil, goldReference: proof)
            XCTAssertNil(result.valueUsd(market: invalid, now: now))
            XCTAssertEqual(result.goldUnits, 1)
            let godlOnly = RecordedAccruals(entries: try [entry(refined: 100)], calendar: calendar, now: now)
            XCTAssertEqual(godlOnly.valueUsd(market: invalid, now: now), "0.0000000007")
        }
    }

    private func entry(identity: String = "synthetic", from: Date? = nil, through: Date? = nil,
                       refined: UInt64? = nil, gold: UInt64? = nil) throws -> RewardInboxEntry {
        var object: [String: Any] = ["id": UUID().uuidString, "identity": identity,
            "fromAt": (from ?? now.addingTimeInterval(-120)).timeIntervalSinceReferenceDate,
            "throughAt": (through ?? now.addingTimeInterval(-60)).timeIntervalSinceReferenceDate,
            "isCatchUp": false, "isRead": false]
        if let refined { object["refinedUnits"] = refined }
        if let gold { object["goldUnits"] = gold }
        return try JSONDecoder().decode(RewardInboxEntry.self, from: JSONSerialization.data(withJSONObject: object))
    }
    private func market(gold: Bool = true, expired: Bool = false) -> MarketQuotes {
        let quotes = [MarketQuote(asset: "GODL", mint: "GodL6KZ9uuUoQwELggtVzQkKmU1LfqmDokPibPeDKkhF", priceUsd: "0.7", pairAddress: "synthetic", dexId: "synthetic", liquidityUsd: "20000", volume24hUsd: "500")]
            + (gold ? [MarketQuote(asset: "XAUt0", mint: "AymATz4TCL9sWNEEV9Kvyz45CHVhDZ6kUgjTJPzLpU9P", priceUsd: "4000", pairAddress: "synthetic", dexId: "synthetic", liquidityUsd: "20000", volume24hUsd: "500")] : [])
        return MarketQuotes(observedAt: now.addingTimeInterval(-300), expiresAt: now.addingTimeInterval(expired ? 0 : 300), source: "DEX Screener", quotes: quotes, reason: nil,
            goldReference: gold ? GoldReference(source: "CoinGecko", assetId: "tether-gold", priceUsd: "4000", observedAt: now.addingTimeInterval(-300)) : nil)
    }
}
