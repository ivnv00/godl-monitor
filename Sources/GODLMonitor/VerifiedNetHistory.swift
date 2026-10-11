import SwiftUI
import GODLCore

/// Shared week selection for covered accounting; live summaries keep their own data.
struct VerifiedNetHistory: View {
    @ObservedObject var history: EarningsHistoryController
    var accountingState: String?
    var compact = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 4) {
                Button { history.previous() } label: {
                    Image(systemName: "chevron.left").frame(width: 40, height: 40)
                }.disabled(!history.window.hasEarlier)
                    .accessibilityLabel("Previous seven days of verified net")
                    .help("Previous seven days of verified net")
                Spacer(minLength: 0)
                Text(history.window.label).font(LedgerType.caption).monospacedDigit()
                    .foregroundStyle(WarmLedger.secondary)
                    .accessibilityLabel("Verified net dates: \(history.window.label)")
                Spacer(minLength: 0)
                Button { history.next() } label: {
                    Image(systemName: "chevron.right").frame(width: 40, height: 40)
                }.disabled(!history.window.hasLater)
                    .accessibilityLabel("Next seven days of verified net")
                    .help("Next seven days of verified net")
            }.buttonStyle(LedgerRowButtonStyle()).ledgerFocusRing()
            if history.window.hasLater {
                Button("Latest week") { history.latest() }
                    .font(LedgerType.meta).frame(minHeight: 40)
                    .buttonStyle(LedgerRowButtonStyle()).ledgerFocusRing()
                    .accessibilityLabel("Return to latest verified-net week")
            }
            if history.isLoading {
                HStack(spacing: 10) {
                    ProgressView().controlSize(.small)
                    Text("Loading covered history…").font(LedgerType.meta)
                }.foregroundStyle(WarmLedger.secondary).frame(minHeight: 120)
            } else if let error = history.error {
                VStack(alignment: .leading, spacing: 10) {
                    Text(error).font(LedgerType.meta).foregroundStyle(WarmLedger.caution)
                    Button("Retry history") { history.retry() }
                        .buttonStyle(LedgerButtonStyle()).ledgerFocusRing()
                }.frame(minHeight: 120)
            } else if let earnings = history.displayedEarnings {
                EarningsBarChart(earnings: earnings, accountingState: accountingState)
                    .id(history.window.endDay)
                EarningsTableNote(earnings: earnings)
                EarningsTable(earnings: earnings, days: earnings.days, compact: compact,
                              accountingState: accountingState).padding(.top, 10)
            } else {
                Text("Waiting for verified history").font(LedgerType.meta)
                    .foregroundStyle(WarmLedger.tertiary).frame(minHeight: 120)
            }
        }
    }
}
