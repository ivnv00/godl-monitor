import Darwin
import Foundation

public enum GoalMetric: String, Codable, CaseIterable, Sendable {
    case unrefined
    case refined
    case gold
    case claimableUsd
    case dailyNetUsd

    public var title: String {
        switch self {
        case .unrefined: "Unrefined GODL"
        case .refined: "Refined GODL"
        case .gold: "Gold"
        case .claimableUsd: "Claimable value"
        case .dailyNetUsd: "Today's net"
        }
    }

    public var symbol: String { isUSD ? "USD" : self == .gold ? "XAUt0" : "GODL" }

    public var decimalPlaces: Int {
        switch self {
        case .unrefined, .refined: 11
        case .gold: 6
        case .claimableUsd, .dailyNetUsd: 2
        }
    }

    public var isUSD: Bool { self == .claimableUsd || self == .dailyNetUsd }

    public var explanation: String {
        switch self {
        case .unrefined: "Tracks the observed unrefined GODL balance."
        case .refined: "Tracks the observed claimable refined GODL balance."
        case .gold: "Tracks the observed claimable gold balance."
        case .claimableUsd: "Tracks all claimable assets at current prices, before claim fees."
        case .dailyNetUsd: "Tracks today's net reward value from covered accounting history."
        }
    }
}

public enum GoalVisualStyle: String, Codable, CaseIterable, Sendable {
    case roadmap
    case ring
    case bar

    public var title: String {
        switch self {
        case .roadmap: "Roadmap"
        case .ring: "Ring"
        case .bar: "Bar"
        }
    }
}

public enum MonitorGoalError: Error, Equatable, LocalizedError {
    case emptyTitle
    case titleTooLong
    case invalidTarget(String)
    case tooPrecise(Int)
    case targetTooLarge
    case unsupportedVersion(Int)
    case duplicateID(UUID)

    public var errorDescription: String? {
        switch self {
        case .emptyTitle: "Enter a goal title."
        case .titleTooLong: "Goal titles can contain at most 60 characters."
        case .invalidTarget(let message): message
        case .tooPrecise(let places): "Use at most \(places) decimal places."
        case .targetTooLarge: "Use at most 18 digits before the decimal point."
        case .unsupportedVersion: "This goals file was created by an unsupported version."
        case .duplicateID: "Each goal must have a unique ID within its identity."
        }
    }
}

public struct MonitorGoal: Codable, Equatable, Identifiable, Sendable {
    public let id: UUID
    public let title: String
    public let metric: GoalMetric
    public let target: String
    public let showsInWidget: Bool
    public let isArchived: Bool
    public let visualStyle: GoalVisualStyle

    public init(id: UUID = UUID(), title: String, metric: GoalMetric, target: String,
                showsInWidget: Bool = true, isArchived: Bool = false,
                visualStyle: GoalVisualStyle = .roadmap) throws {
        let cleanTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanTitle.isEmpty else { throw MonitorGoalError.emptyTitle }
        guard cleanTitle.count <= 60 else { throw MonitorGoalError.titleTooLong }
        self.id = id
        self.title = cleanTitle
        self.metric = metric
        self.target = try Self.normalizedTarget(target, metric: metric)
        self.showsInWidget = showsInWidget
        self.isArchived = isArchived
        self.visualStyle = visualStyle
    }

    public static func normalizedTarget(_ input: String, metric: GoalMetric) throws -> String {
        let clean = input.trimmingCharacters(in: .whitespacesAndNewlines)
        let plainPattern = #"^[0-9]+(?:\.[0-9]+)?$"#
        let groupedPattern = #"^[1-9][0-9]{0,2}(?:,[0-9]{3})+(?:\.[0-9]+)?$"#
        let matchesPlain = clean.range(of: plainPattern, options: .regularExpression) != nil
        let matchesGrouped = clean.range(of: groupedPattern, options: .regularExpression) != nil
        if clean.contains(",") && !matchesGrouped {
            throw MonitorGoalError.invalidTarget("Use commas only as thousands separators; use a decimal point for fractions.")
        }
        guard matchesPlain || matchesGrouped else {
            throw MonitorGoalError.invalidTarget("Enter a positive number without a sign or scientific notation.")
        }
        let ungrouped = clean.replacingOccurrences(of: ",", with: "")
        let pieces = ungrouped.split(separator: ".", omittingEmptySubsequences: false)
        let fractionCount = pieces.count == 2 ? pieces[1].count : 0
        guard fractionCount <= metric.decimalPlaces else { throw MonitorGoalError.tooPrecise(metric.decimalPlaces) }
        let significantInteger = pieces[0].drop(while: { $0 == "0" })
        guard max(1, significantInteger.count) <= 18 else { throw MonitorGoalError.targetTooLarge }
        guard let value = Decimal(string: ungrouped, locale: Locale(identifier: "en_US_POSIX")),
              !value.isNaN, value > 0 else {
            throw MonitorGoalError.invalidTarget("Enter a number greater than zero.")
        }
        return Self.decimalString(value)
    }

