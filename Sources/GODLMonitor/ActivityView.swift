import SwiftUI
import GODLCore

// Hallmark · Warm Ledger activity ledger · pre-emit critique: P5 H5 E4 S5 R5 V4
// Journal entries and balance movements stay separate; neither is summed as net income.
struct ActivityPage: View {
    @ObservedObject var controller: MonitorController
    @ObservedObject var notifications: RewardNotifications
    let showEarnings: () -> Void
    @State private var mode: ActivityMode = .accruals
    @State private var asset: ActivityAsset = .all
    @State private var visibleCount = 40
    @State private var selectedChange: BalanceChange?

    private var entries: [RewardInboxEntry] { notifications.entries.filter { asset.includes($0) } }

    var body: some View {
        VStack(alignment: .leading, spacing: LedgerLayout.sectionGap) {
            todaySummary
            HStack(spacing: 16) {
                HStack(spacing: 4) {
                    ForEach(ActivityMode.allCases) { item in
                        Button { mode = item; visibleCount = 40 } label: {
                            Text(item.rawValue).font(LedgerType.meta.weight(.medium))
                                .padding(.horizontal, 12).frame(minHeight: 40)
                                .background(mode == item ? WarmLedger.selection : .clear, in: RoundedRectangle(cornerRadius: 8))
                        }.buttonStyle(LedgerRowButtonStyle()).ledgerFocusRing()
                            .accessibilityAddTraits(mode == item ? .isSelected : [])
                    }
                }
                Spacer(minLength: 0)
                if mode == .accruals {
                    Menu {
                        Picker("Asset", selection: $asset) {
                            ForEach(ActivityAsset.allCases) { item in Text(item.rawValue).tag(item) }
                        }
                    } label: {
                        HStack(spacing: 8) {
                            Text(asset.rawValue)
                            Image(systemName: "chevron.down").font(LedgerType.caption)
                        }.font(LedgerType.meta).padding(.horizontal, 12).frame(minHeight: 40)
                    }.ledgerMenuControl().accessibilityLabel("Filter accruals: \(asset.rawValue)")
                }
            }
            if mode == .accruals {
                if let error = notifications.inboxError {
                    Label(error, systemImage: "exclamationmark.triangle")
                        .font(LedgerType.meta).foregroundStyle(WarmLedger.caution)
                }
                if entries.isEmpty, notifications.inboxError != nil {
                    ActivityEmptyState(symbol: "exclamationmark.triangle", title: "Accrual history unavailable",
                        detail: "Existing saved history has been preserved.")
                } else if entries.isEmpty {
                    ActivityEmptyState(symbol: "tray", title: asset == .all ? "No accruals recorded yet" : "No \(asset.rawValue.lowercased()) accruals yet",
                        detail: "New rewards will appear here as they’re observed.")
                } else {
                    AccrualLedger(entries: Array(entries.prefix(visibleCount)), market: controller.monitor?.earnings?.market)
                    if entries.count > visibleCount { earlierButton }
                }
                Text("Observed increases · before claim fees")
                    .font(LedgerType.caption).foregroundStyle(WarmLedger.tertiary)
                    .help("Intervals show when accruals were observed, not individual reward times. Catch-up periods can span days. Claims and missing observations can leave gaps. Hover an amount for its exact quantity and current USD value. Viewing Activity does not mark notifications as read.")
            } else {
                balanceChanges
            }
        }
        .onChange(of: asset) { visibleCount = 40 }
        .sheet(item: $selectedChange) { change in BalanceChangeDetail(change: change) }
    }

