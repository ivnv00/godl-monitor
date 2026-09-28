import SwiftUI
import GODLCore

// Hallmark · pre-emit critique: P5 H5 E4 S5 R5 V4
// Warm Ledger native components. Values are projected by the existing accounting engine.
struct PopoverEarningsSummary: View {
    let monitor: MonitorView?
    let settling: Bool
    let action: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Button(action: action) {
                HStack(spacing: 8) {
                    Text("Daily earnings").font(LedgerType.section)
                    Spacer()
                    if settling {
                        Image(systemName: "clock.arrow.circlepath").foregroundStyle(WarmLedger.caution)
                            .help("Awaiting settlement · last reconciled intervals shown")
                    }
                    Image(systemName: "chevron.right").foregroundStyle(WarmLedger.icon)
                }.font(.system(size: 11, weight: .medium)).frame(height: 40).contentShape(Rectangle())
            }.buttonStyle(LedgerRowButtonStyle()).ledgerFocusRing()
                .accessibilityLabel("Daily earnings. Show full history")
            if let earnings = monitor?.earnings {
                EarningsBarChart(earnings: earnings, compact: true)
                EarningsTableNote(earnings: earnings).padding(.top, 4)
            } else {
                Text("Waiting for earnings history").font(LedgerType.meta).foregroundStyle(WarmLedger.tertiary)
                    .frame(maxWidth: .infinity, minHeight: 90, alignment: .leading)
            }
        }.padding(.horizontal, 10).padding(.bottom, 10)
            .background(WarmLedger.control.opacity(0.30), in: RoundedRectangle(cornerRadius: 14))
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
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            if let earnings = monitor?.earnings {
                EarningsBarChart(earnings: earnings)
                EarningsTableNote(earnings: earnings)
                DisclosureGroup("Exact amounts") {
                    EarningsTable(earnings: earnings, days: earnings.days, compact: true).padding(.top, 10)
                }.font(LedgerType.meta).tint(WarmLedger.icon)
                DisclosureGroup("Latest calculation") {
                    VStack(alignment: .leading, spacing: 12) {
                        if let day = earnings.days.first {
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
                        Text("Net updates after settlement. USD uses current prices.")
                            .font(LedgerType.caption).foregroundStyle(WarmLedger.tertiary)
                    }.padding(.top, 12)
                }.font(LedgerType.meta).tint(WarmLedger.icon)
            } else {
                Text("Waiting for earnings history").font(LedgerType.meta).foregroundStyle(WarmLedger.tertiary)
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
