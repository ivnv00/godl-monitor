import AppKit
import GODLCore
import SwiftUI

// Hallmark · component: login preference · Warm Ledger · P5 H4 E4 S5 R5 V4
// Native switch and Ledger buttons own hover, focus, pressed and disabled states.
struct LaunchAtLoginSettingsView: View {
    @ObservedObject var model: LaunchAtLoginController

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 12) {
                Text("Launch at login").font(LedgerType.section)
                Spacer(minLength: 12)
                if model.isUpdating { ProgressView().controlSize(.small).accessibilityLabel("Updating login item") }
                Toggle("Launch at login", isOn: Binding(
                    get: { model.status == .enabled },
                    set: { value in Task { await model.setEnabled(value) } }))
                    .toggleStyle(.switch).labelsHidden().frame(minHeight: 40)
                    .disabled(model.isUpdating || model.status == .requiresApproval || model.status == .unavailable)
                    .accessibilityValue(model.isUpdating ? "Updating" : model.status.rawValue)
            }
            Text(guidance).font(LedgerType.meta).foregroundStyle(WarmLedger.secondary)
                .fixedSize(horizontal: false, vertical: true)
            if let error = model.errorMessage {
                Text(error).font(LedgerType.meta).foregroundStyle(WarmLedger.critical)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if model.status == .requiresApproval || model.status == .unavailable || model.errorMessage != nil {
                HStack(spacing: 12) {
                    Button("Open Login Items") { model.openSettings() }
                        .buttonStyle(LedgerButtonStyle()).ledgerFocusRing().disabled(model.isUpdating)
                    if model.status == .requiresApproval {
                        Button("Cancel registration") { Task { await model.setEnabled(false) } }
                            .buttonStyle(LedgerButtonStyle()).ledgerFocusRing().disabled(model.isUpdating)
                    }
                }
            }
        }
        .onAppear { model.refresh() }
        .onReceive(NotificationCenter.default.publisher(for: NSApplication.didBecomeActiveNotification)) { _ in model.refresh() }
    }

    private var guidance: String {
        if model.isUpdating { return "Updating your macOS login preference…" }
        switch model.status {
        case .off: return "Open GODL Monitor when you sign in to this Mac."
        case .enabled: return "GODL Monitor will open when you sign in. Turning this off keeps the current session running."
        case .requiresApproval: return "Approval needed in macOS Login Items. Monitoring won’t start at login until you allow it."
        case .unavailable: return "Login registration is unavailable. Open the installed app from Applications and check Login Items."
        }
    }
}
