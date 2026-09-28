import Combine
import Foundation

public enum LoginItemStatus: String, CaseIterable, Sendable {
    case off = "Off", enabled = "Enabled", requiresApproval = "Approval needed", unavailable = "Unavailable"
}

@MainActor
public protocol LoginItemService: AnyObject {
    var status: LoginItemStatus { get }
    func register() throws
    func unregister() async throws
    func openSettings()
}

/// macOS owns the preference. Reading state never registers or repairs a login item.
@MainActor
public final class LaunchAtLoginController: ObservableObject {
    @Published public private(set) var status: LoginItemStatus
    @Published public private(set) var isUpdating = false
    @Published public private(set) var errorMessage: String?
    private let service: any LoginItemService

    public init(service: any LoginItemService) {
        self.service = service
        status = service.status
    }

    public func refresh() {
        guard !isUpdating else { return }
        let current = service.status
        if status != current { errorMessage = nil }
        status = current
    }

    public func setEnabled(_ enabled: Bool) async {
        guard !isUpdating else { return }
        refresh()
        // A denied/pending registration belongs to macOS Settings. Never try
        // to override it by repeatedly registering the app.
        if enabled && (status == .enabled || status == .requiresApproval) { return }
        if !enabled && status == .off { return }
        guard status != .unavailable else { return }
        isUpdating = true
        errorMessage = nil
        defer { isUpdating = false }
        do {
            if enabled { try service.register() }
            else { try await service.unregister() }
        } catch {
            // Only the read-back state controls feedback; raw OS errors can
            // contain installation paths and must not become product copy.
        }
        status = service.status
        // Trust the OS read-back even if a competing Settings change caused
        // an already-registered/not-registered error from the operation.
        let completed = enabled ? status == .enabled || status == .requiresApproval : status == .off
        if !completed {
            errorMessage = enabled
                ? "Couldn’t enable launch at login. Open the installed app from Applications and check macOS Login Items."
                : "Couldn’t turn off launch at login. Check macOS Login Items and try again."
        }
    }

    public func openSettings() { service.openSettings() }
}