    private var todaySummary: some View {
        let earnings = controller.monitor?.earnings
        let formatter = DateFormatter()
        formatter.timeZone = earnings.flatMap { TimeZone(identifier: $0.timeZone) } ?? .current
        formatter.dateFormat = "yyyy-MM-dd"
        let today = earnings?.days.first { $0.day == formatter.string(from: Date()) }
        return HStack(alignment: .center, spacing: 24) {
            VStack(alignment: .leading, spacing: 8) {
                Text("Today’s net earnings").font(LedgerType.section)
                Text(marketUSD(today?.netRewardUsd, market: earnings?.market))
                    .font(LedgerType.balance).monospacedDigit().lineLimit(1).minimumScaleFactor(0.7)
                    .foregroundStyle(earnings.map { resultColor(today?.netRewardUsd, market: $0.market) } ?? WarmLedger.ink)
                Text(coverage(today, market: earnings?.market))
                    .font(LedgerType.caption).foregroundStyle(WarmLedger.tertiary)
            }
            .help(today.map { "\($0.reason) Net is rewards after claim fees minus mining spend. USD at current prices. \(earnings?.timeZone ?? "")" }
                  ?? "Today’s net needs covered reward and cost history. Missing data is not zero earnings.")
            Spacer(minLength: 0)
            Button(action: showEarnings) {
                HStack(spacing: 8) {
                    Image(systemName: "chart.bar.xaxis")
                    Text("Daily breakdown")
                }
            }.buttonStyle(LedgerButtonStyle()).ledgerFocusRing()
        }.padding(8).ledgerPanel()
    }

    private func coverage(_ day: EarningsDay?, market: MarketQuotes?) -> String {
        guard let day, let from = day.fromAt, let through = day.throughAt, day.coverage == "partial" else {
            return "Waiting for today’s covered history"
        }
        let interval = activityInterval(from: from, through: through)
        let suffix = market?.isFresh() == true ? (day.netRewardUsd == nil ? " · net unavailable" : "") : " · prices unavailable"
        return "\(interval) · partial day\(suffix)"
    }

    private var balanceChanges: some View {
        let changes = Array(controller.balanceChanges.prefix(visibleCount))
        return VStack(alignment: .leading, spacing: 18) {
            Text("Unrefined GODL · balance movements")
                .font(LedgerType.meta).foregroundStyle(WarmLedger.tertiary)
                .help("Differences between consecutive known balances. A decrease may reflect a claim or another account change; it is not automatically a loss. Unchanged refreshes are omitted. Missing observations start a new baseline.")
            if changes.isEmpty {
                ActivityEmptyState(symbol: "equal.circle", title: "No balance changes recorded",
                    detail: "Your unrefined balance has no recorded movement between known observations.")
            } else {
                ForEach(activityDays(changes.map(\.throughAt)), id: \.self) { day in
                    VStack(alignment: .leading, spacing: 0) {
                        ActivityDayHeading(day: day)
                        ForEach(changes.filter { Calendar.current.isDate($0.throughAt, inSameDayAs: day) }) { change in
                            Button { selectedChange = change } label: {
                                HStack(spacing: 14) {
                                    Image(systemName: change.isIncrease ? "arrow.up.right" : "arrow.down.right")
                                        .font(LedgerType.section).foregroundStyle(WarmLedger.icon).frame(width: 26)
                                    VStack(alignment: .leading, spacing: 5) {
                                        Text(change.isIncrease ? "Balance increased" : "Balance decreased").font(LedgerType.body.weight(.medium))
                                        Text(activityInterval(from: change.fromAt, through: change.throughAt))
                                            .font(LedgerType.caption).foregroundStyle(WarmLedger.tertiary).monospacedDigit()
                                    }
                                    Spacer(minLength: 8)
                                    LedgerAmount(value: activityAmount(change.delta, places: 4), asset: .godl, iconSize: 15, minimumScale: 0.7)
                                        .font(LedgerType.value)
                                    Image(systemName: "chevron.right").font(LedgerType.caption).foregroundStyle(WarmLedger.icon)
                                }.padding(.horizontal, 10).padding(.vertical, 16).contentShape(Rectangle())
                            }.buttonStyle(LedgerRowButtonStyle()).ledgerFocusRing()
                                .help("\(change.delta) GODL · open for opening and closing balances. Balance movement is not earned income.")
                            LedgerRule()
                        }
                    }
                }
                if controller.balanceChanges.count > visibleCount { earlierButton }
            }
        }
    }

    private var earlierButton: some View {
        Button { visibleCount += 40 } label: { Text("Show earlier").frame(maxWidth: .infinity, minHeight: 40) }
            .buttonStyle(LedgerRowButtonStyle()).ledgerFocusRing()
    }
}

private enum ActivityMode: String, CaseIterable, Identifiable {
    case accruals = "Accruals", balances = "Balance changes"
    var id: String { rawValue }
}

