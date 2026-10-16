import Foundation
import XCTest
@testable import GODLCore

final class AccrualCSVTests: XCTestCase {
    private let now = Date(timeIntervalSince1970: 1_770_000_000)

    private func entry(from: TimeInterval = -60, through: TimeInterval = -30,
                       identity: String = "synthetic-private-identity", unrefined: UInt64? = 1,
                       refined: UInt64? = nil, gold: UInt64? = nil) throws -> RewardInboxEntry {
        var object: [String: Any] = ["id": UUID().uuidString, "identity": identity,
            "fromAt": now.addingTimeInterval(from).timeIntervalSinceReferenceDate,
            "throughAt": now.addingTimeInterval(through).timeIntervalSinceReferenceDate,
            "isCatchUp": false, "isRead": true]
        if let unrefined { object["unrefinedUnits"] = unrefined }
        if let refined { object["refinedUnits"] = refined }
        if let gold { object["goldUnits"] = gold }
        return try JSONDecoder().decode(RewardInboxEntry.self, from: JSONSerialization.data(withJSONObject: object))
    }

    func testExactAmountsBlankCellsAndPrivateFieldsExcluded() throws {
        let privateText = "=HYPERLINK(\"https://private.invalid/key\",\"wallet\")"
        let csv = try AccrualCSV(entries: [entry(identity: privateText, unrefined: UInt64.max, gold: 1)], now: now)
        let text = String(decoding: csv.data, as: UTF8.self)
        XCTAssertEqual(csv.recordCount, 1)
        XCTAssertTrue(text.contains(",184467440.73709551615,,0.000001,gross_before_fees_and_costs\r\n"))
        XCTAssertFalse(text.contains(privateText))
        XCTAssertFalse(text.contains("identity"))
        XCTAssertFalse(text.contains("isRead"))
        XCTAssertFalse(text.contains("="))
        XCTAssertEqual(text.components(separatedBy: "\r\n").count, 3)
    }

    func testChronologicalOrderAndCrossDayBoundsArePreserved() throws {
        let early = try entry(from: -90_000, through: -80_000, unrefined: nil, refined: 123)
        let late = try entry(gold: 7)
        let csv = try AccrualCSV(entries: [late, early], now: now)
        let lines = String(decoding: csv.data, as: UTF8.self).components(separatedBy: "\r\n")
        XCTAssertTrue(lines[1].contains(",catch_up,,0.00000000123,,"))
        XCTAssertTrue(lines[2].contains(",observed,0.00000000001,,0.000007,"))
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        XCTAssertTrue(lines[1].hasPrefix(formatter.string(from: early.fromAt) + "," + formatter.string(from: early.throughAt)))
    }

    func testRejectsInvalidHistoryRatherThanExportingMisleadingRows() throws {
        let valid = try entry()
        let cases: [[RewardInboxEntry]] = [[], [valid, valid], [valid, try entry(identity: "other")],
            [try entry(from: -10, through: -20)], [try entry(through: 10)],
            [try entry(unrefined: nil)], [try entry(unrefined: 0)],
            [valid, try entry(from: -40, through: -10)],
            [try entry(from: -1e12)]]
        for entries in cases { XCTAssertThrowsError(try AccrualCSV(entries: entries, now: now)) }
    }

    func testExportsAllRowsWithoutChangingReadState() throws {
        var entries: [RewardInboxEntry] = []
        for index in 0..<75 {
            let offset = Double(index) * 10
            entries.append(try entry(from: -1000 + offset, through: -995 + offset))
        }
        let before = try JSONEncoder().encode(entries)
        XCTAssertEqual(try AccrualCSV(entries: entries, now: now).recordCount, 75)
        XCTAssertEqual(try JSONDecoder().decode([RewardInboxEntry].self, from: before), entries)
        XCTAssertTrue(entries.allSatisfy(\.isRead))
    }

    func testFileWrapperWritesPrivateExactBytes() throws {
        let csv = try AccrualCSV(entries: [entry()], now: now)
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: false)
        defer { try? FileManager.default.removeItem(at: folder) }
        let url = folder.appendingPathComponent("accruals.csv")
        try csv.fileWrapper().write(to: url, options: .atomic, originalContentsURL: nil)
        XCTAssertEqual(try Data(contentsOf: url), csv.data)
        let attributes = try FileManager.default.attributesOfItem(atPath: url.path)
        XCTAssertEqual((attributes[.posixPermissions] as? NSNumber)?.intValue, 0o600)
    }
}
