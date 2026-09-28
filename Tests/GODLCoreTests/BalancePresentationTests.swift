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
        XCTAssertEqual(plot.renderedPoints.count, 2)
        XCTAssertEqual(plot.points.last?.raw, "171.42953091313")
        XCTAssertEqual(plot.markedIDs, ["0", "9999"])
        XCTAssertEqual(plot.change, 0)
        XCTAssertLessThan(plot.domain.lowerBound, plot.domain.upperBound)
        print("10,000 observations: parse \(parsedAt.timeIntervalSince(parseStart))s once per update; plot \(finishedAt.timeIntervalSince(parsedAt))s per render")
    }

    func testFlatRunCompressionPreservesBothSidesOfEveryStepIncludingClaims() {
        let values = [3, 3, 3, 5, 5, 5, 0, 0, 7]
        let points = values.enumerated().map { index, value in
            BalancePoint(slot: String(index), date: Date(timeIntervalSince1970: Double(index)), raw: String(value), value: Double(value))
        }
        let plot = BalancePlot(points: points, days: 0, now: Date())
        XCTAssertEqual(plot.points.count, values.count)
        XCTAssertEqual(plot.renderedPoints.map(\.slot), ["0", "2", "3", "5", "6", "7", "8"])
        XCTAssertEqual(plot.change, 4)
        XCTAssertEqual(plot.markedIDs, ["0", "3", "6", "8"])
        // A step segment has the same endpoints before and after compression.
        for time in stride(from: 0.5, to: 8.0, by: 1) {
            for usePreceding in [true, false] {
                func value(_ series: [BalancePoint]) -> Double? {
                    if usePreceding { return series.last { $0.date.timeIntervalSince1970 < time }?.value }
                    return series.first { $0.date.timeIntervalSince1970 > time }?.value
                }
                XCTAssertEqual(value(plot.points), value(plot.renderedPoints))
            }
        }
    }

    func testInvalidCoordinatesRemainUnavailableAndCannotTrapTheRange() {
        for value in [-1.0, -Double.greatestFiniteMagnitude, .nan, .infinity, -.infinity] {
            let point = BalancePoint(slot: "1", date: Date(), raw: String(value), value: value)
            let plot = BalancePlot(points: [point], days: 0, now: Date())
            XCTAssertTrue(plot.points.isEmpty)
            XCTAssertTrue(plot.renderedPoints.isEmpty)
            XCTAssertNil(plot.change)
            XCTAssertTrue(plot.domain.lowerBound.isFinite && plot.domain.upperBound.isFinite)
            XCTAssertLessThan(plot.domain.lowerBound, plot.domain.upperBound)
        }
        let badDate = BalancePoint(slot: "1", date: Date(timeIntervalSince1970: .infinity), raw: "0", value: 0)
        XCTAssertTrue(BalancePlot(points: [badDate], days: 0, now: Date()).points.isEmpty)
        let duplicate = BalancePoint(slot: "1", date: Date(), raw: "0", value: 0)
        XCTAssertTrue(BalancePlot(points: [duplicate, duplicate], days: 0, now: Date()).points.isEmpty)
    }

    func testLargestFiniteCoordinatesCannotOverflowDomainPadding() {
        let points = [BalancePoint(slot: "1", date: Date(), raw: "1", value: Double.greatestFiniteMagnitude)]
        let plot = BalancePlot(points: points, days: 0, now: Date())
        XCTAssertTrue(plot.domain.lowerBound.isFinite && plot.domain.upperBound.isFinite)
        XCTAssertLessThan(plot.domain.lowerBound, plot.domain.upperBound)
    }

    func testHundredThousandFlatSamplesKeepAllExactObservationsWithTwoDrawingPoints() {
        let points = (0..<100_000).map { index in
            BalancePoint(slot: String(index), date: Date(timeIntervalSince1970: Double(index)), raw: "1.00000000001", value: 1.00000000001)
        }
        let plot = BalancePlot(points: points, days: 0, now: Date())
        XCTAssertEqual(plot.points.count, 100_000)
        XCTAssertEqual(plot.renderedPoints.map(\.slot), ["0", "99999"])
        XCTAssertEqual(plot.change, 0)
    }
}
