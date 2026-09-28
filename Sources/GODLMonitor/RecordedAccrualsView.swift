import SwiftUI
import GODLCore

/// One consistent summary across Activity, Overview and the menu-bar widget.
struct RecordedAccrualsView: View {
    @ObservedObject var notifications: RewardNotifications
    let earnings: Earnings?
    var compact = false

    var body: some View {
        let summary = RecordedAccruals(entries: notifications.entries, calendar: earnings?.calendar ?? .current)
        let usd = notifications.inboxError == nil ? summary.valueUsd(market: earnings?.market) : nil
        VStack(alignment: .leading, spacing: compact ? 6 : 12) {
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                Text("Recorded today").font(compact ? LedgerType.meta : LedgerType.section)
                Spacer(minLength: 0)
                Text(usd.map { approximateUSDText($0) } ?? status(summary))
                    .font(compact ? LedgerType.section : LedgerType.cost).monospacedDigit()
                    .lineLimit(1).minimumScaleFactor(0.7)
            }
            if summary.isValid, summary.hasAccruals {
                HStack(spacing: compact ? 8 : 24) {
                    amount("Unrefined", units: summary.unrefinedUnits, asset: .godl)
                    amount("Refined", units: summary.refinedUnits, asset: .godl)
                    amount("Gold", units: summary.goldUnits, asset: .gold)
                }
            }
            Text(summary.excludedCrossDayCount > 0
                 ? "Before fees & costs · overnight accruals excluded"
                 : "Recorded increases · before fees & costs")
                .font(LedgerType.caption).foregroundStyle(WarmLedger.tertiary)
                .fixedSize(horizontal: false, vertical: true)
                .help("Saved increases wholly within today (\(earnings?.timeZone ?? TimeZone.current.identifier)). Gaps and cross-day catch-up intervals are excluded. This is the value of recorded rewards at current prices, not complete daily income or net profit. — means no increase recorded, not a verified zero.\(notifications.inboxError.map { " \($0)" } ?? "")")
        }
    }

    private func status(_ summary: RecordedAccruals) -> String {
        if notifications.inboxError != nil || !summary.isValid { return "History unavailable" }
        return summary.hasAccruals ? "Prices unavailable" : "No records yet"
    }

    private func amount(_ title: String, units: UInt64?, asset: LedgerAsset) -> some View {
        let exact = units.map { RewardTracker.format(units: $0, decimals: asset == .gold ? 6 : 11) }
        let usd = exact.flatMap { activityUSD($0, asset: asset.symbol, market: earnings?.market) }
        let formatted = exact.map { activityAmount($0, places: asset == .gold ? 6 : 4) } ?? "—"
        return VStack(alignment: .leading, spacing: 4) {
            Text(title).font(LedgerType.caption).foregroundStyle(WarmLedger.tertiary)
            LedgerAmount(value: formatted, asset: asset, iconSize: compact ? 10 : 12, minimumScale: 0.7)
                .font(compact ? LedgerType.caption : LedgerType.section).monospacedDigit()
        }.frame(maxWidth: .infinity, alignment: .leading)
            .help(exact.map { "+\($0) \(title) · \(asset.symbol) · \(usd.map { approximateUSDText($0, places: 6) + " at current prices" } ?? "USD unavailable") · before fees and costs" }
                  ?? "No \(title.lowercased()) increase recorded today; missing observations are not zero.")
    }
}

func netAvailabilityText(_ status: DailyNetAvailability) -> String {
    switch status {
    case .value(let value): approximateUSDText(value)
    case .settling: "Awaiting settlement"
    case .pricesUnavailable: "Prices unavailable"
    case .incomplete: "Incomplete history"
    case .noHistory: "No verified history"
    case .needsReview: "Needs review"
    case .updating: "Updating history"
    }
}