private enum ActivityAsset: String, CaseIterable, Identifiable {
    case all = "All assets", unrefined = "Unrefined", refined = "Refined", gold = "Gold"
    var id: String { rawValue }
    func includes(_ entry: RewardInboxEntry) -> Bool {
        switch self {
        case .all: true
        case .unrefined: (entry.unrefinedUnits ?? 0) > 0
        case .refined: (entry.refinedUnits ?? 0) > 0
        case .gold: (entry.goldUnits ?? 0) > 0
        }
    }
}

/// Also replaces the repeated refresh rows at the bottom of Overview.
struct RecentActivity: View {
    @ObservedObject var notifications: RewardNotifications
    let market: MarketQuotes?
    let open: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Recent accruals").font(LedgerType.section)
                Spacer()
                Button("View activity", action: open)
                    .font(LedgerType.meta).padding(.horizontal, 10).frame(minHeight: 40)
                    .buttonStyle(LedgerRowButtonStyle()).ledgerFocusRing()
            }
            if let error = notifications.inboxError {
                Text(error).font(LedgerType.meta).foregroundStyle(WarmLedger.caution)
            }
            if notifications.entries.isEmpty {
                Text("New rewards will appear here as they’re observed.")
                    .font(LedgerType.meta).foregroundStyle(WarmLedger.tertiary).padding(.vertical, 16)
            } else {
                AccrualLedger(entries: Array(notifications.entries.prefix(3)), market: market)
            }
        }
    }
}

private struct AccrualLedger: View {
    let entries: [RewardInboxEntry]
    let market: MarketQuotes?

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(spacing: 12) {
                Text("Observed interval").frame(width: 166, alignment: .leading)
                column("Unrefined", asset: .godl)
                column("Refined", asset: .godl)
                column("Gold", asset: .gold)
            }.font(LedgerType.caption).foregroundStyle(WarmLedger.tertiary).padding(.horizontal, 10)
            ForEach(activityDays(entries.map(\.throughAt)), id: \.self) { day in
                VStack(alignment: .leading, spacing: 0) {
                    ActivityDayHeading(day: day)
                    ForEach(entries.filter { Calendar.current.isDate($0.throughAt, inSameDayAs: day) }) { entry in
                        HStack(spacing: 12) {
                            VStack(alignment: .leading, spacing: 5) {
                                Text(entry.isCatchUp ? "Since last check" : "Accrued").font(LedgerType.body.weight(.medium))
                                Text(activityInterval(from: entry.fromAt, through: entry.throughAt))
                                    .font(LedgerType.caption).foregroundStyle(WarmLedger.tertiary).monospacedDigit()
                            }.frame(width: 166, alignment: .leading)
                            amount(entry.unrefinedUnits, decimals: 11, asset: "GODL", name: "Unrefined GODL", places: 4)
                            amount(entry.refinedUnits, decimals: 11, asset: "GODL", name: "Refined GODL", places: 4)
                            amount(entry.goldUnits, decimals: 6, asset: "XAUt0", name: "Gold", places: 6)
                        }.padding(.horizontal, 10).padding(.vertical, 16)
                            .accessibilityElement(children: .combine)
                        LedgerRule()
                    }
                }
            }
        }
    }

    private func column(_ title: String, asset: LedgerAsset) -> some View {
        VStack(alignment: .trailing, spacing: 3) {
            Text(title)
            HStack(spacing: 4) {
                LedgerAssetMark(asset: asset, size: 10)
                Text(asset.symbol).font(.system(size: 10))
            }
        }.frame(maxWidth: .infinity, alignment: .trailing)
    }

    private func amount(_ units: UInt64?, decimals: Int, asset: String, name: String, places: Int) -> some View {
        let exact = units.flatMap { $0 > 0 ? RewardTracker.format(units: $0, decimals: decimals) : nil }
        let usd = exact.flatMap { activityUSD($0, asset: asset, market: market) }
        let help = exact.map { "+\($0) \(name) · \(usd.map { approximateUSDText($0) + " at current prices" } ?? "USD estimate unavailable") · before claim fees" }
            ?? "No \(name.lowercased()) increase recorded in this interval"
        return Text(exact.map { activityAmount($0, places: places) } ?? "—")
            .font(LedgerType.body.weight(.medium)).monospacedDigit()
            .foregroundStyle(exact == nil ? WarmLedger.tertiary : WarmLedger.positive)
            .lineLimit(1).minimumScaleFactor(0.8).frame(maxWidth: .infinity, alignment: .trailing)
            .help(help).accessibilityLabel(help)
    }
}

