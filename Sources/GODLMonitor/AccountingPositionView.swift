import SwiftUI
import GODLCore

/// The same exact cash and outstanding-SOL evidence in the window and compact details.
struct AccountingPositionView: View {
    let position: AccountingPosition
    let timeZone: String
    var compact = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Current accounting position").font(LedgerType.section).foregroundStyle(WarmLedger.ink)
            Text("\(date(position.fromAt)) – \(date(position.throughAt)) · \(timeZone)")
                .font(LedgerType.caption).foregroundStyle(WarmLedger.tertiary)
            amount("Net cash spent", position.netSpendSol + " SOL")
            amount("At historical event prices", exactUSD(position.netSpendUsd))
            Text("Cash spent less actual SOL receipts; capital funding excluded. A negative amount means net receipts.")
                .font(LedgerType.caption).foregroundStyle(WarmLedger.tertiary)
            if let pending = position.pendingRound {
                LedgerRule()
                amount("Pending stake", pending.deployedSol.display + " SOL")
                Text("Round \(pending.roundId) · outcome unknown. The stake is not a known loss; no win or refund is assumed.")
                    .font(LedgerType.caption).foregroundStyle(WarmLedger.secondary)
            }
            LedgerRule()
            amount("Stored SOL before claim deductions", position.storedSol.display + " SOL")
            if position.storedSol.lamports != "0" {
                Text("Gross stored rewards, still unclaimed. Actual receipt depends on the claim route and its deductions.")
                    .font(LedgerType.caption).foregroundStyle(WarmLedger.secondary)
            }
            if !position.netReady {
                Text("Current complete net unavailable while SOL remains outstanding. Earlier settled results keep their own coverage dates.")
                    .font(LedgerType.meta).foregroundStyle(WarmLedger.caution)
            }
            DisclosureGroup("Accounting scope") {
                Text(position.reason).font(LedgerType.caption).foregroundStyle(WarmLedger.tertiary).padding(.top, 8)
            }.font(LedgerType.meta)
        }
        .fixedSize(horizontal: false, vertical: true)
        .textSelection(.enabled)
        .padding(LedgerLayout.cardInset)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(WarmLedger.control.opacity(0.30), in: RoundedRectangle(cornerRadius: LedgerLayout.cardRadius))
    }

    @ViewBuilder private func amount(_ title: String, _ value: String) -> some View {
        if compact {
            VStack(alignment: .leading, spacing: 4) {
                Text(title).font(LedgerType.meta).foregroundStyle(WarmLedger.secondary)
                Text(value).font(LedgerType.body).monospacedDigit().foregroundStyle(WarmLedger.ink)
            }
        } else {
            HStack(alignment: .firstTextBaseline, spacing: 20) {
                Text(title).font(LedgerType.meta).foregroundStyle(WarmLedger.secondary)
                Spacer(minLength: 0)
                Text(value).font(LedgerType.body).monospacedDigit().foregroundStyle(WarmLedger.ink)
            }
        }
    }

    private func date(_ value: Date) -> String {
        let formatter = DateFormatter()
        formatter.timeZone = TimeZone(identifier: timeZone)
        formatter.dateFormat = "MMM d, HH:mm:ss"
        return formatter.string(from: value)
    }

    private func exactUSD(_ value: String) -> String {
        value.hasPrefix("-") ? "-$" + value.dropFirst() : "$" + value
    }
}

func outstandingPositionText(_ position: AccountingPosition) -> String {
    if position.pendingRound != nil && position.storedSol.lamports != "0" { return "Pending stake · stored SOL outstanding" }
    return position.pendingRound != nil ? "Pending stake · outcome unknown" : "Stored SOL · before claim deductions"
}
