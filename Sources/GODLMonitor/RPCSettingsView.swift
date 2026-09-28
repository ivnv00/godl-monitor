import SwiftUI
import GODLCore

// Hallmark · component: checked RPC setup · Warm Ledger · P5 H4 E4 S5 R5 V4
struct RPCSettingsView: View {
    @ObservedObject var controller: MonitorController
    @State private var expanded = false
    @State private var endpoint = ""
    @State private var errorMessage: String?
    @State private var notice: String?
    @State private var requestID: UUID?
    @State private var task: Task<Void, Never>?
    @FocusState private var focused: Bool
    private var checking: Bool { requestID != nil }
    private var empty: Bool { endpoint.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }

    var body: some View {
        DisclosureGroup("Private RPC", isExpanded: $expanded) {
            VStack(alignment: .leading, spacing: 12) {
                Text("Use your own Mainnet HTTPS RPC URL. We check the connection before saving; your current endpoint stays in place if the check fails.")
                    .font(LedgerType.meta).foregroundStyle(WarmLedger.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                SecureField("HTTPS RPC URL", text: $endpoint).textFieldStyle(.plain)
                    .font(.system(size: 13, design: .monospaced)).padding(12).frame(minHeight: 44)
                    .ledgerFieldSurface(focused: focused, invalid: errorMessage != nil)
                    .focused($focused).accessibilityLabel("Private RPC endpoint")
                    .disabled(checking).onSubmit(checkAndSave)
                    .onChange(of: endpoint) { errorMessage = nil; if !endpoint.isEmpty { notice = nil } }
                if let errorMessage {
                    Text(errorMessage).font(LedgerType.meta).foregroundStyle(WarmLedger.critical)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if let notice {
                    Text(notice).font(LedgerType.meta).foregroundStyle(WarmLedger.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                HStack(spacing: 12) {
                    Button(action: checkAndSave) {
                        HStack(spacing: 8) {
                            if checking { ProgressView().controlSize(.small) }
                            Text(checking ? "Checking…" : "Check & save")
                        }
                    }.buttonStyle(LedgerButtonStyle(minWidth: 150)).ledgerFocusRing().disabled(empty || checking)
                    if checking {
                        Button("Cancel") { cancel(showNotice: true) }
                            .buttonStyle(LedgerButtonStyle()).ledgerFocusRing()
                    }
                }
                Text("The check sends no wallet address. RPC settings stay on this Mac with owner-only file access.")
                    .font(LedgerType.caption).foregroundStyle(WarmLedger.tertiary)
                    .fixedSize(horizontal: false, vertical: true)
            }.padding(.top, 8)
        }
        .disclosureGroupStyle(LedgerDisclosureStyle())
        .onChange(of: expanded) { if !expanded { cancel(showNotice: false) } }
        .onDisappear { cancel(showNotice: false) }
    }

    private func checkAndSave() {
        guard !empty, !checking else { return }
        let id = UUID(), input = endpoint
        requestID = id
        errorMessage = nil
        notice = nil
        focused = false
        task = Task { @MainActor in
            do {
                let url = try WalletSettingsStore.rpcEndpoint(input)
                try await RPCConnectionCheck().check(url)
                guard requestID == id else { return }
                try Task.checkCancellation()
                // Commit and feedback share one main-actor turn: Cancel cannot
                // report an unchanged endpoint after a background save has won.
                try controller.saveRPC(input)
                endpoint = ""
                notice = "Mainnet connection checked and saved. The next refresh will use it."
            } catch {
                guard requestID == id else { return }
                if error is CancellationError {
                    notice = "Check cancelled. Your previous RPC is unchanged."
                } else {
                    errorMessage = (error as? RPCConnectionError)?.errorDescription
                        ?? (error as? WalletSettingsError)?.errorDescription
                        ?? "Couldn’t save RPC settings. Your previous endpoint is unchanged."
                    focused = true
                }
            }
            requestID = nil
            task = nil
        }
    }

    private func cancel(showNotice: Bool) {
        guard checking else { return }
        requestID = nil
        task?.cancel()
        task = nil
        if showNotice { notice = "Check cancelled. Your previous RPC is unchanged."; focused = true }
    }
}
