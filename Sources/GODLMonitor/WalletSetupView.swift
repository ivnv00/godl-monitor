import SwiftUI

struct WalletSetupView: View {
    @ObservedObject var controller: MonitorController
    var compact = false
    var settings = false
    @State private var wallet = ""
    @State private var endpoint = ""
    @State private var error: String?
    @State private var showRPC = false
    @FocusState private var walletFocused: Bool

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
                    .background(WarmLedger.popover, in: RoundedRectangle(cornerRadius: 8))
                    .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(walletFocused ? WarmLedger.strongBrass : WarmLedger.controlBorder, lineWidth: walletFocused ? 2 : 1))
                    .focused($walletFocused).accessibilityLabel("Public Solana wallet address")
                Text(settings ? "A different wallet opens on the next launch, with its own local history." : "Read-only. No wallet connection or recovery phrase.")
                    .font(LedgerType.caption).foregroundStyle(WarmLedger.tertiary)
            }
            if let message = error ?? controller.setupError {
                Text(message).font(LedgerType.meta).foregroundStyle(WarmLedger.critical)
            }
            if let notice = controller.setupNotice {
                Text(notice).font(LedgerType.meta).foregroundStyle(WarmLedger.positive)
            }
            Button(settings ? "Save wallet" : "Start monitoring") {
                do { try controller.saveWallet(wallet); error = nil }
                catch { self.error = error.localizedDescription }
            }.buttonStyle(LedgerButtonStyle()).ledgerFocusRing().disabled(wallet.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            if settings {
                DisclosureGroup("Private RPC", isExpanded: $showRPC) {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Optional. Supply your own HTTPS endpoint, including a Helius key if you use one. Saved locally with owner-only file access.")
                            .font(LedgerType.meta).foregroundStyle(WarmLedger.secondary)
                        SecureField("HTTPS RPC URL", text: $endpoint).textFieldStyle(.roundedBorder)
                            .accessibilityLabel("Private RPC endpoint").frame(minHeight: 40)
                        Button("Save RPC") {
                            do { try controller.saveRPC(endpoint); endpoint = ""; error = nil }
                            catch { self.error = error.localizedDescription }
                        }.buttonStyle(LedgerButtonStyle()).ledgerFocusRing().disabled(endpoint.isEmpty)
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
}
