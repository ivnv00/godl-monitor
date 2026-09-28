import SwiftUI
import GODLCore

// Warm Ledger · shared reward summary and exact, read-only breakdown.
enum RewardKind: String, Identifiable {
    case refined, gold
    var id: String { rawValue }
    var title: String { self == .refined ? "Refined GODL" : "Gold rewards" }
    var symbol: String { self == .refined ? "GODL" : "XAUt0" }

    func total(in balances: Balances?) -> Availability<TokenAmount>? {
        self == .refined ? balances?.refinedGodl : balances?.claimableGold
    }
    func stored(in balances: Balances?) -> Availability<TokenAmount>? {
        self == .refined ? balances?.storedRefinedGodl : balances?.storedGold
    }
    func pending(in balances: Balances?) -> Availability<TokenAmount>? {
        self == .refined ? balances?.pendingRefinedGodl : balances?.pendingGold
    }
    func summary(in monitor: MonitorView?) -> String {
        (self == .refined ? monitor?.refinedText : monitor?.goldText) ?? "—"
    }
}

struct RewardSummaryButton: View {
    let kind: RewardKind
    let monitor: MonitorView?
    let action: () -> Void

    var body: some View {
        PopoverRewardCard(kind: kind, monitor: monitor, action: action)
    }

}

struct RewardDetailSheet: View {
    let kind: RewardKind
    let monitor: MonitorView?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        LedgerDetailSheet(title: kind.title, note: "Claimable rewards", close: { dismiss() }) {
            RewardBreakdown(kind: kind, monitor: monitor)
        }
    }

}

struct RewardBreakdown: View {
    let kind: RewardKind
    let monitor: MonitorView?

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            VStack(alignment: .leading, spacing: 7) {
                Text(kind.summary(in: monitor)).font(LedgerType.balance).monospacedDigit()
                    .lineLimit(1).minimumScaleFactor(0.55)
                Text("\(kind.symbol) · claimable rewards").font(LedgerType.body).foregroundStyle(WarmLedger.secondary)
                Text(marketUSD(kind == .refined ? monitor?.earnings?.holdings.refinedUsd : monitor?.earnings?.holdings.goldUsd,
                               market: monitor?.earnings?.market) + " · before claim fees")
                    .font(LedgerType.caption).foregroundStyle(WarmLedger.tertiary)
                    .help(holdingValueHelp(kind == .refined ? monitor?.earnings?.holdings.refinedUsd : monitor?.earnings?.holdings.goldUsd,
                                          monitor: monitor, asset: kind.symbol))
            }
            if case .observed = kind.total(in: monitor?.balances) {
                LedgerRule()
                VStack(spacing: 14) {
                    amountRow("Recorded", kind.stored(in: monitor?.balances))
                    amountRow("Accrued", kind.pending(in: monitor?.balances))
                    LedgerRule()
                    amountRow("Total claimable", kind.total(in: monitor?.balances), emphasized: true)
                }
            } else {
                Text("This reward balance is unavailable in the latest observation. Refresh to check again.")
                    .font(LedgerType.body).foregroundStyle(WarmLedger.secondary)
            }
            DisclosureGroup {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Recorded rewards are on your miner account. Accrued rewards await settlement and are included in the total.")
                    Text(kind == .refined
                        ? "Refined rewards are separate from the unrefined GODL goal and mining acquisition cost."
                        : "XAUt0 rewards shown here exclude gold tokens already in your wallet.")
                }.font(LedgerType.meta).foregroundStyle(WarmLedger.secondary).padding(.top, 10)
            } label: {
                Text("Reward details").font(LedgerType.body).frame(minHeight: 40)
            }.tint(WarmLedger.strongBrass)
            if let monitor {
                Text("Observed \(ledgerDate(monitor.provenance.observedAt, format: "MMM d, HH:mm:ss")) · finalized")
                    .font(LedgerType.caption).foregroundStyle(WarmLedger.tertiary)
            }
        }.fixedSize(horizontal: false, vertical: true).textSelection(.enabled)
    }

    private func amountRow(_ label: String, _ amount: Availability<TokenAmount>?, emphasized: Bool = false) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Text(label).font(LedgerType.meta).foregroundStyle(WarmLedger.secondary)
            Spacer(minLength: 4)
            HStack(alignment: .firstTextBaseline, spacing: 5) {
                if case .observed(let value) = amount {
                    Text(value.display).monospacedDigit().fontWeight(emphasized ? .semibold : .regular)
                        .lineLimit(1).minimumScaleFactor(0.7)
                } else { Text("—") }
                Text(kind.symbol).foregroundStyle(WarmLedger.tertiary)
            }.font(LedgerType.meta).layoutPriority(1)
        }.frame(maxWidth: .infinity).accessibilityElement(children: .combine)
    }
}
