/// Serializes each read-only helper across sleep, wake and application shutdown.
/// A wake during an existing helper needs one later attempt, not a second writer.
public struct MonitorRefreshLifecycle: Sendable {
    public enum Channel: CaseIterable, Sendable { case observation, accounting }
    private var active: Set<Channel> = []
    private var pendingWake: Set<Channel> = []
    private var sleeping = false
    private var stopped = false

    public init() {}

    public mutating func willSleep() {
        guard !stopped else { return }
        sleeping = true
    }

    /// Returns true only for the first wake following a sleep notification.
    public mutating func didWake() -> Bool {
        guard !stopped, sleeping else { return false }
        sleeping = false
        pendingWake.formUnion(Channel.allCases)
        return true
    }

    public mutating func begin(_ channel: Channel) -> Bool {
        guard !stopped, !sleeping, !active.contains(channel) else { return false }
        active.insert(channel)
        pendingWake.remove(channel)
        return true
    }

    /// The caller may start a queued post-wake attempt once the old helper exits.
    public mutating func finish(_ channel: Channel) -> Bool {
        guard active.remove(channel) != nil else { return false }
        return !stopped && !sleeping && pendingWake.contains(channel)
    }

    public mutating func stop() {
        stopped = true
        pendingWake.removeAll()
    }
}
