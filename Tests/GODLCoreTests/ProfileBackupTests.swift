import Foundation
import XCTest
@testable import GODLCore

final class ProfileBackupTests: XCTestCase {
    private let wallet = String(repeating: "1", count: 32)
    private let source = String(repeating: "a", count: 40)
    private let start = Date(timeIntervalSince1970: 2_000_001_600)

    private var goalIdentity: String {
        [wallet, MonitorFileLoader.mainnetGenesisHash, ProfileBackup.programAddress].joined(separator: ":")
    }

    private var rewardIdentity: String {
        RewardSample.identity(wallet: wallet, network: MonitorFileLoader.mainnetGenesisHash,
                              program: ProfileBackup.programAddress, source: source)
    }

    private func sample(_ slot: UInt64, seconds: TimeInterval, unrefined: UInt64,
                        refined: UInt64, gold: UInt64) -> RewardSample {
        RewardSample(identity: rewardIdentity, slot: slot, observedAt: start.addingTimeInterval(seconds),
                     unrefinedUnits: unrefined, lastClaimGodlAt: "claim",
                     cumulativeGoldUnits: gold, refinedUnits: refined)
    }

    private func fixture() throws -> (ProfileBackup, GoalLibrary, RewardInbox) {
        var goals = GoalLibrary()
        goals.goalsByIdentity[goalIdentity] = [
            try MonitorGoal(id: UUID(uuidString: "00000000-0000-0000-0000-000000000001")!,
                            title: "Gold", metric: .gold, target: "0.000001",
                            showsInWidget: false, isArchived: true, visualStyle: .ring),
            try MonitorGoal(id: UUID(uuidString: "00000000-0000-0000-0000-000000000002")!,
                            title: "Refined", metric: .refined, target: "999999999999999999",
                            showsInWidget: true, visualStyle: .bar)
        ]
        var inbox = RewardInbox()
        XCTAssertNil(inbox.consume(sample(1, seconds: 0, unrefined: 100, refined: 0, gold: 300), now: start))
        inbox.consume(sample(2, seconds: 30, unrefined: 102, refined: UInt64.max, gold: 301),
                      now: start.addingTimeInterval(30))
        inbox.markAllRead(for: rewardIdentity)
        inbox.consume(sample(3, seconds: 3_600, unrefined: 109, refined: UInt64.max, gold: 308),
                      now: start.addingTimeInterval(3_600))
        let backup = try ProfileBackup(wallet: wallet, goals: goals, inbox: inbox,
                                       now: start.addingTimeInterval(7_200))
        return (backup, goals, inbox)
    }

