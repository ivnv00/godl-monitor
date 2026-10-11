import Darwin
import Foundation

/// Amounts are observed increases, before claim fees; dates bound observations,
/// not the unknown on-chain time of each individual reward.
public struct RewardInboxEntry: Codable, Equatable, Identifiable, Sendable {
    public let id: UUID
    public let identity: String
    public let fromAt: Date
    public private(set) var throughAt: Date
    public let isCatchUp: Bool
    public private(set) var unrefinedUnits: UInt64?
    public private(set) var refinedUnits: UInt64?
    public private(set) var goldUnits: UInt64?
    public fileprivate(set) var isRead: Bool

    fileprivate init(change: RewardChange, fromAt: Date, throughAt: Date) {
        id = UUID()
        identity = change.identity
        self.fromAt = fromAt
        self.throughAt = throughAt
        isCatchUp = throughAt.timeIntervalSince(fromAt) > 300
        unrefinedUnits = change.unrefinedUnits
        refinedUnits = change.refinedUnits
        goldUnits = change.goldUnits
        isRead = false
    }

    fileprivate mutating func merge(_ next: Self, calendar: Calendar) -> Bool {
        guard !isRead, !isCatchUp, !next.isCatchUp, identity == next.identity,
              calendar.isDate(fromAt, inSameDayAs: throughAt),
              calendar.isDate(next.fromAt, inSameDayAs: next.throughAt),
              calendar.isDate(throughAt, inSameDayAs: next.throughAt),
              floor(throughAt.timeIntervalSince1970 / 3_600) == floor(next.throughAt.timeIntervalSince1970 / 3_600)
        else { return false }
        let unrefined = (unrefinedUnits ?? 0).addingReportingOverflow(next.unrefinedUnits ?? 0)
        let refined = (refinedUnits ?? 0).addingReportingOverflow(next.refinedUnits ?? 0)
        let gold = (goldUnits ?? 0).addingReportingOverflow(next.goldUnits ?? 0)
        guard !unrefined.overflow, !refined.overflow, !gold.overflow else { return false }
        unrefinedUnits = unrefined.partialValue == 0 ? nil : unrefined.partialValue
        refinedUnits = refined.partialValue == 0 ? nil : refined.partialValue
        goldUnits = gold.partialValue == 0 ? nil : gold.partialValue
        throughAt = next.throughAt
        return true
    }
}

public struct RewardInbox: Codable, Equatable, Sendable {
    public let version: Int
    public private(set) var tracker: RewardTracker
    public private(set) var entries: [RewardInboxEntry]

    public init(tracker: RewardTracker = RewardTracker()) {
        version = 1
        self.tracker = tracker
        entries = []
    }

    // Only ProfileBackup calls this after validating all imported records.
    init(restoring entries: [RewardInboxEntry]) {
        version = 1
        tracker = RewardTracker()
        self.entries = entries
    }

    @discardableResult
    public mutating func consume(_ sample: RewardSample, now: Date = Date(), calendar: Calendar = .current) -> RewardChange? {
        let fromAt = tracker.observedAt
        guard let change = tracker.consume(sample, now: now), let fromAt else { return nil }
        let entry = RewardInboxEntry(change: change, fromAt: fromAt, throughAt: sample.observedAt)
        if let last = entries.indices.last, entries[last].merge(entry, calendar: calendar) { return change }
        entries.append(entry)
        return change
    }

    public func entries(for identity: String) -> [RewardInboxEntry] {
        entries.reversed().filter { $0.identity == identity }
    }

    public mutating func markAllRead(for identity: String) {
        for index in entries.indices where entries[index].identity == identity {
            entries[index].isRead = true
        }
    }
}

/// The journal and detection cursor have one commit point. A failed save cannot
/// advance the live cursor or acknowledge unread entries in the caller.
public struct RewardInboxStore: Sendable {
    public let url: URL
    private let legacyURL: URL

    public init(directory: URL) {
        url = directory.appendingPathComponent("reward-inbox.json")
        legacyURL = directory.appendingPathComponent("reward-notification-cursor.json")
    }

    public func load() throws -> RewardInbox {
        do {
            let state = try JSONDecoder().decode(RewardInbox.self, from: Data(contentsOf: url))
            guard state.version == 1 else { throw CocoaError(.coderReadCorrupt) }
            return state
        } catch let error as CocoaError where error.code == .fileReadNoSuchFile {
            do {
                let tracker = try JSONDecoder().decode(RewardTracker.self, from: Data(contentsOf: legacyURL))
                return RewardInbox(tracker: tracker)
            } catch let legacyError as CocoaError where legacyError.code == .fileReadNoSuchFile {
                return RewardInbox()
            }
        }
    }

    public func save(_ state: RewardInbox) throws {
        let directory = url.deletingLastPathComponent()
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true,
            attributes: [.posixPermissions: 0o700])
        let temporary = directory.appendingPathComponent(".reward-inbox-\(UUID().uuidString).tmp")
        defer { try? FileManager.default.removeItem(at: temporary) }
        let data = try JSONEncoder().encode(state)
        // Apply privacy at creation, before any journal bytes are written, even
        // when an existing application-support directory has a permissive mode.
        let descriptor = open(temporary.path, O_WRONLY | O_CREAT | O_EXCL | O_CLOEXEC, mode_t(0o600))
        guard descriptor >= 0 else { throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO) }
        let file = FileHandle(fileDescriptor: descriptor, closeOnDealloc: true)
        try file.write(contentsOf: data)
        try file.close()
        guard rename(temporary.path, url.path) == 0 else {
            throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO)
        }
    }
}
