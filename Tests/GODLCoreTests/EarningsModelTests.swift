import Foundation
import XCTest
@testable import GODLCore

final class EarningsModelTests: XCTestCase {
    private let now = Date(timeIntervalSince1970: 1_790_512_800) // 2026-09-27 12:40 UTC

    func testLosslessNativeAmountsAndSignedResults() throws {
        let value = try decode(fixture)
        try value.validate(observedAt: now, observedSlot: "100", now: now)
        XCTAssertEqual(value.days.first?.gold?.baseUnits, "1")
        XCTAssertEqual(value.days.first?.gold?.display, "0.000001")
        XCTAssertEqual(value.total.netPnlUsd, "-10.123456")
        XCTAssertEqual(value.days.first?.netRewardUsd, "-0.001234")
    }

    func testPriceExpiryUsesClockEvenWhenNoNewObservationArrives() throws {
        let market = try decode(fixture).market
        XCTAssertTrue(market.isFresh(at: now))
        XCTAssertFalse(market.isFresh(at: try XCTUnwrap(market.expiresAt)))
        XCTAssertFalse(market.isFresh(at: try XCTUnwrap(market.observedAt).addingTimeInterval(-1)))
    }

    func testInvalidMoneyIdentityAndCoverageFailClosed() throws {
        for invalid in [
            fixture.replacingOccurrences(of: "0.000001", with: "0.001000"),
            fixture.replacingOccurrences(of: "-10.123456", with: "NaN"),
            fixture.replacingOccurrences(of: "GodL6KZ9uuUoQwELggtVzQkKmU1LfqmDokPibPeDKkhF", with: "wrong-mint"),
            fixture.replacingOccurrences(of: "unrefined-only", with: "whole-wallet"),
            fixture.replacingOccurrences(of: "Europe/Sofia", with: "bad-zone"),
            fixture.replacingOccurrences(of: "\"throughSlot\":\"100\"", with: "\"throughSlot\":\"101\""),
            fixture.replacingOccurrences(of: "2026-09-27T12:39:00.000Z", with: "2026-09-28T12:39:00.000Z")
        ] {
            XCTAssertThrowsError(try decode(invalid).validate(observedAt: now, observedSlot: "100", now: now))
        }
    }

