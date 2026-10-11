import SwiftUI
import GODLCore

// Hallmark · pre-emit critique: P5 H5 E4 S5 R5 V4
// Warm Ledger native components. Values are projected by the existing accounting engine.
struct PopoverEarningsSummary: View {
    let monitor: MonitorView?
    @ObservedObject var notifications: RewardNotifications
    let action: () -> Void

    var body: some View {
        Group {
            if let earnings = monitor?.earnings, earnings.day()?.netRewardUsd != nil, earnings.market.isFresh() {
                VStack(alignment: .leading, spacing: 4) {
                    Button(action: action) {
                        header("Daily earnings").frame(height: 40)
                    }.buttonStyle(LedgerRowButtonStyle()).ledgerFocusRing()
                        .accessibilityLabel("Daily earnings. Show full history")
                    EarningsBarChart(earnings: earnings, compact: true, accountingState: monitor?.accounting?.state)
                    EarningsTableNote(earnings: earnings).padding(.top, 4)
                }.padding(.horizontal, LedgerLayout.cardInset).padding(.bottom, LedgerLayout.cardInset)
            } else {
                Button(action: action) {
                    VStack(alignment: .leading, spacing: 6) {
                        header("Recorded today")
                        RecordedAccrualsView(notifications: notifications, earnings: monitor?.earnings, compact: true)
                    }.padding(LedgerLayout.cardInset).frame(maxWidth: .infinity, alignment: .leading)
                }.buttonStyle(LedgerRowButtonStyle()).ledgerFocusRing()
                    .accessibilityHint(netHelp + ". Show daily earnings and exact amounts")
            }
        }.background(WarmLedger.control.opacity(0.30), in: RoundedRectangle(cornerRadius: LedgerLayout.cardRadius))
    }

    private var netStatus: DailyNetAvailability {
        DailyNetAvailability(day: monitor?.earnings?.day(), market: monitor?.earnings?.market,
                             accountingState: monitor?.accounting?.state, calendar: monitor?.earnings?.calendar ?? .current)
    }

    private var netHelp: String { "Verified net: " + netAvailabilityText(netStatus) }

    private func header(_ title: String) -> some View {
        HStack(spacing: 10) {
            Text(title).font(LedgerType.meta).foregroundStyle(WarmLedger.secondary)
            Spacer(minLength: 0)
            if case .value = netStatus {
                EmptyView()
            } else {
                Image(systemName: netStatus == .settling ? "clock" : netStatus == .needsReview ? "exclamationmark.circle" : "info.circle")
                    .foregroundStyle(netStatus == .needsReview ? WarmLedger.caution : WarmLedger.tertiary)
                    .help(netHelp).accessibilityLabel(netHelp)
            }
            Image(systemName: "chevron.right").foregroundStyle(WarmLedger.icon).accessibilityHidden(true)
        }.font(.system(size: 11, weight: .medium))
    }
}

struct PopoverRewardCard: View {
    let kind: RewardKind
    let monitor: MonitorView?
    let action: () -> Void
    @State private var isHovering = false

    private var usdValue: String {
        guard case .observed = kind.total(in: monitor?.balances) else { return "USD unavailable" }
        let value = kind == .refined ? monitor?.earnings?.holdings.refinedUsd : monitor?.earnings?.holdings.goldUsd
        let estimate = marketUSD(value, market: monitor?.earnings?.market)
        return estimate == "—" ? "USD unavailable" : estimate
    }

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 7) {
                    LedgerAssetMark(asset: kind.asset, size: 16)
                    Text(kind == .refined ? "Refined" : "Gold").font(LedgerType.meta)
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.right").font(.system(size: 10, weight: .medium)).foregroundStyle(WarmLedger.icon)
                }
                VStack(alignment: .leading, spacing: 3) {
                    Text(kind.summary(in: monitor)).font(.system(size: 23, weight: .medium)).monospacedDigit()
                        .lineLimit(1).minimumScaleFactor(0.75)
                    Text(isHovering ? "\(kind.symbol) · \(usdValue)" : kind.symbol)
                        .font(LedgerType.caption).monospacedDigit()
                        .foregroundStyle(isHovering ? WarmLedger.secondary : WarmLedger.tertiary)
                        .lineLimit(1).minimumScaleFactor(0.8)
                        .frame(height: 15, alignment: .leading)
                }
            }.padding(LedgerLayout.cardInset).frame(maxWidth: .infinity, alignment: .leading)
                .background(WarmLedger.control.opacity(0.30), in: RoundedRectangle(cornerRadius: LedgerLayout.cardRadius))
                .contentShape(RoundedRectangle(cornerRadius: LedgerLayout.cardRadius))
        }.buttonStyle(LedgerRowButtonStyle()).ledgerFocusRing()
            .onHover { isHovering = $0 }
            .help(holdingValueHelp(kind == .refined ? monitor?.earnings?.holdings.refinedUsd : monitor?.earnings?.holdings.goldUsd,
                                  monitor: monitor, asset: kind.symbol) + " Claimable balance, including accrued rewards. Open details.")
            .accessibilityLabel("\(kind.title), \(kind.summary(in: monitor)) \(kind.symbol), claimable. Show details")
            .accessibilityValue(usdValue + " at current prices, before claim fees")
    }
}

