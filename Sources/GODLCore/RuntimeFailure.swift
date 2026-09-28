import Foundation

/// The helper owns error classification; the UI owns trusted display copy.
/// Unknown codes, old stderr and malformed replies never become visible text.
public enum RuntimeFailure: String, CaseIterable, Sendable {
    case accessDenied, rateLimited, timedOut, unreachable, providerUnavailable
    case wrongNetwork, configuration, localStorage, invalidData, invocation, unexpected
    case runtimeUnavailable

    public static func decode(stderr: String) -> Self {
        struct Envelope: Decodable {
            let schemaVersion: Int
            let kind: String
            let code: String
        }
        // Node may put a runtime warning before the final single-line envelope.
        for line in stderr.split(separator: "\n").reversed() where line.utf8.count <= 4096 {
            if let envelope = try? JSONDecoder().decode(Envelope.self, from: Data(line.utf8)),
               envelope.schemaVersion == 1, envelope.kind == "godl-runtime-failure" {
                return Self(rawValue: envelope.code) ?? .unexpected
            }
        }
        return .unexpected
    }

    public var title: String {
        switch self {
        case .accessDenied: "RPC access rejected"
        case .rateLimited: "Provider rate limit"
        case .timedOut: "Connection timed out"
        case .unreachable: "Provider unreachable"
        case .providerUnavailable: "Provider unavailable"
        case .wrongNetwork: "Mainnet RPC required"
        case .configuration: "Check RPC settings"
        case .localStorage: "Check local storage"
        case .invalidData: "Data couldn’t be verified"
        case .invocation, .runtimeUnavailable: "App needs attention"
        case .unexpected: "Update unavailable"
        }
    }

    public var guidance: String {
        switch self {
        case .accessDenied: "Check your RPC key and its access rules in Settings."
        case .rateLimited: "The next scheduled check will retry. If this persists, check your provider’s quota in Settings."
        case .timedOut, .unreachable: "Check your internet connection, then try Refresh."
        case .providerUnavailable: "The provider couldn’t complete the request. Try again shortly."
        case .wrongNetwork: "Use a Solana Mainnet HTTPS RPC URL in Settings."
        case .configuration: "Re-enter and check your private RPC URL in Settings."
        case .localStorage: "Check available disk space and file access, then try again."
        case .invalidData: "The new data couldn’t be verified. Try again; if this persists, review support diagnostics in Settings."
        case .invocation, .runtimeUnavailable: "Reopen the app. If this persists, replace it with a complete copy. Your saved history is kept separately."
        case .unexpected: "Try again. If this persists, review support diagnostics in Settings."
        }
    }

    public var message: String { title + ". " + guidance }
}

extension AccountingStatus {
    public var failure: RuntimeFailure? {
        guard state != "current", state != "waiting" else { return nil }
        return failureCode.flatMap(RuntimeFailure.init(rawValue:)) ?? .unexpected
    }

    /// Older checkpoints may contain provider text. Keep reading their trusted
    /// amounts, but never echo their reason field to the interface.
    public var displayReason: String {
        switch state {
        case "current": "Closed mining history reconciled. Active funds remain outside the dated cost."
        case "waiting": "Waiting for settled mining history and a newer finalized slot."
        default: failure?.message ?? RuntimeFailure.unexpected.message
        }
    }
}
