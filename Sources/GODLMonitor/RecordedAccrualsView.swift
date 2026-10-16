import SwiftUI
import GODLCore

/// One consistent summary across Activity, Overview and the menu-bar widget.
struct RecordedAccrualsView: View {
    @ObservedObject var notifications: RewardNotifications
    let earnings: Earnings?
    var compact = false

    var body: some View {
        let calendar = earnings?.calendar ?? .current
        let rewards = RecordedAccrualSummary(entries: notifications.entries, calendar: calendar)
        let presentation = RecordedAccrualPresentation(summary: rewards, calendar: calendar)
        let summary = rewards.displayed
        let usd = notifications.inboxError == nil ? summary.valueUsd(market: earnings?.market) : nil
        VStack(alignment: .leading, spacing: 12) {
            if compact {
                VStack(alignment: .leading, spacing: 2) {
                    Text(usd.map { approximateUSDText($0) } ?? status(summary))
                        .font(usd == nil ? LedgerType.value : LedgerType.cost).monospacedDigit()
                        .lineLimit(1).minimumScaleFactor(0.7)
                    Text(presentation.caption)
                        .font(LedgerType.caption).foregroundStyle(WarmLedger.tertiary)
                        .fixedSize(horizontal: false, vertical: true)
                        .help(presentation.help + inboxHelp)
                        .accessibilityHint(presentation.help + inboxHelp)
                }
            } else {
                HStack(alignment: .firstTextBaseline, spacing: 12) {
                    Text(presentation.title).font(LedgerType.section)
                    Spacer(minLength: 0)
                    Text(usd.map { approximateUSDText($0) } ?? status(summary))
                        .font(LedgerType.cost).monospacedDigit()
                        .lineLimit(1).minimumScaleFactor(0.7)
                }
            }
            if summary.isValid, summary.hasAccruals {
                HStack(spacing: compact ? 12 : 24) {
                    amount("Unrefined", units: summary.unrefinedUnits, asset: .godl, isCatchUp: rewards.isCatchUp)
                    amount("Refined", units: summary.refinedUnits, asset: .godl, isCatchUp: rewards.isCatchUp)
                    amount("Gold", units: summary.goldUnits, asset: .gold, isCatchUp: rewards.isCatchUp)
                }
            }
            if !compact {
                Text(presentation.caption)
                    .font(LedgerType.caption).foregroundStyle(WarmLedger.tertiary)
                    .fixedSize(horizontal: false, vertical: true)
                    .help(presentation.help + inboxHelp)
                    .accessibilityHint(presentation.help + inboxHelp)
            }
        }
    }

    private var inboxHelp: String {
        notifications.inboxError.map { " \($0)" } ?? ""
    }

    private func status(_ summary: RecordedAccruals) -> String {
        if notifications.inboxError != nil || !summary.isValid { return "History unavailable" }
        return summary.hasAccruals ? "Prices unavailable" : "No records yet"
    }

    private func amount(_ title: String, units: UInt64?, asset: LedgerAsset, isCatchUp: Bool) -> some View {
        let exact = units.map { RewardTracker.format(units: $0, decimals: asset == .gold ? 6 : 11) }
        let usd = exact.flatMap { activityUSD($0, asset: asset.symbol, market: earnings?.market) }
        let formatted = exact.map { activityAmount($0, places: asset == .gold ? 6 : 4) } ?? "—"
        return VStack(alignment: .leading, spacing: 4) {
            Text(title).font(LedgerType.caption).foregroundStyle(WarmLedger.tertiary)
            if compact {
                Text(formatted).font(LedgerType.meta).monospacedDigit()
                    .lineLimit(1).minimumScaleFactor(0.7)
            } else {
                LedgerAmount(value: formatted, asset: asset, iconSize: 12, minimumScale: 0.7)
                    .font(LedgerType.section).monospacedDigit()
            }
        }.frame(maxWidth: .infinity, alignment: .leading)
            .help(exact.map { "+\($0) \(title) · \(asset.symbol) · \(usd.map { approximateUSDText($0, places: 6) + " at current prices" } ?? "USD unavailable") · before fees and costs" }
                  ?? "No \(title.lowercased()) increase recorded \(isCatchUp ? "in this interval" : "today"); missing observations are not zero.")
    }
}

/// Shared labels keep the widget heading and all reward summaries in the same scope.
struct RecordedAccrualPresentation {
    let summary: RecordedAccrualSummary
    let calendar: Calendar

    var title: String { summary.isCatchUp ? "Catch-up rewards" : "Recorded today" }

    var caption: String {
        if summary.isCatchUp { return "\(dateRange) · before fees & costs" }
        return summary.today.excludedCrossDayCount > 0
            ? "Before fees & costs · overnight accruals excluded"
            : "Before fees & costs"
    }

    var help: String {
        let scope: String
        if summary.isCatchUp, let from = summary.displayed.fromAt, let through = summary.displayed.throughAt {
            scope = "Saved catch-up increases observed from \(date(from, format: "d MMM yyyy HH:mm")) to \(date(through, format: "d MMM yyyy HH:mm")) (\(calendar.timeZone.identifier)). This observation interval cannot be allocated by day; unsupported days remain unknown in the daily chart."
        } else {
            scope = "Saved increases wholly within today (\(calendar.timeZone.identifier)). Gaps and cross-day catch-up intervals are excluded from today's total and the daily chart."
        }
        return scope + " Recorded rewards are valued at current prices, before fees and costs; they are not complete daily income or net profit. — means no increase recorded, not a verified zero."
    }

    private var dateRange: String {
        guard let from = summary.displayed.fromAt, let through = summary.displayed.throughAt else {
            return "Observation interval"
        }
        if calendar.component(.year, from: from) != calendar.component(.year, from: through) {
            return "\(date(from, format: "d MMM yyyy"))–\(date(through, format: "d MMM yyyy"))"
        }
        let startFormat = calendar.component(.month, from: from) == calendar.component(.month, from: through) ? "d" : "d MMM"
        return "\(date(from, format: startFormat))–\(date(through, format: "d MMM"))"
    }

    private func date(_ value: Date, format: String) -> String {
        let formatter = DateFormatter()
        formatter.calendar = calendar
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = calendar.timeZone
        formatter.dateFormat = format
        return formatter.string(from: value)
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
