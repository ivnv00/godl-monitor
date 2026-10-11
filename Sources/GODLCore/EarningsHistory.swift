import Combine
import Foundation

/// Seven named calendar days, newest first. Calendar arithmetic preserves local
/// days through daylight-saving changes rather than adding 24-hour intervals.
public struct EarningsHistoryWindow: Equatable, Sendable {
    public let endDay: String
    public let startDay: String
    public let days: [String]
    public let hasEarlier: Bool
    public let hasLater: Bool
    public var label: String { "\(startDay) – \(endDay)" }

    public init(endDay: String, timeZone: String, today: String, historyStartDay: String?) throws {
        let calendar = try EarningsCalendar(timeZone: timeZone)
        guard let end = calendar.date(endDay), calendar.date(today) != nil, endDay <= today else {
            throw MonitorLoadError.invalidEarnings
        }
        if let historyStartDay, calendar.date(historyStartDay) == nil || historyStartDay > today {
            throw MonitorLoadError.invalidEarnings
        }
        self.init(end: end, calendar: calendar, today: today, historyStartDay: historyStartDay)
    }

    fileprivate init(end: Date, calendar: EarningsCalendar, today: String, historyStartDay: String?) {
        endDay = calendar.key(end)
        days = (0..<7).compactMap { calendar.calendar.date(byAdding: .day, value: -$0, to: end).map(calendar.key) }
        startDay = days.last ?? endDay
        if let historyStartDay { hasEarlier = historyStartDay < startDay }
        else { hasEarlier = false }
        hasLater = endDay < today
    }
}

struct EarningsCalendar {
    let calendar: Calendar
    static var utc: Self {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = .gmt
        return Self(calendar: calendar)
    }

    private init(calendar: Calendar) { self.calendar = calendar }

    init(timeZone: String) throws {
        guard let zone = TimeZone(identifier: timeZone) else { throw MonitorLoadError.invalidEarnings }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = zone
        self.calendar = calendar
    }

    func key(_ date: Date) -> String {
        let parts = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", parts.year!, parts.month!, parts.day!)
    }

    func date(_ key: String) -> Date? {
        guard key.range(of: #"^[0-9]{4}-[0-9]{2}-[0-9]{2}$"#, options: .regularExpression) != nil else { return nil }
        let parts = key.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3, parts[0] >= 1,
              let date = calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2], hour: 12)),
              self.key(date) == key else { return nil }
        return calendar.startOfDay(for: date)
    }
}

/// The helper is read-only and returns an independently validated response;
/// nothing in this decoder replaces or mutates the current monitor observation.
public struct EarningsHistoryResponse: Decodable, Sendable {
    public let schemaVersion: Int
    public let wallet: String
    public let genesisHash: String
    public let programAddress: String
    public let sourceCommit: String
    public let commitment: String
    public let observedAt: Date
    public let slot: String
    public let endDay: String
    public let earnings: Earnings

    public static func decode(_ data: Data, monitor: MonitorView, endDay: String, now: Date = Date()) throws -> Earnings {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { input in
            let raw = try input.singleValueContainer().decode(String.self)
            guard raw.range(of: #"^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$"#, options: .regularExpression) != nil else {
                throw MonitorLoadError.invalidEarnings
            }
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            guard let date = formatter.date(from: raw),
                  formatter.string(from: date) == raw else { throw MonitorLoadError.invalidEarnings }
            return date
        }
        let response = try decoder.decode(Self.self, from: data)
        guard response.schemaVersion == 1, response.wallet == monitor.wallet,
              response.genesisHash == monitor.provenance.genesisHash,
              response.programAddress == monitor.provenance.programAddress,
              response.sourceCommit == monitor.provenance.sourceCommit,
              response.commitment == "finalized", monitor.provenance.commitment == "finalized",
              response.endDay == endDay,
              response.earnings.timeZone == monitor.earnings?.timeZone,
              let slot = UInt64(response.slot), String(slot) == response.slot,
              let capturedSlot = UInt64(monitor.provenance.slot), String(capturedSlot) == monitor.provenance.slot,
              slot >= capturedSlot, response.observedAt >= monitor.provenance.observedAt,
              response.observedAt.timeIntervalSince(now) <= 5 else { throw MonitorLoadError.invalidEarnings }
        let calendar = try EarningsCalendar(timeZone: response.earnings.timeZone)
        let window = try EarningsHistoryWindow(endDay: endDay, timeZone: response.earnings.timeZone,
            today: calendar.key(now), historyStartDay: response.earnings.historyStartDay)
        try response.earnings.validate(observedAt: response.observedAt, observedSlot: response.slot, now: now)
        guard response.earnings.days.map(\.day) == window.days else { throw MonitorLoadError.invalidEarnings }
        for day in response.earnings.days {
            for instant in [day.fromAt, day.throughAt].compactMap({ $0 }) {
                guard calendar.key(instant) == day.day else { throw MonitorLoadError.invalidEarnings }
            }
            for raw in [day.fromSlot, day.throughSlot].compactMap({ $0 }) {
                guard let slot = UInt64(raw), String(slot) == raw else { throw MonitorLoadError.invalidEarnings }
            }
        }
        return response.earnings
    }
}

