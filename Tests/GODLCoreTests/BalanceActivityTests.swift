import Foundation
import XCTest
@testable import GODLCore

final class BalanceActivityTests: XCTestCase {
    func testExactDetailTextPreservesVeryLargePositiveAndNegativeDeltas() {
        let changes = BalanceChange.observations(in: history([
            point(second: 0, slot: "1", units: "0"),
            point(second: 30, slot: "2", units: "12345678901234567890123456789012345678901"),
            point(second: 60, slot: "3", units: "0"),
        ]))
        XCTAssertEqual(changes.map(\.signedDelta), [
            "−123456789012345678901234567890.12345678901",
            "+123456789012345678901234567890.12345678901",
        ])
    }

    func testTenThousandUnchangedObservationsProduceNoActivity() {
        let points = (0..<10_000).map {
            point(second: $0, slot: String($0 + 1), units: "17142953091313")
        }

        XCTAssertTrue(BalanceChange.observations(in: history(points)).isEmpty)
    }

    func testIncreasesAndDecreasesAreNewestFirstAndObservedZeroIsRetained() throws {
        let changes = BalanceChange.observations(in: history([
            point(second: 0, slot: "1", units: "100000000000"),
            point(second: 30, slot: "2", units: "150000000000"),
            point(second: 60, slot: "3", units: "0"),
            point(second: 90, slot: "4", units: "0"),
        ]))

        XCTAssertEqual(changes.map(\.id), ["3", "2"])
        let decrease = try XCTUnwrap(changes.first)
        XCTAssertEqual(decrease.fromSlot, "2")
        XCTAssertEqual(decrease.throughSlot, "3")
        XCTAssertEqual(decrease.before, "1.50000000000")
        XCTAssertEqual(decrease.after, "0.00000000000")
        XCTAssertEqual(decrease.delta, "-1.50000000000")
        XCTAssertFalse(decrease.isIncrease)
        XCTAssertFalse(decrease.isCatchUp)

        let increase = changes[1]
        XCTAssertEqual(increase.before, "1.00000000000")
        XCTAssertEqual(increase.after, "1.50000000000")
        XCTAssertEqual(increase.delta, "0.50000000000")
        XCTAssertTrue(increase.isIncrease)
    }

    func testExactTinyDeltaSurvivesBeyondUInt64AndDecimalPrecision() throws {
        let changes = BalanceChange.observations(in: history([
            point(second: 0, slot: "900719925474099312344", units: "12345678901234567890123456789012345678901"),
            point(second: 30, slot: "900719925474099312345", units: "12345678901234567890123456789012345678902"),
        ]))

        let change = try XCTUnwrap(changes.first)
        XCTAssertEqual(change.before, "123456789012345678901234567890.12345678901")
        XCTAssertEqual(change.after, "123456789012345678901234567890.12345678902")
        XCTAssertEqual(change.delta, "0.00000000001")
        XCTAssertTrue(change.isIncrease)
    }

    func testSubtractionBorrowsAcrossDigits() throws {
        let changes = BalanceChange.observations(in: history([
            point(second: 0, slot: "1", units: "10000000000000"),
            point(second: 30, slot: "2", units: "9999999999999"),
        ]))

        let change = try XCTUnwrap(changes.first)
        XCTAssertEqual(change.before, "100.00000000000")
        XCTAssertEqual(change.after, "99.99999999999")
        XCTAssertEqual(change.delta, "-0.00000000001")
    }

    func testMissingObservationBreaksTheBaseline() {
        let points = [
            point(second: 0, slot: "1", units: "100000000000"),
            HistoryPoint(observedAt: timestamp(second: 30), slot: "2", unrefinedGodl: nil),
            point(second: 60, slot: "3", units: "200000000000"),
            point(second: 90, slot: "4", units: "250000000000"),
        ]

        let changes = BalanceChange.observations(in: history(points))
        XCTAssertEqual(changes.map(\.id), ["4"])
        XCTAssertEqual(changes.first?.delta, "0.50000000000")
    }

    func testOvernightMovementIsMarkedAsCatchUp() throws {
        let changes = BalanceChange.observations(in: history([
            point(second: 0, slot: "1", units: "100000000000"),
            point(second: 30_000, slot: "2", units: "200000000000"),
        ]))

        XCTAssertTrue(try XCTUnwrap(changes.first).isCatchUp)
    }

    func testInvalidAndReorderedObservationsFailClosedWithoutBridging() {
        let malformed = TokenAmount(baseUnits: "200000000000", decimals: 11, display: "not-a-number")
        let points = [
            point(second: 0, slot: "10", units: "100000000000"),
            HistoryPoint(observedAt: timestamp(second: 30), slot: "11", unrefinedGodl: malformed),
            point(second: 60, slot: "12", units: "300000000000"),
            point(second: 90, slot: "13", units: "400000000000"),
            point(second: 80, slot: "14", units: "500000000000"),
            point(second: 120, slot: "15", units: "600000000000"),
            point(second: 150, slot: "14", units: "700000000000"),
            point(second: 180, slot: "16", units: "800000000000"),
            HistoryPoint(observedAt: "invalid", slot: "17", unrefinedGodl: amount("900000000000")),
            point(second: 240, slot: "18", units: "1000000000000"),
            point(second: 270, slot: "19", units: "1100000000000"),
        ]

        let changes = BalanceChange.observations(in: history(points))
        XCTAssertEqual(changes.map(\.id), ["19", "13"])
        XCTAssertEqual(changes.map(\.delta), ["1.00000000000", "1.00000000000"])
    }

    func testRewoundSegmentsCannotRepeatClosingIDsOrReenterChronology() {
        let points = [
            point(second: 0, slot: "1", units: "100000000000"),
            point(second: 30, slot: "2", units: "200000000000"),
            HistoryPoint(observedAt: timestamp(second: 60), slot: "3", unrefinedGodl: nil),
            point(second: 0, slot: "1", units: "300000000000"),
            point(second: 30, slot: "2", units: "400000000000"),
            point(second: 90, slot: "4", units: "500000000000"),
            point(second: 120, slot: "5", units: "600000000000"),
        ]

        let changes = BalanceChange.observations(in: history(points))
        XCTAssertEqual(changes.map(\.id), ["5", "2"])
        XCTAssertEqual(Set(changes.map(\.id)).count, changes.count)
        XCTAssertEqual(changes.first?.fromSlot, "4")
        XCTAssertEqual(changes.first?.delta, "1.00000000000")
    }

    private func history(_ points: [HistoryPoint]) -> History {
        History(coverage: "observed-balances-only", firstObservedAt: points.first?.observedAt ?? "",
                count: points.count, series: points, note: "Synthetic activity fixture")
    }

    private func point(second: Int, slot: String, units: String) -> HistoryPoint {
        HistoryPoint(observedAt: timestamp(second: second), slot: slot, unrefinedGodl: amount(units))
    }

    private func amount(_ units: String) -> TokenAmount {
        let padded = String(repeating: "0", count: max(0, 12 - units.count)) + units
        return TokenAmount(baseUnits: units, decimals: 11,
                           display: String(padded.dropLast(11)) + "." + String(padded.suffix(11)))
    }

    private func timestamp(second: Int) -> String {
        let date = Date(timeIntervalSince1970: 2_000_000_000 + TimeInterval(second))
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: date)
    }
}