    func testMissingHistoryAndPricesRemainUnavailable() throws {
        let value = try decode(#"{"schemaVersion":1,"timeZone":"Europe/Sofia","market":{"source":"DEX Screener","quotes":[],"reason":"No quote"},"holdings":{},"days":[{"day":"2026-09-27","coverage":"unavailable","reason":"No history"}],"total":{"scope":"unrefined-only","reason":"No accounting"}}"#)
        try value.validate(observedAt: now, observedSlot: "100", now: now)
        XCTAssertFalse(value.market.isFresh(at: now))
        XCTAssertNil(value.days.first?.netRewardUsd)
        XCTAssertNil(value.total.netPnlUsd)
    }

    func testChartKeepsZeroDistinctFromMissingAndUsesSignedZeroBaseline() throws {
        let value = try decode(fixture)
        let zero = EarningsPlot(earnings: value, metric: .unrefined, now: now)
        XCTAssertEqual(zero.points.first?.value, 0)
        XCTAssertEqual(zero.domain, 0...1)
        let negative = EarningsPlot(earnings: value, metric: .net, now: now)
        XCTAssertEqual(negative.points.first?.raw, "-0.001234")
        XCTAssertLessThan(negative.domain.lowerBound, -0.001234)
        XCTAssertEqual(negative.domain.upperBound, 0)
        let missing = try decode(fixture.replacingOccurrences(of: "\"netRewardUsd\":\"-0.001234\"", with: "\"netRewardUsd\":null"))
        XCTAssertNil(EarningsPlot(earnings: missing, metric: .net, now: now).points.first?.value)
    }

    func testChartExpiresUSDWithoutHidingNativeAccruals() throws {
        let value = try decode(fixture)
        let expired = try XCTUnwrap(value.market.expiresAt)
        XCTAssertNil(EarningsPlot(earnings: value, metric: .net, now: expired).points.first?.raw)
        let gold = EarningsPlot(earnings: value, metric: .gold, now: expired)
        XCTAssertEqual(gold.points.first?.raw, "0.000001")
        XCTAssertEqual(gold.domain.lowerBound, 0)
        XCTAssertGreaterThan(gold.domain.upperBound, 0.000001)
        XCTAssertEqual(EarningsPlot(earnings: value, metric: .refined, now: expired).points.first?.raw, "0.00000000100")
    }

    func testChartOrdersDaysChronologicallyAndKeepsGaps() throws {
        let value = try decode(fixture)
        let missing = try decode(#"{"schemaVersion":1,"timeZone":"Europe/Sofia","market":{"source":"DEX Screener","quotes":[]},"holdings":{},"days":[{"day":"2026-09-26","coverage":"unavailable","reason":"No history"},{"day":"2026-09-25","coverage":"unavailable","reason":"No history"}],"total":{"scope":"unrefined-only","reason":"No accounting"}}"#)
        let combined = Earnings(schemaVersion: value.schemaVersion, timeZone: value.timeZone, market: value.market,
                                holdings: value.holdings, days: value.days + missing.days, total: value.total)
        let plot = EarningsPlot(earnings: combined, metric: .net, now: now)
        XCTAssertEqual(plot.points.map(\.id), ["2026-09-25", "2026-09-26", "2026-09-27"])
        XCTAssertNil(plot.points[0].value)
        XCTAssertNil(plot.points[1].value)
        XCTAssertEqual(plot.points[2].raw, "-0.001234")
    }

    func testChartMixedGainsAndLossesShareOneZeroBaseline() throws {
        let negative = try decode(fixture)
        let positive = try decode(fixture.replacingOccurrences(of: "\"day\":\"2026-09-27\"", with: "\"day\":\"2026-09-26\"")
            .replacingOccurrences(of: "\"netRewardUsd\":\"-0.001234\"", with: "\"netRewardUsd\":\"2.500000\""))
        let combined = Earnings(schemaVersion: negative.schemaVersion, timeZone: negative.timeZone, market: negative.market,
                                holdings: negative.holdings, days: negative.days + positive.days, total: negative.total)
        let plot = EarningsPlot(earnings: combined, metric: .net, now: now)
        XCTAssertLessThan(plot.domain.lowerBound, -0.001234)
        XCTAssertGreaterThan(plot.domain.upperBound, 2.5)
        XCTAssertEqual(plot.points.compactMap(\.value), [2.5, -0.001234])
    }

    func testAvailabilitySeparatesSettlingMissingPricesIncompleteAndExactZero() throws {
        let complete = try decode(fixture)
        XCTAssertEqual(DailyNetAvailability(day: nil, market: complete.market, accountingState: "waiting", now: now), .settling)
        XCTAssertEqual(DailyNetAvailability(day: nil, market: complete.market, now: now), .noHistory)
        XCTAssertEqual(DailyNetAvailability(day: nil, market: complete.market, accountingState: "blocked", now: now), .needsReview)
        XCTAssertEqual(DailyNetAvailability(day: nil, market: complete.market, accountingState: "retrying", now: now), .updating)
        XCTAssertEqual(DailyNetAvailability(day: complete.days.first, market: complete.market, now: now.addingTimeInterval(600)), .pricesUnavailable)
        let zero = try decode(fixture.replacingOccurrences(of: "-0.001234", with: "0.000000"))
        XCTAssertEqual(DailyNetAvailability(day: zero.days.first, market: zero.market, accountingState: "waiting", now: now), .value("0.000000"))
        let missingNet = try decode(fixture.replacingOccurrences(of: "\"netRewardUsd\":\"-0.001234\"", with: "\"netRewardUsd\":null"))
        XCTAssertEqual(DailyNetAvailability(day: missingNet.days.first, market: missingNet.market, now: now), .pricesUnavailable)
        let missingGold = try decode(fixture.replacingOccurrences(of: "\"gold\":{\"baseUnits\":\"1\",\"decimals\":6,\"display\":\"0.000001\"}", with: "\"gold\":null")
            .replacingOccurrences(of: "\"netRewardUsd\":\"-0.001234\"", with: "\"netRewardUsd\":null"))
        XCTAssertEqual(DailyNetAvailability(day: missingGold.days.first, market: missingGold.market, now: now), .incomplete)
    }

    func testTodaySelectionDoesNotReuseYesterdayAtMidnight() throws {
        let value = try decode(fixture)
        XCTAssertEqual(value.day(at: now)?.day, "2026-09-27")
        XCTAssertNil(value.day(at: ISO8601DateFormatter().date(from: "2026-09-27T21:00:00Z")!))
    }

    func testSchemaTwoAcceptsPendingAndStoredSOLWithEarlierSettledHistory() throws {
        let value = try decode(positionFixture())
        try value.validate(observedAt: now, observedSlot: "101", now: now)
        XCTAssertEqual(value.total.netPnlUsd, "-10.123456")
        XCTAssertEqual(value.position?.pendingRound?.deployedSol.display, "0.000000001")
        XCTAssertEqual(value.position?.storedSol.lamports, "18446744073709551615")
        XCTAssertEqual(value.position?.netSpendSol, "-0.001000000")
        XCTAssertEqual(value.position?.netReady, false)
        XCTAssertNil(try decode(fixture).position)
        XCTAssertThrowsError(try decode(positionFixture().replacingOccurrences(of: "\"schemaVersion\":2", with: "\"schemaVersion\":1"))
            .validate(observedAt: now, observedSlot: "101", now: now))
    }

    func testSchemaTwoRequiresPositionAndReadinessMatchesOutstandingAmounts() throws {
        XCTAssertThrowsError(try decode(fixture.replacingOccurrences(of: "\"schemaVersion\":1", with: "\"schemaVersion\":2"))
            .validate(observedAt: now, observedSlot: "101", now: now))
        for version in [0, 3] {
            XCTAssertThrowsError(try decode(fixture.replacingOccurrences(of: "\"schemaVersion\":1", with: "\"schemaVersion\":\(version)"))
                .validate(observedAt: now, observedSlot: "101", now: now))
        }
        for changes: [String: Any] in [
            ["netReady": true],
            ["pendingRound": NSNull(), "storedSol": ["lamports": "0", "display": "0.000000000"]],
            ["pendingRound": ["roundId": "7", "deployedSol": ["lamports": "0", "display": "0.000000000"]]],
            ["pendingRound": ["roundId": "07", "deployedSol": ["lamports": "1", "display": "0.000000001"]]],
            ["pendingRound": ["roundId": "18446744073709551616", "deployedSol": ["lamports": "1", "display": "0.000000001"]]],
            ["storedSol": ["lamports": "18446744073709551616", "display": "18446744073.709551616"]],
            ["storedSol": ["lamports": "01", "display": "0.000000001"]],
            ["storedSol": ["lamports": "1", "display": "0.000000002"]],
            ["storedSol": NSNull()], ["fromAt": NSNull()], ["netReady": NSNull()],
            ["reason": ""]
        ] {
            XCTAssertThrowsError(try decode(positionFixture(changes)).validate(observedAt: now, observedSlot: "101", now: now))
        }
        let ready = try decode(positionFixture(["pendingRound": NSNull(), "storedSol": ["lamports": "0", "display": "0.000000000"], "netReady": true]))
        try ready.validate(observedAt: now, observedSlot: "101", now: now)
        for changes: [String: Any] in [
            ["pendingRound": NSNull()],
            ["storedSol": ["lamports": "0", "display": "0.000000000"]]
        ] {
            try decode(positionFixture(changes)).validate(observedAt: now, observedSlot: "101", now: now)
        }
    }

    func testSchemaTwoValidatesExactCostCoverageAndCanonicalMoney() throws {
        for changes: [String: Any] in [
            ["netSpendSol": "0.1"], ["netSpendSol": "-0.000000000"], ["netSpendSol": "+0.001000000"],
            ["netSpendSol": "01.001000000"], ["netSpendUsd": "NaN"], ["netSpendUsd": "1.00000"],
            ["netSpendUsd": "-0.000000"], ["throughSlot": "0101"], ["throughSlot": "102"],
            ["throughSlot": "18446744073709551616"], ["fromAt": "2026-09-27T12:41:00.000Z"],
            ["throughAt": "2026-09-27T12:41:00.000Z"]
        ] {
            XCTAssertThrowsError(try decode(positionFixture(changes)).validate(observedAt: now, observedSlot: "101", now: now))
        }
    }

    func testSchemaTwoRejectsSettledNetAtOrBeyondOpenPositionBoundary() throws {
        // Slots distinguish endpoints even when observation timestamps coincide.
        for changes: [String: Any] in [
            ["throughSlot": "100"],
            ["throughSlot": "99"], ["throughAt": "2026-09-27T12:38:00.000Z"]
        ] {
            XCTAssertThrowsError(try decode(positionFixture(changes)).validate(observedAt: now, observedSlot: "101", now: now))
        }
        let noTotal = positionFixture().replacingOccurrences(of: "\"netPnlUsd\":\"-10.123456\"", with: "\"netPnlUsd\":null")
        XCTAssertThrowsError(try decode(noTotal.replacingOccurrences(of: "\"throughSlot\":\"101\"", with: "\"throughSlot\":\"100\""))
            .validate(observedAt: now, observedSlot: "101", now: now))
        let noDaily = positionFixture().replacingOccurrences(of: "\"netRewardUsd\":\"-0.001234\"", with: "\"netRewardUsd\":null")
        XCTAssertThrowsError(try decode(noDaily.replacingOccurrences(of: "\"throughSlot\":\"101\"", with: "\"throughSlot\":\"100\""))
            .validate(observedAt: now, observedSlot: "101", now: now))
        try decode(positionFixture(["throughAt": "2026-09-27T12:39:00.000Z"]))
            .validate(observedAt: now, observedSlot: "101", now: now)
    }

    private func positionFixture(_ changes: [String: Any] = [:]) -> String {
        var object = try! JSONSerialization.jsonObject(with: Data(fixture.utf8)) as! [String: Any]
        object["schemaVersion"] = 2
        var position: [String: Any] = [
            "fromAt": "2026-09-24T00:32:07.000Z", "throughAt": "2026-09-27T12:40:00.000Z", "throughSlot": "101",
            "netSpendSol": "-0.001000000", "netSpendUsd": "-0.123456",
            "pendingRound": ["roundId": "7", "deployedSol": ["lamports": "1", "display": "0.000000001"]],
            "storedSol": ["lamports": "18446744073709551615", "display": "18446744073.709551615"],
            "netReady": false, "reason": "Capital excluded; stored SOL before claim deductions; pending outcome unknown."
        ]
        for (key, value) in changes { position[key] = value }
        object["position"] = position
        return String(data: try! JSONSerialization.data(withJSONObject: object, options: [.sortedKeys]), encoding: .utf8)!
    }

    private func decode(_ text: String) throws -> Earnings {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { input in
            let raw = try input.singleValueContainer().decode(String.self)
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            guard let result = formatter.date(from: raw) else { throw MonitorLoadError.invalidEarnings }
            return result
        }
        return try decoder.decode(Earnings.self, from: Data(text.utf8))
    }

    private var fixture: String {
        """
        {"schemaVersion":1,"timeZone":"Europe/Sofia",
        "market":{"source":"DEX Screener","observedAt":"2026-09-27T12:35:00.000Z","expiresAt":"2026-09-27T12:45:00.000Z",
        "quotes":[{"asset":"GODL","mint":"GodL6KZ9uuUoQwELggtVzQkKmU1LfqmDokPibPeDKkhF","priceUsd":"0.7","pairAddress":"fixture-pool","dexId":"fixture","liquidityUsd":"20000","volume24hUsd":"500"}]},
        "holdings":{"unrefinedUsd":"123.000000"},
        "days":[{"day":"2026-09-27","fromAt":"2026-09-27T12:00:00.000Z","throughAt":"2026-09-27T12:39:00.000Z","fromSlot":"90","throughSlot":"100","coverage":"partial","reason":"Covered interval only",
        "unrefinedGodl":{"baseUnits":"0","decimals":11,"display":"0.00000000000"},"refinedGodl":{"baseUnits":"100","decimals":11,"display":"0.00000000100"},"gold":{"baseUnits":"1","decimals":6,"display":"0.000001"},"netSpendUsd":"0.010000","rewardValueUsd":"0.008766","netRewardUsd":"-0.001234"}],
        "total":{"scope":"unrefined-only","fromAt":"2026-09-24T00:32:07.000Z","throughAt":"2026-09-27T12:39:00.000Z","throughSlot":"100","claimableGodl":{"baseUnits":"10000000000000","decimals":11,"display":"100.00000000000"},"netSpendUsd":"80.123456","rewardValueUsd":"70.000000","netPnlUsd":"-10.123456","reason":"Refined and gold excluded"}}
        """
    }
}