    public func progress(in monitor: MonitorView?, now: Date = Date()) -> GoalProgress {
        guard let monitor else { return unavailableProgress(note: "Waiting for the first observation.") }
        let result: (String, String)?
        switch metric {
        case .unrefined:
            result = Self.nativeValue(monitor.balances.unrefinedGodl).map {
                ($0, Self.nativeNote("Unrefined balance", monitor: monitor, now: now))
            }
        case .refined:
            result = monitor.balances.refinedGodl.flatMap(Self.nativeValue).map {
                ($0, Self.nativeNote("Claimable refined balance", monitor: monitor, now: now))
            }
        case .gold:
            result = monitor.balances.claimableGold.flatMap(Self.nativeValue).map {
                ($0, Self.nativeNote("Claimable gold balance", monitor: monitor, now: now))
            }
        case .claimableUsd:
            result = Self.claimableUSD(in: monitor, now: now)
        case .dailyNetUsd:
            result = Self.dailyNetUSD(in: monitor, now: now)
        }
        guard let (rawCurrent, note) = result,
              let current = Self.decimal(rawCurrent), let targetValue = Self.decimal(target) else {
            return unavailableProgress(note: metric.isUSD ? "A fresh complete USD value is unavailable." : "The balance is unavailable.")
        }
        let reached = current >= targetValue
        let remainingValue = max(0, targetValue - current)
        let unclipped = current / targetValue
        let clipped = min(1, max(0, unclipped))
        return GoalProgress(
            current: rawCurrent,
            target: target,
            remaining: Self.decimalString(remainingValue),
            fraction: NSDecimalNumber(decimal: clipped).doubleValue,
            percent: Self.decimalString(clipped * 100),
            isReached: reached,
            note: note
        )
    }

    private func unavailableProgress(note: String) -> GoalProgress {
        GoalProgress(current: nil, target: target, remaining: nil, fraction: nil,
                     percent: nil, isReached: false, note: note)
    }

    private static func nativeValue(_ availability: Availability<TokenAmount>) -> String? {
        guard case .observed(let amount) = availability else { return nil }
        return amount.display
    }

    private static func nativeNote(_ label: String, monitor: MonitorView, now: Date) -> String {
        if monitor.freshness(at: now).isStale {
            return "\(label) · stale, last observed \(relativeAge(monitor.freshness(at: now).age)) ago."
        }
        return "\(label) from the latest observation."
    }

    private static func claimableUSD(in monitor: MonitorView, now: Date) -> (String, String)? {
        guard nativeValue(monitor.balances.unrefinedGodl) != nil,
              let refined = monitor.balances.refinedGodl, nativeValue(refined) != nil,
              let gold = monitor.balances.claimableGold, nativeValue(gold) != nil,
              let earnings = monitor.earnings, earnings.market.isFresh(at: now),
              let unrefinedUSD = decimal(earnings.holdings.unrefinedUsd),
              let refinedUSD = decimal(earnings.holdings.refinedUsd),
              let goldUSD = decimal(earnings.holdings.goldUsd) else { return nil }
        return (decimalString(unrefinedUSD + refinedUSD + goldUSD), "Current prices · before claim fees.")
    }