struct PopoverDailyBreakdown: View {
    let monitor: MonitorView?
    @ObservedObject var notifications: RewardNotifications
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            RecordedAccrualsView(notifications: notifications, earnings: monitor?.earnings)
            row("Verified net", netAvailabilityText(DailyNetAvailability(day: monitor?.earnings?.day(),
                market: monitor?.earnings?.market, accountingState: monitor?.accounting?.state, calendar: monitor?.earnings?.calendar ?? .current)))
            Text("Recorded increases only, valued at current prices. Gaps and overnight catch-up intervals are excluded; missing observations are not zero.")
                .font(LedgerType.caption).foregroundStyle(WarmLedger.tertiary)
            LedgerRule()
            RecordedHistoryChart(entries: notifications.entries, earnings: monitor?.earnings, historyError: notifications.inboxError)
            if let earnings = monitor?.earnings {
                DisclosureGroup("Verified net & covered amounts") {
                    EarningsBarChart(earnings: earnings, accountingState: monitor?.accounting?.state)
                    EarningsTableNote(earnings: earnings)
                    EarningsTable(earnings: earnings, days: earnings.days, compact: true, accountingState: monitor?.accounting?.state).padding(.top, 10)
                }.font(LedgerType.meta).tint(WarmLedger.icon)
                DisclosureGroup("Latest calculation") {
                    VStack(alignment: .leading, spacing: 12) {
                        if let day = earnings.days.filter({ $0.netRewardUsd != nil }).max(by: { $0.day < $1.day }) {
                            Text(day.day).font(LedgerType.caption).foregroundStyle(WarmLedger.tertiary)
                            row("After-fee rewards", marketUSD(day.rewardValueUsd, market: earnings.market))
                            row("Mining spend", day.netSpendUsd.map { approximateUSDText($0) } ?? "—")
                            LedgerRule()
                            row("Net", marketUSD(day.netRewardUsd, market: earnings.market))
                            if let start = day.fromAt, let end = day.throughAt {
                                Text("\(time(start, in: earnings.timeZone))–\(time(end, in: earnings.timeZone)) · \(earnings.timeZone)")
                                    .font(LedgerType.caption).foregroundStyle(WarmLedger.tertiary)
                            }
                        }
                        if !earnings.days.contains(where: { $0.netRewardUsd != nil }) {
                            Text("No verified calculation yet")
                        }
                        Text("Net needs a covered reward and cost interval. USD uses current prices.")
                            .font(LedgerType.caption).foregroundStyle(WarmLedger.tertiary)
                    }.padding(.top, 12)
                }.font(LedgerType.meta).tint(WarmLedger.icon)
            }
        }
    }
    private func time(_ date: Date, in zone: String) -> String {
        let formatter = DateFormatter()
        formatter.timeZone = TimeZone(identifier: zone)
        formatter.dateFormat = "HH:mm"
        return formatter.string(from: date)
    }
    private func row(_ title: String, _ value: String) -> some View {
        HStack { Text(title).foregroundStyle(WarmLedger.secondary); Spacer(); Text(value).monospacedDigit() }.font(LedgerType.meta)
    }
}
