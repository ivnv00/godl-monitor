import Darwin
import Foundation

/// Portable goals and recorded gross accruals, never a full profile/accounting backup.
public struct ProfileBackup: Sendable {
    public static let maximumBytes = 32 * 1_024 * 1_024
    public static let programAddress = "mineWsRs2Rmw2jPMkVbgAbDjV1E23yQ8TEodaX3iza4"
    public let wallet: String
    public let createdAt: Date
    public let goals: GoalLibrary
    public let entries: [RewardInboxEntry]
    public let data: Data
    public var goalCount: Int { goals.goalsByIdentity.values.reduce(0) { $0 + $1.count } }
    public var unreadCount: Int { entries.filter { !$0.isRead }.count }

    public enum Failure: Error, LocalizedError {
        case invalid, unsupported, tooLarge, existingProfile, unavailable
        public var errorDescription: String? {
            switch self {
            case .invalid: "This isn’t a valid GODL goals and activity backup. Existing data is unchanged."
            case .unsupported: "This backup needs a newer GODL version. Existing data is unchanged."
            case .tooLarge: "This backup exceeds the 32 MB transfer limit. Existing data is unchanged."
            case .existingProfile: "This wallet already has a local profile. Restore won’t merge or replace it."
            case .unavailable: "The backup couldn’t be restored here. Check access to GODL’s local data folder. Existing profiles are unchanged."
            }
        }
    }

    private struct Document: Codable {
        let kind: String
        let version: Int
        let wallet: String
        let createdAt: Date
        let goals: GoalLibrary
        let entries: [RewardInboxEntry]
    }

    public init(wallet: String, goals: GoalLibrary, inbox: RewardInbox, now: Date = Date()) throws {
        guard inbox.version == 1 else { throw Failure.invalid }
        try self.init(Document(kind: "godl-goals-activity-backup", version: 1, wallet: wallet,
                               createdAt: now, goals: goals, entries: inbox.entries), now: now)
    }

    private init(_ document: Document, now: Date) throws {
        guard document.version == 1 else { throw Failure.unsupported }
        guard document.kind == "godl-goals-activity-backup",
              (try? WalletSettings.validateAddress(document.wallet)) == document.wallet,
              document.createdAt.timeIntervalSince1970.isFinite,
              document.createdAt.timeIntervalSince1970 >= 0,
              document.createdAt.timeIntervalSince1970 < 253_402_300_800,
              document.createdAt <= now,
              document.goals.version == 1, document.entries.count <= 100_000 else { throw Failure.invalid }
        let goalIdentity = [document.wallet, MonitorFileLoader.mainnetGenesisHash, Self.programAddress].joined(separator: ":")
        guard document.goals.goalsByIdentity.keys.allSatisfy({ $0 == goalIdentity }),
              document.goals.goalsByIdentity.values.allSatisfy({ $0.count <= 1_000 }),
              Set(document.entries.map(\.id)).count == document.entries.count else { throw Failure.invalid }
        // Re-decode goals to apply the store's validated goal and duplicate-ID boundary.
        do { _ = try JSONDecoder().decode(GoalLibrary.self, from: JSONEncoder().encode(document.goals)) }
        catch { throw Failure.invalid }
        let groups = Dictionary(grouping: document.entries, by: \.identity)
        for (identity, entries) in groups {
            try Task.checkCancellation()
            let parts = identity.components(separatedBy: "\u{1F}")
            guard parts.count == 4, parts[0] == document.wallet,
                  parts[1] == MonitorFileLoader.mainnetGenesisHash, parts[2] == Self.programAddress,
                  parts[3].range(of: "^[a-f0-9]{40}$", options: .regularExpression) != nil else { throw Failure.invalid }
            do { _ = try AccrualCSV(entries: entries, now: document.createdAt) }
            catch is CancellationError { throw CancellationError() }
            catch { throw Failure.invalid }
        }
        // Stable chronological order is required by the existing inbox's append/merge behavior.
        let ordered = document.entries.sorted { $0.fromAt < $1.fromAt }
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        let canonical = Document(kind: document.kind, version: 1, wallet: document.wallet,
                                 createdAt: document.createdAt, goals: document.goals, entries: ordered)
        let bytes = try encoder.encode(canonical)
        guard bytes.count <= Self.maximumBytes else { throw Failure.tooLarge }
        wallet = document.wallet; createdAt = document.createdAt
        goals = document.goals; entries = ordered; data = bytes
    }

