import Foundation

/// An allowlisted support snapshot. Never accepts wallet data, endpoints, paths or raw errors.
public struct SupportDiagnostics: Equatable, Sendable {
    public enum Architecture: String, Sendable {
        case appleSilicon = "Apple silicon (arm64 process)", intel = "Intel (x86_64 process)", unknown = "Unknown"
    }
    public enum Profile: String, Sendable {
        case notSetUp = "Not set up", ready = "Configured", restartRequired = "Restart required"
        case needsAttention = "Needs attention"
    }
    public enum Observation: String, Sendable {
        case none = "No observations", current = "Current", stale = "Stale", updating = "Updating", failed = "Refresh failed"
    }
    public enum Quotes: String, Sendable { case unavailable = "Unavailable", current = "Current", expired = "Expired" }
    public enum Accounting: String, Sendable {
        case notSetUp = "Not set up", unavailable = "Unavailable", updating = "Updating", current = "History check current"
        case waiting = "Awaiting settlement", retrying = "Retrying", stale = "History check delayed", needsAttention = "Needs attention"

        public init(engineState: String?) {
            switch engineState {
            case "current": self = .current
            case "waiting": self = .waiting
            case "retrying": self = .retrying
            case nil: self = .unavailable
            default: self = .needsAttention
            }
        }
    }
    public enum Notifications: String, Sendable {
        case disabled = "Off", checking = "Checking permission", ready = "Ready"
        case permissionNeeded = "Permission needed", denied = "Denied", needsAttention = "Needs attention"
    }

    public let text: String

    public init(appVersion: String?, build: String?, osVersion: OperatingSystemVersion,
                architecture: Architecture, profile: Profile, runtimePresent: Bool,
                savedRPCConfiguration: Bool, observation: Observation, quotes: Quotes,
                accounting: Accounting, notifications: Notifications, launchAtLogin: LoginItemStatus = .unavailable) {
        let os = [osVersion.majorVersion, osVersion.minorVersion, osVersion.patchVersion]
        let osText = os.allSatisfy { (0...999).contains($0) } ? os.map(String.init).joined(separator: ".") : "Unknown"
        text = """
        GODL Monitor diagnostics · format 2
        App: \(Self.version(appVersion, maxParts: 4)) (build \(Self.version(build, maxParts: 1)))
        macOS: \(osText)
        Architecture: \(architecture.rawValue)
        Profile: \(profile.rawValue)
        Bundled runtime: \(runtimePresent ? "Present" : "Missing")
        RPC configuration: \(savedRPCConfiguration ? "Saved endpoint" : "Public default")
        Observations: \(observation.rawValue)
        Quotes: \(quotes.rawValue)
        Accounting: \(accounting.rawValue)
        Notifications: \(notifications.rawValue)
        Launch at login: \(launchAtLogin.rawValue)

        Status only; does not verify earnings.
        """
    }

    private static func version(_ value: String?, maxParts: Int) -> String {
        guard let value, value.utf8.count <= 27 else { return "Unknown" }
        let parts = value.split(separator: ".", omittingEmptySubsequences: false)
        guard (1...maxParts).contains(parts.count), parts.allSatisfy({ part in
            (1...6).contains(part.utf8.count) && part.utf8.allSatisfy { (48...57).contains($0) }
        }) else { return "Unknown" }
        return value
    }
}