@MainActor
public final class EarningsHistoryController: ObservableObject {
    @Published public private(set) var selectedEndDay: String?
    @Published public private(set) var earnings: Earnings?
    @Published public private(set) var isLoading = false
    @Published public private(set) var error: String?
    public var load: @MainActor (String, String) async throws -> Data = { _, _ in throw MonitorLoadError.invalidEarnings }

    @Published private var monitor: MonitorView?
    @Published private var clock = Date()
    private var generation = 0
    private var task: Task<Void, Never>?
    private var stopped = false

    public init() {}

    public var window: EarningsHistoryWindow {
        let zone = monitor?.earnings?.timeZone ?? "UTC"
        let calendar = (try? EarningsCalendar(timeZone: zone)) ?? .utc
        let today = calendar.key(clock)
        let end = selectedEndDay.flatMap(calendar.date).map { min($0, clock) } ?? clock
        let anchor = monitor?.earnings?.historyStartDay.flatMap { calendar.date($0) != nil && $0 <= today ? $0 : nil }
        return EarningsHistoryWindow(end: end, calendar: calendar, today: today, historyStartDay: anchor)
    }

    public var displayedEarnings: Earnings? {
        if let selectedEndDay {
            guard selectedEndDay == window.endDay, !isLoading, error == nil,
                  earnings?.days.first?.day == selectedEndDay else { return nil }
            return earnings
        }
        guard monitor?.earnings?.days.first?.day == window.endDay else { return nil }
        return monitor?.earnings
    }

    public func configure(_ monitor: MonitorView?, now: Date = Date()) {
        guard !stopped else { return }
        let old = self.monitor
        if monitor?.earningsHistoryPending == true,
           let priorIdentity = identity(old, includeEarningsSchema: false),
           priorIdentity == identity(monitor, includeEarningsSchema: false) {
            // Keep this separately dated chart source; the live monitor still accepts
            // the complete fresh view. The interim earnings schema is not final.
            clock = now
            if selectedEndDay.map({ $0 > window.endDay }) == true { latest() }
            return
        }
        let changedIdentity = identity(old) != identity(monitor)
        let changedContext = old?.earnings?.market != monitor?.earnings?.market
            || old?.earnings?.total != monitor?.earnings?.total
            || old?.earnings?.position != monitor?.earnings?.position
        self.monitor = monitor
        clock = now
        if changedIdentity || selectedEndDay.map({ $0 > window.endDay }) == true {
            latest()
        } else if selectedEndDay != nil && changedContext {
            fetch()
        }
    }

    public func previous(now: Date = Date()) {
        guard !stopped, monitor?.earnings != nil else { return }
        clock = now
        guard window.hasEarlier else { return }
        guard let zone = monitor?.earnings?.timeZone, let calendar = try? EarningsCalendar(timeZone: zone),
              let end = calendar.date(window.endDay), let previous = calendar.calendar.date(byAdding: .day, value: -7, to: end) else { return }
        selectedEndDay = calendar.key(previous)
        fetch()
    }

    public func next(now: Date = Date()) {
        guard !stopped, selectedEndDay != nil, monitor?.earnings != nil else { return }
        clock = now
        guard let zone = monitor?.earnings?.timeZone, let calendar = try? EarningsCalendar(timeZone: zone),
              let end = calendar.date(window.endDay), let following = calendar.calendar.date(byAdding: .day, value: 7, to: end) else { return }
        let next = calendar.key(following)
        if next >= calendar.key(now) { latest() }
        else { selectedEndDay = next; fetch() }
    }

    public func latest() {
        cancel()
        selectedEndDay = nil
        earnings = nil
        error = nil
    }

    public func retry() {
        guard !stopped, selectedEndDay != nil else { return }
        fetch()
    }

    public func stop() {
        stopped = true
        cancel()
        earnings = nil
        error = nil
    }

    private func identity(_ view: MonitorView?, includeEarningsSchema: Bool = true) -> [String]? {
        guard let view, let earnings = view.earnings else { return nil }
        return [view.wallet, view.network, view.provenance.genesisHash, view.provenance.programAddress,
                view.provenance.sourceCommit, view.provenance.commitment, String(view.schemaVersion),
                earnings.timeZone] + (includeEarningsSchema ? [String(earnings.schemaVersion)] : [])
    }

    private func cancel() {
        generation += 1
        task?.cancel()
        task = nil
        isLoading = false
    }

    private func fetch() {
        cancel()
        earnings = nil
        error = nil
        guard let selectedEndDay, let monitor, let zone = monitor.earnings?.timeZone else { return }
        isLoading = true
        let requestGeneration = generation
        let loader = load
        let requestedNow = clock
        let startedAt = Date()
        task = Task { [weak self] in
            do {
                let data = try await loader(selectedEndDay, zone)
                try Task.checkCancellation()
                let result = try EarningsHistoryResponse.decode(data, monitor: monitor, endDay: selectedEndDay,
                    now: requestedNow.addingTimeInterval(max(0, Date().timeIntervalSince(startedAt))))
                guard let self, self.generation == requestGeneration, !self.stopped else { return }
                self.earnings = result
                self.isLoading = false
                self.task = nil
            } catch {
                guard let self, self.generation == requestGeneration, !self.stopped else { return }
                self.earnings = nil
                self.error = "Historical earnings could not be verified. Try again."
                self.isLoading = false
                self.task = nil
            }
        }
    }
}