private struct ActivityDayHeading: View {
    let day: Date
    var body: some View {
        HStack(spacing: 12) {
            Text(Calendar.current.isDateInToday(day) ? "Today" : Calendar.current.isDateInYesterday(day) ? "Yesterday" : ledgerDate(day, format: "d MMM yyyy"))
                .font(LedgerType.meta.weight(.medium)).foregroundStyle(WarmLedger.secondary).fixedSize()
            LedgerRule()
        }.padding(.vertical, 8)
    }
}

private struct ActivityEmptyState: View {
    let symbol: String
    let title: String
    let detail: String
    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: symbol).font(.system(size: 28, weight: .light)).foregroundStyle(WarmLedger.icon)
            Text(title).font(LedgerType.section)
            Text(detail).font(LedgerType.meta).foregroundStyle(WarmLedger.tertiary)
        }.multilineTextAlignment(.center).frame(maxWidth: .infinity, minHeight: 200).padding(24).ledgerPanel()
    }
}

private struct BalanceChangeDetail: View {
    let change: BalanceChange
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        LedgerDetailSheet(title: "Balance change", note: "Finalized account data", height: 470, close: { dismiss() }) {
            VStack(alignment: .leading, spacing: 20) {
                LedgerAmount(value: change.signedDelta, asset: .godl, iconSize: 24, spacing: 8, wraps: true)
                    .font(LedgerType.cost)
                boundary("Before", amount: change.before, date: change.fromAt, slot: change.fromSlot)
                LedgerRule()
                boundary("After", amount: change.after, date: change.throughAt, slot: change.throughSlot)
                Text("A balance movement can include rewards, claims or other account changes. It is not a net earnings calculation.")
                    .font(LedgerType.meta).foregroundStyle(WarmLedger.tertiary)
            }.textSelection(.enabled)
        }
    }
    private func boundary(_ title: String, amount: String, date: Date, slot: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Text(title); Spacer(minLength: 12)
                LedgerAmount(value: amount, asset: .godl, wraps: true)
                Text("GODL").foregroundStyle(WarmLedger.tertiary).accessibilityHidden(true)
            }.font(LedgerType.body)
            Text("\(ledgerDate(date, format: "d MMM yyyy, HH:mm:ss")) · slot \(slot)")
                .font(LedgerType.caption).foregroundStyle(WarmLedger.tertiary)
        }
    }
}

private func activityDays(_ dates: [Date]) -> [Date] {
    Array(Set(dates.map { Calendar.current.startOfDay(for: $0) })).sorted(by: >)
}

private func activityInterval(from: Date, through: Date) -> String {
    let sameDay = Calendar.current.isDate(from, inSameDayAs: through)
    let sameMinute = Calendar.current.isDate(from, equalTo: through, toGranularity: .minute)
    let sameYear = Calendar.current.isDate(from, equalTo: through, toGranularity: .year)
    let format = sameDay ? (sameMinute ? "HH:mm:ss" : "HH:mm") : (sameYear ? "d MMM, HH:mm" : "d MMM yyyy, HH:mm")
    return ledgerDate(from, format: format) + "–" + ledgerDate(through, format: format)
}

private func activityAmount(_ value: String, places: Int) -> String {
    let negative = value.hasPrefix("-")
    let magnitude = negative ? String(value.dropFirst()) : value
    let rounded = amountText(magnitude, places: places)
    let tiny = Decimal(string: rounded.replacingOccurrences(of: ",", with: "")) == 0 && Decimal(string: magnitude) != 0
    return (negative ? "−" : "+") + (tiny ? "<" + "0." + String(repeating: "0", count: places - 1) + "1" : rounded)
}

private func activityUSD(_ amount: String, asset: String, market: MarketQuotes?) -> String? {
    guard let market, market.isFresh(), let quote = market.quotes.first(where: { $0.asset == asset }),
          var quantity = Decimal(string: amount, locale: Locale(identifier: "en_US_POSIX")),
          var price = Decimal(string: quote.priceUsd, locale: Locale(identifier: "en_US_POSIX")) else { return nil }
    var result = Decimal()
    guard NSDecimalMultiply(&result, &quantity, &price, .plain) == .noError, !result.isNaN else { return nil }
    return NSDecimalNumber(decimal: result).stringValue
}
