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

    func testDailyNetRejectsInconsistentRewardMinusSpend() throws {
        let invalid = fixture.replacingOccurrences(of: "\"netRewardUsd\":\"-0.001234\"",
                                                   with: "\"netRewardUsd\":\"999.000000\"")
        XCTAssertThrowsError(try decode(invalid).validate(observedAt: now, observedSlot: "100", now: now)) {
            XCTAssertEqual($0 as? MonitorLoadError, .invalidEarnings)
        }
    }

    func testCumulativeNetRejectsInconsistentRewardMinusSpend() throws {
        let invalid = fixture.replacingOccurrences(of: "\"netPnlUsd\":\"-10.123456\"",
                                                   with: "\"netPnlUsd\":\"999.000000\"")
        XCTAssertThrowsError(try decode(invalid).validate(observedAt: now, observedSlot: "100", now: now))
    }

    func testBothNetScopesAcceptActualProducerIndependentRounding() throws {
        // projectEarnings(accountingFixture + extendClosedAccounting), with GODL
        // quotes 2.0000001 / 1.9999998 and SOL candles 99.99999 / 100.00001.
        for (total, reward, spend, net) in [
            (false, "6.000000", "3.000500", "2.999501"),
            (false, "6.000000", "3.000500", "2.999499"),
            (true, "24.000001", "13.001000", "10.999002"),
            (true, "23.999998", "13.001000", "10.998997"),
        ] {
            try decode(netFixture(reward: reward, spend: spend, net: net, total: total))
                .validate(observedAt: now, observedSlot: "100", now: now)
        }
    }

    func testSignedTiesZeroAndNumericEquivalentsRemainValid() throws {
        for total in [false, true] {
            for (reward, spend, net) in [
                // Exact +/-0.0000005 inputs round away from zero independently.
                ("0.000001", "-0.000001", "0.000001"),
                ("-0.000001", "0.000001", "-0.000001"),
                ("0.000000", "0.000000", "-0.000000"),
                ("-2", "-3.000000000", "1.0"),
                ("0", "-1.25", "1.250000000"),
                ("1.25", "2.5", "-1.25"),
                ("-0", "0.000000000", "0"),
            ] {
                try decode(netFixture(reward: reward, spend: spend, net: net, total: total))
                    .validate(observedAt: now, observedSlot: "100", now: now)
            }
        }
    }

    func testTwoMicrodollarErrorsInEitherDirectionAreRejected() throws {
        for total in [false, true] {
            for (reward, spend, net) in [
                ("3", "1", "2.000002"), ("3", "1", "1.999998"),
                ("-3", "-1", "-2.000002"), ("-3", "-1", "-1.999998"),
                ("0", "0", "0.000002"), ("0", "0", "-0.000002"),
                ("3.000002", "1", "2"), ("3", "1.000002", "2"),
            ] {
                XCTAssertThrowsError(try decode(netFixture(reward: reward, spend: spend, net: net, total: total))
                    .validate(observedAt: now, observedSlot: "100", now: now))
            }
        }
    }

    func testLargeCancellationAndCarryKeepEveryMicrodollar() throws {
        let huge = "123456789012345678901234567890123456789"
        for total in [false, true] {
            for (reward, spend, net) in [
                (huge + ".000001", huge + ".000000", "0.000001"),
                ("-" + huge + ".000001", "-" + huge, "-0.000001"),
                ("100000000000000000000000000000000000000", "99999999999999999999999999999999999999.999999", "0.000001"),
                (huge, "-" + huge, "246913578024691357802469135780246913578"),
            ] {
                try decode(netFixture(reward: reward, spend: spend, net: net, total: total))
                    .validate(observedAt: now, observedSlot: "100", now: now)
            }
            for net in ["0.000004", "-0.000002"] {
                XCTAssertThrowsError(try decode(netFixture(reward: huge + ".000001", spend: huge, net: net, total: total))
                    .validate(observedAt: now, observedSlot: "100", now: now))
            }
        }
    }

    func testSuppliedNetRelationshipRejectsHiddenSubMicrodollarPrecision() throws {
        for total in [false, true] {
            for (reward, spend, net) in [
                ("3.0000001", "1", "2"), ("3", "1.0000001", "2"), ("3", "1", "2.0000001"),
                ("0", "0", "-0.00000000000000000000000000000000000001"),
                ("3", "1", "2e0"), ("3", "1", "+2"),
            ] {
                XCTAssertThrowsError(try decode(netFixture(reward: reward, spend: spend, net: net, total: total))
                    .validate(observedAt: now, observedSlot: "100", now: now))
            }
        }
    }

    func testMissingNetIsNotInferredAndSuppliedNetRequiresBothOperands() throws {
        for total in [false, true] {
            for (reward, spend) in [("3", "1"), (nil, "1"), ("3", nil), (nil, nil)] as [(String?, String?)] {
                let value = try decode(netFixture(reward: reward, spend: spend, net: nil, total: total))
                try value.validate(observedAt: now, observedSlot: "100", now: now)
                XCTAssertNil(total ? value.total.netPnlUsd : value.days.first?.netRewardUsd)
                if reward == nil || spend == nil {
                    XCTAssertThrowsError(try decode(netFixture(reward: reward, spend: spend, net: "2", total: total))
                        .validate(observedAt: now, observedSlot: "100", now: now))
                }
            }
        }
    }

    func testClaimAdjustedNegativeRewardKeepsValidNetAndUnknownCumulative() throws {
        let value = try decode(claimFixture(["rewardValueUsd": "-2.000000", "netSpendUsd": "3.000000", "netRewardUsd": "-5.000000"]))
        try value.validate(observedAt: now, observedSlot: "101", now: now)
        XCTAssertEqual(value.days.first?.netRewardUsd, "-5.000000")
        XCTAssertNil(value.total.netPnlUsd)
        XCTAssertNil(value.days.first?.unrefinedGodl)
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

    func testClaimSpanningNetKeepsPrincipalSplitAndCumulativeProfitUnknown() throws {
        let value = try decode(claimFixture())
        try value.validate(observedAt: now, observedSlot: "101", now: now)
        XCTAssertNil(value.days.first?.unrefinedGodl)
        XCTAssertNil(value.days.first?.refinedGodl)
        XCTAssertNil(value.total.netPnlUsd)
        XCTAssertEqual(EarningsPlot(earnings: value, metric: .net, now: now).points.first?.raw, "-0.001234")
    }

    func testClaimSpanningValidationRejectsAmbiguousOrMalformedMoney() throws {
        for changes: [String: Any] in [
            ["claimCount": 0], ["claimCount": -1], ["claimCount": NSNull()],
            ["claimAdjustedGodl": "NaN"], ["claimAdjustedGodl": "0.1"],
            ["claimAdjustedGodl": "-0.00000000000"], ["claimAdjustedGodl": "01.00000000000"],
            ["claimAdjustedGodl": NSNull()], ["gold": NSNull()], ["netSpendUsd": NSNull()],
            ["unrefinedGodl": ["baseUnits": "0", "decimals": 11, "display": "0.00000000000"]],
            ["refinedUsd": "1.000000"], ["coverage": "unavailable"]
        ] {
            XCTAssertThrowsError(try decode(claimFixture(changes)).validate(observedAt: now, observedSlot: "101", now: now), "\(changes)")
        }
        for version in [1, 2, 4] {
            XCTAssertThrowsError(try decode(claimFixture(version: version)).validate(observedAt: now, observedSlot: "101", now: now))
        }
    }

    func testClaimSpanningUnknownFactorsAndPricesStayUnknown() throws {
        let value = try decode(claimFixture(["claimAdjustedGodl": NSNull(), "netRewardUsd": NSNull(), "rewardValueUsd": NSNull()]))
        try value.validate(observedAt: now, observedSlot: "101", now: now)
        XCTAssertEqual(DailyNetAvailability(day: value.days.first, market: value.market, now: now), .incomplete)
        let noPrice = try decode(claimFixture(["netRewardUsd": NSNull(), "rewardValueUsd": NSNull()]))
        try noPrice.validate(observedAt: now, observedSlot: "101", now: now)
        XCTAssertEqual(DailyNetAvailability(day: noPrice.days.first, market: noPrice.market, now: now), .pricesUnavailable)
    }

    func testClaimBreakdownRejectsContradictoryReceiptsWithoutChangingNetRules() throws {
        let invalid = attributionFixture(["ownerReceiptGodl": exactGodl(1220)])
        XCTAssertThrowsError(try decode(invalid).validate(observedAt: now, observedSlot: "101", now: now))
    }

    func testClaimBreakdownKeepsGrossPrincipalFeesAndReceiptsSeparate() throws {
        let value = try decode(attributionFixture())
        try value.validate(observedAt: now, observedSlot: "101", now: now)
        let attribution = try XCTUnwrap(value.days.first?.claimAttribution)
        XCTAssertEqual(attribution.principalGodl?.baseUnits, "1000")
        XCTAssertEqual(attribution.refinedGodl?.baseUnits, "325")
        XCTAssertEqual(attribution.refiningFeeGodl?.baseUnits, "100")
        XCTAssertEqual(attribution.referralFeeGodl?.baseUnits, "6")
        XCTAssertEqual(attribution.ownerReceiptGodl?.baseUnits, "1219")
        XCTAssertEqual(value.days.first?.netRewardUsd, "-0.001234")
        XCTAssertNil(value.days.first?.unrefinedGodl)
        XCTAssertNil(value.days.first?.refinedGodl)
        XCTAssertNil(value.total.netPnlUsd)
        XCTAssertEqual(EarningsPlot(earnings: value, metric: .net, now: now).points.first?.raw, "-0.001234")
    }

    func testClaimBreakdownUnknownAndLegacyMetadataStayUnknown() throws {
        for reason in ["claim-evidence-unavailable", "claim-state-not-isolated", "claim-factor-unavailable",
                       "claim-attribution-mismatch", "claim-attribution-range"] {
            let value = try decode(claimFixture(["claimAttribution": ["method": "isolated-claim-factor-v1",
                "status": "unavailable", "reason": reason]]))
            try value.validate(observedAt: now, observedSlot: "101", now: now)
            XCTAssertNil(value.days.first?.claimAttribution?.principalGodl)
            XCTAssertNil(value.days.first?.claimAttribution?.refiningFeeGodl)
            XCTAssertEqual(value.days.first?.netRewardUsd, "-0.001234")
        }
        XCTAssertNil(try decode(claimFixture()).days.first?.claimAttribution)
        XCTAssertNil(try decode(fixture).days.first?.claimAttribution)
    }

    func testClaimBreakdownRejectsMalformedAndUnsupportedMetadata() throws {
        for changes: [String: Any] in [
            ["method": "future-method"], ["status": "estimated"], ["reason": "unproved"],
            ["status": "unavailable", "reason": "claim-factor-unavailable"],
            ["principalGodl": NSNull()], ["refinedGodl": NSNull()], ["refiningFeeGodl": NSNull()],
            ["referralFeeGodl": NSNull()], ["ownerReceiptGodl": NSNull()],
            ["principalGodl": ["baseUnits": "01000", "decimals": 11, "display": "0.00000001000"]],
            ["principalGodl": ["baseUnits": "1000", "decimals": 9, "display": "0.000001000"]],
            ["principalGodl": ["baseUnits": "1000", "decimals": 11, "display": "0.00000001001"]],
            ["principalGodl": exactGodl(UInt64.max)],
            ["refiningFeeGodl": exactGodl(99), "ownerReceiptGodl": exactGodl(1220)],
            ["referralFeeGodl": exactGodl(7), "ownerReceiptGodl": exactGodl(1218)]
        ] {
            XCTAssertThrowsError(try decode(attributionFixture(changes)).validate(observedAt: now, observedSlot: "101", now: now))
        }
        let metadata: [String: Any] = ["method": "isolated-claim-factor-v1", "status": "unavailable", "reason": "claim-evidence-unavailable"]
        XCTAssertThrowsError(try decode(claimFixture(["claimCount": NSNull(), "claimAdjustedGodl": NSNull(), "claimAttribution": metadata]))
            .validate(observedAt: now, observedSlot: "101", now: now))
    }

    func testClaimBreakdownPreservesKnownZeroAndFullUInt64PrecisionWithoutQuotes() throws {
        for principal: UInt64 in [0, 9_007_199_254_740_993, UInt64.max] {
            let value = try decode(attributionFixture(["principalGodl": exactGodl(principal),
                "refinedGodl": exactGodl(0), "refiningFeeGodl": exactGodl(0),
                "referralFeeGodl": exactGodl(0), "ownerReceiptGodl": exactGodl(principal)]))
            try value.validate(observedAt: now, observedSlot: "101", now: now)
            XCTAssertEqual(value.days.first?.claimAttribution?.principalGodl?.baseUnits, String(principal))
        }
        var object = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(attributionFixture().utf8)) as? [String: Any])
        object["market"] = ["source": "DEX Screener", "quotes": []]
        let value = try decode(String(decoding: JSONSerialization.data(withJSONObject: object), as: UTF8.self))
        try value.validate(observedAt: now, observedSlot: "101", now: now)
        XCTAssertEqual(value.days.first?.claimAttribution?.refiningFeeGodl?.baseUnits, "100")
        XCTAssertFalse(value.market.isFresh(at: now))
    }

    private func netFixture(reward: String?, spend: String?, net: String?, total: Bool) -> String {
        var object = try! JSONSerialization.jsonObject(with: Data(fixture.utf8)) as! [String: Any]
        var row = total ? object["total"] as! [String: Any] : (object["days"] as! [[String: Any]])[0]
        row["rewardValueUsd"] = reward.map { $0 as Any } ?? NSNull()
        row["netSpendUsd"] = spend.map { $0 as Any } ?? NSNull()
        row[total ? "netPnlUsd" : "netRewardUsd"] = net.map { $0 as Any } ?? NSNull()
        if total { object["total"] = row } else { object["days"] = [row] }
        return String(decoding: try! JSONSerialization.data(withJSONObject: object), as: UTF8.self)
    }

    private func exactGodl(_ units: UInt64) -> [String: Any] {
        ["baseUnits": String(units), "decimals": 11, "display": RewardTracker.format(units: units, decimals: 11)]
    }

    private func attributionFixture(_ changes: [String: Any] = [:]) -> String {
        var attribution: [String: Any] = ["method": "isolated-claim-factor-v1", "status": "observed",
            "reason": "isolated-claim-factor-proof", "principalGodl": exactGodl(1000),
            "refinedGodl": exactGodl(325), "refiningFeeGodl": exactGodl(100),
            "referralFeeGodl": exactGodl(6), "ownerReceiptGodl": exactGodl(1219)]
        for (key, value) in changes { attribution[key] = value }
        return claimFixture(["claimCount": 1, "claimAttribution": attribution])
    }

    private func claimFixture(_ changes: [String: Any] = [:], version: Int = 3) -> String {
        var object = try! JSONSerialization.jsonObject(with: Data(positionFixture().utf8)) as! [String: Any]
        object["schemaVersion"] = version
        object["total"] = ["scope": "unrefined-only", "reason": "Claimed principal split unavailable."]
        var rows = object["days"] as! [[String: Any]]
        rows[0].removeValue(forKey: "unrefinedGodl")
        rows[0].removeValue(forKey: "refinedGodl")
        rows[0]["claimCount"] = 2
        rows[0]["claimAdjustedGodl"] = "-0.10000000000"
        for (key, value) in changes { rows[0][key] = value }
        object["days"] = rows
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
