import SwiftUI

struct WalletSetupView: View {
    @ObservedObject var controller: MonitorController
    var compact = false
    var settings = false
    @State private var wallet = ""
    @State private var endpoint = ""
    @State private var walletError: String?
    @State private var rpcError: String?
    @State private var walletNotice: String?
    @State private var rpcNotice: String?
    @State private var showRPC = false
    @FocusState private var focusedField: Field?
    private enum Field { case wallet, rpc }
    private var walletIsEmpty: Bool { wallet.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    private var endpointIsEmpty: Bool { endpoint.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            if !settings {
                GODLWordmark(width: compact ? 100 : 144)
                Text("Your mining, at a glance.")
                    .font(compact ? LedgerType.section : .system(size: 34, design: .serif))
                Text("Add a public Solana wallet to follow GODL balances, rewards and goals.")
                    .font(LedgerType.body).foregroundStyle(WarmLedger.secondary)
            } else { Text("Wallet").font(LedgerType.section) }
            VStack(alignment: .leading, spacing: 8) {
                Text("Public Solana address").font(LedgerType.meta)
                TextField("Paste a public address", text: $wallet).textFieldStyle(.plain)
                    .font(.system(size: 13, design: .monospaced)).padding(12).frame(minHeight: 44)
                    .ledgerFieldSurface(focused: focusedField == .wallet, invalid: walletError != nil)
                    .focused($focusedField, equals: .wallet).accessibilityLabel("Public Solana wallet address")
                    .onSubmit(saveWallet)
                    .onChange(of: wallet) { walletError = nil; walletNotice = nil }
                Text(settings ? "A different wallet opens on the next launch, with its own local history." : "Read-only. No wallet connection or recovery phrase.")
                    .font(LedgerType.caption).foregroundStyle(WarmLedger.tertiary)
            }
            if let message = walletError ?? controller.setupError {
                Text(message).font(LedgerType.meta).foregroundStyle(WarmLedger.critical)
            }
            if let notice = walletNotice {
                Text(notice).font(LedgerType.meta).foregroundStyle(WarmLedger.positive)
            }
            Button(settings ? "Save wallet" : "Start monitoring", action: saveWallet)
                .buttonStyle(LedgerButtonStyle(fillsWidth: !settings)).ledgerFocusRing().disabled(walletIsEmpty)
            if settings {
                DisclosureGroup("Private RPC", isExpanded: $showRPC) {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Optional. Supply your own HTTPS endpoint, including a Helius key if you use one. Saved locally with owner-only file access.")
                            .font(LedgerType.meta).foregroundStyle(WarmLedger.secondary)
                        SecureField("HTTPS RPC URL", text: $endpoint).textFieldStyle(.plain)
                            .font(.system(size: 13, design: .monospaced)).padding(12).frame(minHeight: 44)
                            .ledgerFieldSurface(focused: focusedField == .rpc, invalid: rpcError != nil)
                            .focused($focusedField, equals: .rpc).accessibilityLabel("Private RPC endpoint")
                            .onSubmit(saveRPC)
                            .onChange(of: endpoint) { rpcError = nil; if !endpoint.isEmpty { rpcNotice = nil } }
                        if let rpcError {
                            Text(rpcError).font(LedgerType.meta).foregroundStyle(WarmLedger.critical)
                        }
                        if let rpcNotice {
                            Text(rpcNotice).font(LedgerType.meta).foregroundStyle(WarmLedger.positive)
                        }
                        Button("Save RPC", action: saveRPC)
                            .buttonStyle(LedgerButtonStyle()).ledgerFocusRing().disabled(endpointIsEmpty)
                    }.padding(.top, 8)
                }.disclosureGroupStyle(LedgerDisclosureStyle())
            }
            if !settings {
                Text("Your wallet address is sent to the Solana RPC provider you use. History and preferences stay on this Mac.")
                    .font(LedgerType.caption).foregroundStyle(WarmLedger.tertiary)
            }
        }
        .frame(maxWidth: settings ? .infinity : 480, alignment: .leading)
        .padding(settings ? 0 : compact ? 22 : 40)
        .foregroundStyle(WarmLedger.ink)
        .onAppear { wallet = controller.configuredWallet }
    }

    private func saveWallet() {
        guard !walletIsEmpty else { return }
        do {
            try controller.saveWallet(wallet)
            walletError = nil
            walletNotice = controller.setupNotice
            focusedField = nil
        } catch {
            walletError = error.localizedDescription
            walletNotice = nil
            focusedField = .wallet
        }
    }

    private func saveRPC() {
        guard !endpointIsEmpty else { return }
        do {
            try controller.saveRPC(endpoint)
            endpoint = ""
            rpcError = nil
            focusedField = nil
            rpcNotice = controller.setupNotice
        } catch {
            rpcError = error.localizedDescription
            rpcNotice = nil
            focusedField = .rpc
        }
    }
}
