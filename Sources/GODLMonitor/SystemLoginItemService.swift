import GODLCore
import ServiceManagement

@MainActor
final class SystemLoginItemService: LoginItemService {
    private let service = SMAppService.mainApp

    var status: LoginItemStatus {
        switch service.status {
        case .notRegistered: .off
        case .enabled: .enabled
        case .requiresApproval: .requiresApproval
        case .notFound: .unavailable
        @unknown default: .unavailable
        }
    }

    func register() throws { try service.register() }
    func unregister() async throws {
        // Keep the service on the main actor even with SDKs lacking Sendable
        // annotations, while still waiting for asynchronous removal to finish.
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            service.unregister { @Sendable error in
                if let error { continuation.resume(throwing: error) }
                else { continuation.resume() }
            }
        }
    }
    func openSettings() { SMAppService.openSystemSettingsLoginItems() }
}
