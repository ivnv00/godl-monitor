/// Serializes each read-only helper across sleep, wake and application shutdown.
/// A wake during an existing helper needs one later attempt, not a second writer.
public struct MonitorRefreshLifecycle: Sendable {
    public enum Channel: CaseIterable, Sendable { case observation, accounting }
    private var active: Set<Channel> = []
    private var pending: Set<Channel> = []
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
        pending.formUnion(Channel.allCases)
        return true
    }

    public mutating func begin(_ channel: Channel, queueIfBusy: Bool = false) -> Bool {
        guard !stopped, !sleeping else { return false }
        guard !active.contains(channel) else {
            if queueIfBusy { pending.insert(channel) }
            return false
        }
        active.insert(channel)
        pending.remove(channel)
        return true
    }

    /// Explicit refreshes and wake requests coalesce into one follow-up. Periodic
    /// ticks may skip busy helpers so a slow provider cannot create a retry loop.
    public mutating func finish(_ channel: Channel) -> Bool {
        guard active.remove(channel) != nil else { return false }
        return !stopped && !sleeping && pending.contains(channel)
    }

    public mutating func stop() {
        stopped = true
        pending.removeAll()
    }
}
