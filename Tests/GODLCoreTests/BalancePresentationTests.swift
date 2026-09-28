import Foundation
import XCTest
@testable import GODLCore

final class BalancePresentationTests: XCTestCase {
    func testUnavailableProgressRemainsDistinctFromObservedZero() {
        let missing = Goal.unavailable(UnavailableGoal(status: "unavailable", reason: "miner-account-not-found", targetGodl: "10000"))
        let zero = Goal.observed(ObservedGoal(status: "observed", targetGodl: "10000", remainingGodl: "10000", progressPercent: "0", reached: false))
        XCTAssertNil(missing.progressFraction)
        XCTAssertEqual(zero.progressFraction, 0)
    }

    func testChartPeriodKeepsExactChangeAndAnAscendingConstantDomain() {
        let now = Date(timeIntervalSince1970: 2_000_000_000)
        let points = [
            BalancePoint(slot: "1", date: now.addingTimeInterval(-8 * 86400), raw: "1", value: 1),
            BalancePoint(slot: "2", date: now.addingTimeInterval(-60), raw: "171.42953091313", value: 171.42953091313),
            BalancePoint(slot: "3", date: now, raw: "171.42953091314", value: 171.42953091314),
        ]
        let plot = BalancePlot(points: points, days: 7, now: now)
        XCTAssertEqual(plot.points.map(\.slot), ["2", "3"])
        XCTAssertEqual(plot.change, Decimal(string: "0.00000000001"))
        XCTAssertLessThan(plot.domain.lowerBound, plot.domain.upperBound)
        XCTAssertEqual(plot.markedIDs, ["2", "3"])
        XCTAssertFalse(plot.longSpan)
        XCTAssertTrue(BalancePlot(points: points, days: 0, now: now).longSpan)
    }

    func testFullHistoryParsesOnceAndRetainsAllChartValues() {
        let entries = (0..<10_000).map {
            HistoryPoint(observedAt: "2033-05-18T03:33:20.000Z", slot: String($0),
                unrefinedGodl: TokenAmount(baseUnits: "17142953091313", decimals: 11, display: "171.42953091313"))
        }
        let history = History(coverage: "observed-balances-only", firstObservedAt: entries[0].observedAt, count: entries.count, series: entries, note: "Synthetic performance fixture")
        let parseStart = Date()
        let points = BalancePoint.observations(in: history)
        let parsedAt = Date()
        let plot = BalancePlot(points: points, days: 0, now: parsedAt)
        let finishedAt = Date()
        XCTAssertEqual(points.count, 10_000)
        XCTAssertEqual(plot.points.count, 10_000)
        XCTAssertEqual(plot.points.last?.raw, "171.42953091313")
        XCTAssertEqual(plot.markedIDs, ["0", "9999"])
        XCTAssertEqual(plot.change, 0)
        XCTAssertLessThan(plot.domain.lowerBound, plot.domain.upperBound)
        print("10,000 observations: parse \(parsedAt.timeIntervalSince(parseStart))s once per update; plot \(finishedAt.timeIntervalSince(parsedAt))s per render")
    }
}