    public static func decode(_ data: Data, now: Date = Date()) throws -> Self {
        guard data.count <= maximumBytes else { throw Failure.tooLarge }
        do { return try Self(JSONDecoder().decode(Document.self, from: data), now: now) }
        catch let error as Failure { throw error }
        catch is CancellationError { throw CancellationError() }
        catch { throw Failure.invalid }
    }

    public static func read(from url: URL, now: Date = Date()) throws -> Self {
        // Bound the read itself; avoid special files, symlinks and size races.
        let descriptor = open(url.path, O_RDONLY | O_NOFOLLOW | O_NONBLOCK | O_CLOEXEC)
        guard descriptor >= 0 else { throw Failure.invalid }
        let file = FileHandle(fileDescriptor: descriptor, closeOnDealloc: true)
        defer { try? file.close() }
        var info = stat()
        guard fstat(descriptor, &info) == 0, (info.st_mode & S_IFMT) == S_IFREG else { throw Failure.invalid }
        guard info.st_size <= maximumBytes else { throw Failure.tooLarge }
        var data = Data()
        while let chunk = try file.read(upToCount: min(1_048_576, maximumBytes + 1 - data.count)), !chunk.isEmpty {
            try Task.checkCancellation()
            data.append(chunk)
            guard data.count <= maximumBytes else { throw Failure.tooLarge }
        }
        return try decode(data, now: now)
    }

    public func fileWrapper() -> FileWrapper {
        let file = FileWrapper(regularFileWithContents: data)
        file.fileAttributes = [FileAttributeKey.type.rawValue: FileAttributeType.typeRegular.rawValue,
                               FileAttributeKey.posixPermissions.rawValue: 0o600]
        return file
    }

    /// Publishes a complete new profile without modifying settings or existing profiles.
    /// The first fresh observation establishes a new cursor; restored entries never replay alerts.
    public func restore(into root: URL, protectedWallets: Set<String> = []) throws {
        guard !protectedWallets.contains(wallet) else { throw Failure.existingProfile }
        let rootFD = open(root.path, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC)
        guard rootFD >= 0 else { throw Failure.unavailable }
        defer { close(rootFD) }
        if mkdirat(rootFD, "Wallets", mode_t(0o700)) != 0 && errno != EEXIST { throw Failure.unavailable }
        let parent = openat(rootFD, "Wallets", O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC)
        guard parent >= 0 else { throw Failure.unavailable }
        defer { close(parent) }
        var info = stat()
        if fstatat(parent, wallet, &info, AT_SYMLINK_NOFOLLOW) == 0 { throw Failure.existingProfile }
        guard errno == ENOENT else { throw Failure.unavailable }
        let staging = ".restore-\(UUID().uuidString)"
        guard mkdirat(parent, staging, mode_t(0o700)) == 0 else { throw Failure.unavailable }
        let stage = openat(parent, staging, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC)
        guard stage >= 0 else {
            unlinkat(parent, staging, AT_REMOVEDIR)
            throw Failure.unavailable
        }
        var published = false
        defer {
            // Only our two fixed files and unique staging name are eligible for cleanup.
            if !published {
                unlinkat(stage, "goals.json", 0)
                unlinkat(stage, "reward-inbox.json", 0)
            }
            close(stage)
            unlinkat(parent, staging, AT_REMOVEDIR)
        }
        do {
            try Task.checkCancellation()
            try Self.write(JSONEncoder().encode(goals), name: "goals.json", directory: stage)
            try Self.write(JSONEncoder().encode(RewardInbox(restoring: entries)), name: "reward-inbox.json", directory: stage)
            guard fsync(stage) == 0 else { throw Failure.unavailable }
            try Task.checkCancellation()
            // RENAME_EXCL is the commit point: never replace even a concurrently-created destination.
            guard renameatx_np(parent, staging, parent, wallet, UInt32(RENAME_EXCL)) == 0 else {
                throw errno == EEXIST || errno == ENOTEMPTY ? Failure.existingProfile : Failure.unavailable
            }
            published = true
            // The staging fd now names the published directory. Do not unlink its files.
        } catch { throw error }
    }

    private static func write(_ data: Data, name: String, directory: Int32) throws {
        let descriptor = openat(directory, name, O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW | O_CLOEXEC, mode_t(0o600))
        guard descriptor >= 0 else { throw Failure.unavailable }
        let file = FileHandle(fileDescriptor: descriptor, closeOnDealloc: true)
        defer { try? file.close() }
        try file.write(contentsOf: data)
        try file.synchronize()
    }
}