    private static func dailyNetUSD(in monitor: MonitorView, now: Date) -> (String, String)? {
        guard let earnings = monitor.earnings, earnings.market.isFresh(at: now),
              let timeZone = TimeZone(identifier: earnings.timeZone) else { return nil }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        let components = calendar.dateComponents([.year, .month, .day], from: now)
        guard let year = components.year, let month = components.month, let day = components.day else { return nil }
        let key = String(format: "%04d-%02d-%02d", year, month, day)
        guard let today = earnings.days.first(where: { $0.day == key }),
              let net = today.netRewardUsd, decimal(net) != nil else { return nil }
        var note = "Today's net reward."
        if today.coverage == "partial" {
            if let from = today.fromAt, let through = today.throughAt {
                let hours = max(0, through.timeIntervalSince(from)) / 3_600
                note = "Partial day · \(coveredHours(hours)) covered."
            } else {
                note = "Partial day coverage."
            }
        }
        return (net, note)
    }

    private static func coveredHours(_ hours: Double) -> String {
        let rounded = (hours * 10).rounded() / 10
        return rounded == rounded.rounded()
            ? "\(Int(rounded)) \(rounded == 1 ? "hour" : "hours")"
            : String(format: "%.1f hours", rounded)
    }

    private static func relativeAge(_ seconds: TimeInterval) -> String {
        if seconds < 60 { return "\(Int(seconds))s" }
        if seconds < 3_600 { return "\(Int(seconds / 60))m" }
        return "\(Int(seconds / 3_600))h"
    }

    private static func decimal(_ value: String?) -> Decimal? {
        guard let value else { return nil }
        return Decimal(string: value, locale: Locale(identifier: "en_US_POSIX"))
    }

    private static func decimalString(_ value: Decimal) -> String {
        var copy = value
        return NSDecimalString(&copy, Locale(identifier: "en_US_POSIX"))
    }

    private enum CodingKeys: String, CodingKey {
        case id, title, metric, target, showsInWidget, isArchived, visualStyle
    }

    public init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        try self.init(
            id: values.decode(UUID.self, forKey: .id),
            title: values.decode(String.self, forKey: .title),
            metric: values.decode(GoalMetric.self, forKey: .metric),
            target: values.decode(String.self, forKey: .target),
            showsInWidget: values.decode(Bool.self, forKey: .showsInWidget),
            isArchived: values.decode(Bool.self, forKey: .isArchived),
            visualStyle: try values.decodeIfPresent(GoalVisualStyle.self, forKey: .visualStyle) ?? .roadmap
        )
    }
}

public struct GoalProgress: Equatable, Sendable {
    public let current: String?
    public let target: String
    public let remaining: String?
    public let fraction: Double?
    public let percent: String?
    public let isReached: Bool
    public let note: String
}

public struct GoalLibrary: Codable, Equatable, Sendable {
    public let version: Int
    public var goalsByIdentity: [String: [MonitorGoal]]

    public init() {
        version = 1
        goalsByIdentity = [:]
    }

    public mutating func seed(identity: String, target: String = "10000") throws {
        guard goalsByIdentity[identity] == nil else { return }
        goalsByIdentity[identity] = [try MonitorGoal(title: "Unrefined GODL", metric: .unrefined,
                                                     target: target, showsInWidget: true)]
    }

    fileprivate func validate() throws {
        guard version == 1 else { throw MonitorGoalError.unsupportedVersion(version) }
        for goals in goalsByIdentity.values {
            var ids = Set<UUID>()
            for goal in goals where !ids.insert(goal.id).inserted {
                throw MonitorGoalError.duplicateID(goal.id)
            }
        }
    }

    private enum CodingKeys: String, CodingKey { case version, goalsByIdentity }

    public init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        version = try values.decode(Int.self, forKey: .version)
        goalsByIdentity = try values.decode([String: [MonitorGoal]].self, forKey: .goalsByIdentity)
        try validate()
    }
}

public struct GoalStore: Sendable {
    public let url: URL

    public init(directory: URL) {
        url = directory.appendingPathComponent("goals.json")
    }

    public func load() throws -> GoalLibrary {
        do {
            return try JSONDecoder().decode(GoalLibrary.self, from: Data(contentsOf: url))
        } catch let error as CocoaError where error.code == .fileReadNoSuchFile {
            return GoalLibrary()
        }
    }

    public func save(_ library: GoalLibrary) throws {
        try library.validate()
        let directory = url.deletingLastPathComponent()
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true,
            attributes: [.posixPermissions: 0o700])
        let temporary = directory.appendingPathComponent(".goals-\(UUID().uuidString).tmp")
        defer { try? FileManager.default.removeItem(at: temporary) }
        let data = try JSONEncoder().encode(library)
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