    private func directory() throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: false)
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        return url
    }

    private func object(_ backup: ProfileBackup) throws -> [String: Any] {
        try XCTUnwrap(JSONSerialization.jsonObject(with: backup.data) as? [String: Any])
    }

    private func mutated(_ backup: ProfileBackup, _ change: (inout [String: Any]) -> Void) throws -> Data {
        var document = try object(backup)
        change(&document)
        return try JSONSerialization.data(withJSONObject: document)
    }

    private func mode(_ url: URL) throws -> Int {
        let attributes = try FileManager.default.attributesOfItem(atPath: url.path)
        return try XCTUnwrap(attributes[.posixPermissions] as? NSNumber).intValue
    }

    func testTypedRoundTripPreservesGoalsExactAmountsAndReadStateWithoutPrivateSettings() throws {
        let (backup, goals, inbox) = try fixture()
        XCTAssertEqual(backup.wallet, wallet)
        XCTAssertEqual(backup.createdAt, start.addingTimeInterval(7_200))
        XCTAssertEqual(backup.goalCount, 2)
        XCTAssertEqual(backup.unreadCount, 1)
        XCTAssertEqual(backup.goals, goals)
        XCTAssertEqual(backup.entries, inbox.entries)
        XCTAssertEqual(backup.entries[0].refinedUnits, UInt64.max)
        XCTAssertTrue(backup.entries[0].isRead)
        XCTAssertFalse(backup.entries[1].isRead)

        let document = try object(backup)
        XCTAssertEqual(document["kind"] as? String, "godl-goals-activity-backup")
        XCTAssertEqual(document["version"] as? Int, 1)
        XCTAssertEqual(Set(document.keys), ["kind", "version", "wallet", "createdAt", "goals", "entries"])
        XCTAssertNil(document["tracker"])
        XCTAssertFalse(String(decoding: backup.data, as: UTF8.self).contains("lastClaimGodlAt"))

        let decoded = try ProfileBackup.decode(backup.data, now: backup.createdAt)
        XCTAssertEqual(decoded.data, backup.data)
        XCTAssertEqual(decoded.goals, goals)
        XCTAssertEqual(decoded.entries, inbox.entries)
        let wrapper = backup.fileWrapper()
        XCTAssertEqual(wrapper.regularFileContents, backup.data)
        XCTAssertEqual((wrapper.fileAttributes[FileAttributeKey.posixPermissions.rawValue] as? NSNumber)?.intValue, 0o600)

        let file = try directory().appendingPathComponent("backup.json")
        try wrapper.write(to: file, options: .atomic, originalContentsURL: nil)
        XCTAssertEqual(try mode(file), 0o600)
        XCTAssertEqual(try Data(contentsOf: file), backup.data)
        XCTAssertEqual(try ProfileBackup.read(from: file, now: backup.createdAt).data, backup.data)
    }

    func testRestorePublishesPrivateFilesAndFreshObservationOnlySetsCursor() throws {
        let (backup, goals, inbox) = try fixture()
        let root = try directory()
        try backup.restore(into: root)
        let wallets = root.appendingPathComponent("Wallets")
        let profile = wallets.appendingPathComponent(wallet)
        XCTAssertEqual(try mode(wallets), 0o700)
        XCTAssertEqual(try mode(profile), 0o700)
        XCTAssertEqual(try mode(profile.appendingPathComponent("goals.json")), 0o600)
        XCTAssertEqual(try mode(profile.appendingPathComponent("reward-inbox.json")), 0o600)
        XCTAssertEqual(try GoalStore(directory: profile).load(), goals)
        var restored = try RewardInboxStore(directory: profile).load()
        XCTAssertEqual(restored.entries, inbox.entries)
        XCTAssertNil(restored.tracker.observedAt)
        XCTAssertNil(restored.consume(sample(10, seconds: 3_630, unrefined: 5_000,
                                             refined: UInt64.max, gold: 5_000),
                                      now: start.addingTimeInterval(3_630)))
        XCTAssertEqual(restored.entries, inbox.entries)
        XCTAssertEqual(restored.consume(sample(11, seconds: 3_660, unrefined: 5_001,
                                               refined: UInt64.max, gold: 5_001),
                                        now: start.addingTimeInterval(3_660))?.unrefinedUnits, 1)
        XCTAssertEqual(restored.entries.count, inbox.entries.count + 1)
        XCTAssertEqual(restored.entries.prefix(inbox.entries.count).map(\.isRead), inbox.entries.map(\.isRead))
        XCTAssertFalse(try FileManager.default.contentsOfDirectory(atPath: wallets.path)
            .contains { $0.hasPrefix(".restore-") })
    }

    func testInvalidVersionIdentityDatesAmountsAndDuplicateIDsFailClosed() throws {
        let (backup, _, _) = try fixture()
        let cases: [(String, (inout [String: Any]) -> Void)] = [
            ("newer version", { $0["version"] = 2 }),
            ("wrong kind", { $0["kind"] = "other" }),
            ("wrong wallet", { $0["wallet"] = String(repeating: "2", count: 32) }),
            ("future creation", { $0["createdAt"] = 4_000_000_000 }),
            ("wrong goal network", { document in
                var goals = document["goals"] as! [String: Any]
                var byIdentity = goals["goalsByIdentity"] as! [String: Any]
                byIdentity["wrong-network"] = byIdentity.removeValue(forKey: self.goalIdentity)
                goals["goalsByIdentity"] = byIdentity
                document["goals"] = goals
            }),
            ("duplicate goal ID", { document in
                var goals = document["goals"] as! [String: Any]
                var byIdentity = goals["goalsByIdentity"] as! [String: Any]
                var values = byIdentity[self.goalIdentity] as! [[String: Any]]
                values.append(values[0])
                byIdentity[self.goalIdentity] = values
                goals["goalsByIdentity"] = byIdentity
                document["goals"] = goals
            }),
            ("duplicate entry ID", { document in
                var entries = document["entries"] as! [[String: Any]]
                entries.append(entries[0])
                document["entries"] = entries
            }),
            ("wrong reward source", { document in
                var entries = document["entries"] as! [[String: Any]]
                entries[0]["identity"] = "wrong"
                document["entries"] = entries
            }),
            ("wrong reward network", { document in
                var entries = document["entries"] as! [[String: Any]]
                entries[0]["identity"] = RewardSample.identity(wallet: self.wallet, network: "wrong-network",
                    program: ProfileBackup.programAddress, source: self.source)
                document["entries"] = entries
            }),
            ("zero amount", { document in
                var entries = document["entries"] as! [[String: Any]]
                entries[0]["goldUnits"] = 0
                document["entries"] = entries
            }),
            ("negative amount", { document in
                var entries = document["entries"] as! [[String: Any]]
                entries[0]["goldUnits"] = -1
                document["entries"] = entries
            }),
            ("backward interval", { document in
                var entries = document["entries"] as! [[String: Any]]
                entries[0]["throughAt"] = (entries[0]["fromAt"] as! NSNumber).doubleValue - 1
                document["entries"] = entries
            }),
            ("overlapping intervals", { document in
                var entries = document["entries"] as! [[String: Any]]
                entries[1]["fromAt"] = (entries[0]["throughAt"] as! NSNumber).doubleValue - 1
                document["entries"] = entries
            })
        ]
        for (name, change) in cases {
            let data = try mutated(backup, change)
            XCTAssertThrowsError(try ProfileBackup.decode(data, now: backup.createdAt), name)
        }
        XCTAssertThrowsError(try ProfileBackup.decode(Data("bad JSON".utf8), now: backup.createdAt))
        XCTAssertThrowsError(try ProfileBackup.decode(Data(count: ProfileBackup.maximumBytes + 1), now: backup.createdAt)) {
            XCTAssertEqual($0 as? ProfileBackup.Failure, .tooLarge)
        }
    }

    func testCrossDayCatchUpPreservesOriginalObservationInterval() throws {
        let (backup, _, _) = try fixture()
        let originalThrough = backup.entries[0].throughAt
        let crossDayFrom = originalThrough.addingTimeInterval(-86_400)
        let bytes = try mutated(backup) { document in
            var entries = document["entries"] as! [[String: Any]]
            entries[0]["fromAt"] = crossDayFrom.timeIntervalSinceReferenceDate
            entries[0]["isCatchUp"] = true
            document["entries"] = entries
        }
        let reviewed = try ProfileBackup.decode(bytes, now: backup.createdAt)
        XCTAssertEqual(reviewed.entries[0].fromAt, crossDayFrom)
        XCTAssertEqual(reviewed.entries[0].throughAt, originalThrough)
        XCTAssertTrue(reviewed.entries[0].isCatchUp)
        XCTAssertEqual(reviewed.entries[0].refinedUnits, UInt64.max)
        let root = try directory()
        try reviewed.restore(into: root)
        let profile = root.appendingPathComponent("Wallets").appendingPathComponent(wallet)
        let restored = try RewardInboxStore(directory: profile).load()
        XCTAssertEqual(restored.entries, reviewed.entries)
    }

    func testReadRejectsSymlinkAndRestoreUsesReviewedBytesAfterFileReplacement() throws {
        let (backup, goals, inbox) = try fixture()
        let folder = try directory()
        let file = folder.appendingPathComponent("backup.json")
        try backup.data.write(to: file)
        let reviewed = try ProfileBackup.read(from: file, now: backup.createdAt)
        let link = folder.appendingPathComponent("link.json")
        try FileManager.default.createSymbolicLink(at: link, withDestinationURL: file)
        XCTAssertThrowsError(try ProfileBackup.read(from: link, now: backup.createdAt))
        try Data("replaced".utf8).write(to: file)
        let root = try directory()
        try reviewed.restore(into: root)
        let profile = root.appendingPathComponent("Wallets").appendingPathComponent(wallet)
        XCTAssertEqual(try GoalStore(directory: profile).load(), goals)
        XCTAssertEqual(try RewardInboxStore(directory: profile).load().entries, inbox.entries)
    }

    func testExistingDestinationsAndWalletsSymlinkRemainUnchanged() throws {
        let (backup, _, _) = try fixture()
        for kind in ["directory", "file", "symlink", "protected"] {
            let root = try directory()
            let wallets = root.appendingPathComponent("Wallets")
            try FileManager.default.createDirectory(at: wallets, withIntermediateDirectories: false)
            let destination = wallets.appendingPathComponent(wallet)
            let sentinel = Data("existing private profile".utf8)
            let retained: URL
            switch kind {
            case "directory":
                try FileManager.default.createDirectory(at: destination, withIntermediateDirectories: false)
                retained = destination.appendingPathComponent("keep")
                try sentinel.write(to: retained)
            case "file":
                retained = destination
                try sentinel.write(to: retained)
            case "symlink":
                retained = root.appendingPathComponent("keep")
                try sentinel.write(to: retained)
                try FileManager.default.createSymbolicLink(at: destination, withDestinationURL: retained)
            default:
                retained = root.appendingPathComponent("keep")
                try sentinel.write(to: retained)
            }
            XCTAssertThrowsError(try backup.restore(into: root,
                protectedWallets: kind == "protected" ? [wallet] : []), kind)
            XCTAssertEqual(try Data(contentsOf: retained), sentinel, kind)
            XCTAssertFalse(try FileManager.default.contentsOfDirectory(atPath: wallets.path)
                .contains { $0.hasPrefix(".restore-") }, kind)
            if kind == "protected" { XCTAssertFalse(FileManager.default.fileExists(atPath: destination.path)) }
        }

        let root = try directory()
        let outside = try directory()
        let sentinelURL = outside.appendingPathComponent("keep")
        let sentinel = Data("outside".utf8)
        try sentinel.write(to: sentinelURL)
        try FileManager.default.createSymbolicLink(at: root.appendingPathComponent("Wallets"), withDestinationURL: outside)
        XCTAssertThrowsError(try backup.restore(into: root))
        XCTAssertEqual(try Data(contentsOf: sentinelURL), sentinel)
        XCTAssertFalse(FileManager.default.fileExists(atPath: outside.appendingPathComponent(wallet).path))
    }

    func testCancelledRestoreLeavesNoDestination() async throws {
        let (backup, _, _) = try fixture()
        let root = try directory()
        let restored = await Task { () -> Bool in
            withUnsafeCurrentTask { $0?.cancel() }
            return (try? backup.restore(into: root)) != nil
        }.value
        XCTAssertFalse(restored)
        let wallets = root.appendingPathComponent("Wallets")
        XCTAssertFalse(FileManager.default.fileExists(atPath: wallets.appendingPathComponent(wallet).path))
        if FileManager.default.fileExists(atPath: wallets.path) {
            XCTAssertFalse(try FileManager.default.contentsOfDirectory(atPath: wallets.path)
                .contains { $0.hasPrefix(".restore-") })
        }
    }
}
