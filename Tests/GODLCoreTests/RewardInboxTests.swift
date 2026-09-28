import Foundation
import XCTest
@testable import GODLCore

final class RewardInboxTests: XCTestCase {
    private let start = Date(timeIntervalSince1970: 2_000_001_600) // UTC hour boundary

    private func sample(_ slot: UInt64, seconds: Double = 0, identity: String = "one",
                        unrefined: UInt64? = 100, refined: UInt64? = 200, gold: UInt64? = 300,
                        claim: String? = "claim-a") -> RewardSample {
        RewardSample(identity: identity, slot: slot, observedAt: start.addingTimeInterval(seconds),
            unrefinedUnits: unrefined, lastClaimGodlAt: claim, cumulativeGoldUnits: gold, refinedUnits: refined)
    }

    @discardableResult
    private func add(_ sample: RewardSample, to inbox: inout RewardInbox) -> RewardChange? {
        inbox.consume(sample, now: sample.observedAt)
    }

    private func directory() throws -> URL {
        let path = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: path, withIntermediateDirectories: true)
        addTeardownBlock { try? FileManager.default.removeItem(at: path) }
        return path
    }

    func testBaselineThenExactAccrualsGroupWithoutReplay() {
        var inbox = RewardInbox()
        XCTAssertNil(add(sample(1), to: &inbox))
        add(sample(2, seconds: 30, unrefined: 110, refined: 202, gold: 301), to: &inbox)
        add(sample(3, seconds: 60, unrefined: 115, refined: 207, gold: 305), to: &inbox)
        XCTAssertEqual(inbox.entries.count, 1)
        XCTAssertEqual(inbox.entries[0].unrefinedUnits, 15)
        XCTAssertEqual(inbox.entries[0].refinedUnits, 7)
        XCTAssertEqual(inbox.entries[0].goldUnits, 5)
        let saved = inbox
        XCTAssertNil(inbox.consume(sample(4, seconds: 90, unrefined: 900), now: start.addingTimeInterval(151)))
        XCTAssertNil(add(sample(3, seconds: 90, unrefined: 900), to: &inbox))
        XCTAssertNil(add(sample(2, seconds: 90, unrefined: 900), to: &inbox))
        XCTAssertNil(add(sample(4, seconds: 20, unrefined: 900), to: &inbox))
        XCTAssertEqual(inbox, saved)
    }

    func testReadStateSurvivesRestartAndFreshCatchUpIsRecordedOnce() throws {
        let store = RewardInboxStore(directory: try directory())
        var inbox = RewardInbox()
        add(sample(1), to: &inbox)
        add(sample(2, seconds: 30, refined: 205), to: &inbox)
        inbox.markAllRead(for: "one")
        try store.save(inbox)
        var restored = try store.load()
        XCTAssertEqual(restored, inbox)
        add(sample(3, seconds: 7_200, unrefined: 112, refined: 220, gold: 308), to: &restored)
        XCTAssertEqual(restored.entries.count, 2)
        let latest = try XCTUnwrap(restored.entries.last)
        XCTAssertTrue(latest.isCatchUp)
        XCTAssertEqual(latest.fromAt, start.addingTimeInterval(30))
        XCTAssertEqual(latest.refinedUnits, 15)
        XCTAssertFalse(latest.isRead)
        XCTAssertTrue(restored.entries[0].isRead)
        try store.save(restored)
        var twice = try store.load()
        XCTAssertNil(add(sample(3, seconds: 7_200, unrefined: 112, refined: 220, gold: 308), to: &twice))
        XCTAssertEqual(twice, restored)
        let attributes = try FileManager.default.attributesOfItem(atPath: store.url.path)
        XCTAssertEqual((attributes[.posixPermissions] as? NSNumber)?.intValue, 0o600)
    }

    func testClaimsMissingInputsAndDropsRebaselineWithoutInventingGODL() {
        var inbox = RewardInbox()
        add(sample(1), to: &inbox)
        let claim = add(sample(2, seconds: 30, unrefined: 500, refined: 500, gold: 302, claim: "claim-b"), to: &inbox)
        XCTAssertNil(claim?.unrefinedUnits)
        XCTAssertNil(claim?.refinedUnits)
        XCTAssertEqual(claim?.goldUnits, 2)
        XCTAssertNil(add(sample(3, seconds: 60, unrefined: nil, refined: nil, gold: nil), to: &inbox))
        XCTAssertNil(add(sample(4, seconds: 90, unrefined: 50, refined: 50, gold: 200), to: &inbox))
        XCTAssertNil(add(sample(5, seconds: 120, unrefined: 40, refined: 40, gold: 190), to: &inbox))
        XCTAssertEqual(add(sample(6, seconds: 150, unrefined: 42, refined: 41, gold: 191), to: &inbox)?.refinedUnits, 1)
        XCTAssertNil(add(sample(7, seconds: 180, unrefined: 45, refined: 45, gold: 191, claim: nil), to: &inbox))
        XCTAssertNil(add(sample(8, seconds: 210, unrefined: 50, refined: 50, gold: 191, claim: nil), to: &inbox))
    }

    func testReadEntriesHourBoundariesAndIdentitiesNeverMerge() {
        var inbox = RewardInbox()
        add(sample(1), to: &inbox)
        add(sample(2, seconds: 30, refined: 201), to: &inbox)
        inbox.markAllRead(for: "one")
        add(sample(3, seconds: 60, refined: 202), to: &inbox)
        add(sample(4, seconds: 3_590, refined: 202), to: &inbox)
        add(sample(5, seconds: 3_610, refined: 203), to: &inbox)
        XCTAssertEqual(inbox.entries.count, 3)
        XCTAssertFalse(inbox.entries[2].isCatchUp)
        XCTAssertNil(add(sample(6, seconds: 3_640, identity: "two", refined: 800), to: &inbox))
        add(sample(7, seconds: 3_670, identity: "two", refined: 801), to: &inbox)
        XCTAssertEqual(inbox.entries(for: "two").count, 1)
        inbox.markAllRead(for: "two")
        XCTAssertEqual(inbox.entries(for: "one").filter { !$0.isRead }.count, 2)
    }

    func testMigrationPreservesLegacyCursorAndEstablishesRefinedBaseline() throws {
        let path = try directory()
        let legacyURL = path.appendingPathComponent("reward-notification-cursor.json")
        // The actual old format has no refinedUnits field.
        let legacy = #"{"cursor":{"identity":"one","slot":10,"observedAt":1021694400,"unrefinedUnits":100,"lastClaimGodlAt":"claim-a","cumulativeGoldUnits":300}}"#.data(using: .utf8)!
        try legacy.write(to: legacyURL)
        let store = RewardInboxStore(directory: path)
        var inbox = try store.load()
        XCTAssertTrue(inbox.entries.isEmpty)
        let first = add(sample(11, seconds: 30, unrefined: 102, refined: 500, gold: 304), to: &inbox)
        XCTAssertEqual(first?.unrefinedUnits, 2)
        XCTAssertEqual(first?.goldUnits, 4)
        XCTAssertNil(first?.refinedUnits)
        XCTAssertEqual(add(sample(12, seconds: 60, unrefined: 102, refined: 501, gold: 304), to: &inbox)?.refinedUnits, 1)
        try store.save(inbox)
        XCTAssertEqual(try Data(contentsOf: legacyURL), legacy)
        XCTAssertEqual(try store.load(), inbox)
    }

    func testCorruptOrUnsupportedStateNeverFallsBackToLegacy() throws {
        let path = try directory()
        let store = RewardInboxStore(directory: path)
        let legacy = path.appendingPathComponent("reward-notification-cursor.json")
        try JSONEncoder().encode(RewardTracker()).write(to: legacy)
        for data in [Data("broken".utf8), Data(#"{"version":99,"tracker":{},"entries":[]}"#.utf8)] {
            try data.write(to: store.url)
            XCTAssertThrowsError(try store.load())
            XCTAssertEqual(try Data(contentsOf: store.url), data)
        }
    }

    func testSaveFailureLeavesPreviousJournalAndCandidateCanRetry() throws {
        let path = try directory()
        let store = RewardInboxStore(directory: path)
        var inbox = RewardInbox()
        add(sample(1), to: &inbox)
        try store.save(inbox)
        let original = try Data(contentsOf: store.url)
        // A non-empty directory at the destination forces rename to fail.
        let savedFile = path.appendingPathComponent("saved.json")
        try FileManager.default.moveItem(at: store.url, to: savedFile)
        try FileManager.default.createDirectory(at: store.url, withIntermediateDirectories: false)
        try Data("sentinel".utf8).write(to: store.url.appendingPathComponent("keep"))
        var candidate = inbox
        add(sample(2, seconds: 30, refined: 209), to: &candidate)
        XCTAssertThrowsError(try store.save(candidate))
        XCTAssertEqual(try Data(contentsOf: savedFile), original)
        XCTAssertTrue(inbox.entries.isEmpty)
        XCTAssertFalse(try FileManager.default.contentsOfDirectory(atPath: path.path).contains { $0.hasPrefix(".reward-inbox-") })
        try FileManager.default.removeItem(at: store.url)
        try FileManager.default.moveItem(at: savedFile, to: store.url)
        XCTAssertEqual(try store.load(), inbox)
        try store.save(candidate)
        XCTAssertEqual(try store.load(), candidate)
    }

    func testGroupingOverflowStartsSeparateExactEntry() {
        var inbox = RewardInbox()
        add(sample(1, refined: 0), to: &inbox)
        add(sample(2, seconds: 30, refined: UInt64.max), to: &inbox)
        add(sample(3, seconds: 60, refined: 0), to: &inbox)
        add(sample(4, seconds: 90, refined: 1), to: &inbox)
        XCTAssertEqual(inbox.entries.count, 2)
        XCTAssertEqual(inbox.entries[0].refinedUnits, UInt64.max)
        XCTAssertEqual(inbox.entries[1].refinedUnits, 1)
    }
}
