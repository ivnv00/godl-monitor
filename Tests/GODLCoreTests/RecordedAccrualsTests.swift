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
        return MarketQuotes(observedAt: now.addingTimeInterval(-300), expiresAt: now.addingTimeInterval(expired ? 0 : 300), source: "DEX Screener", quotes: quotes, reason: nil)
    }
}
