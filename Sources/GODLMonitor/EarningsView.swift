import SwiftUI
import GODLCore

func marketUSD(_ value: String?, market: MarketQuotes?) -> String {
    guard market?.isFresh() == true, let value else { return "—" }
    return approximateUSDText(value)
}

func holdingValueHelp(_ value: String?, monitor: MonitorView?, asset: String) -> String {
    guard let market = monitor?.earnings?.market, market.isFresh(), let value else {
        return "\(asset) · USD estimate unavailable until a fresh market quote is available."
    }
    return "\(approximateUSDText(value)) at current market prices · gross value before claim fees. DEX Screener quote received \(ledgerDate(market.observedAt!, format: "HH:mm"))."
}

// Hallmark · pre-emit critique: P5 H5 E4 S5 R5 V4
// Shared native ledger: aligned daily accruals, with unavailable intervals kept visible.
struct EarningsSection: View {
    @ObservedObject var netHistory: EarningsHistoryController
    let earnings: Earnings?
    var accountingState: String? = nil
    @ObservedObject var notifications: RewardNotifications
    let showDetails: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Daily earnings").font(LedgerType.section)
                Spacer()
                Button(action: showDetails) {
                    Text("Details").font(LedgerType.meta).padding(.horizontal, 8).frame(minHeight: 40)
                }
                    .buttonStyle(LedgerRowButtonStyle()).ledgerFocusRing()
            }
            RecordedAccrualsView(notifications: notifications, earnings: earnings)
            if let earnings, let position = earnings.position {
                AccountingPositionView(position: position, timeZone: earnings.timeZone)
            }
            LedgerRule()
            RecordedHistoryChart(entries: notifications.entries, earnings: earnings, historyError: notifications.inboxError)
            if let earnings {
                DisclosureGroup("Verified net & covered amounts") {
                    VerifiedNetHistory(history: netHistory, accountingState: accountingState)
                }.font(LedgerType.meta).tint(WarmLedger.icon)
                LedgerRule().padding(.top, 4)
                HStack(alignment: .center) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Last verified mining result").font(LedgerType.section)
                        Text("Unrefined only · " + verifiedPeriod(earnings))
                            .font(LedgerType.caption).foregroundStyle(WarmLedger.tertiary)
                    }
                    Spacer()
                    Text(marketUSD(earnings.total.netPnlUsd, market: earnings.market))
                        .font(LedgerType.cost).monospacedDigit().lineLimit(1).minimumScaleFactor(0.7)
                        .foregroundStyle(resultColor(earnings.total.netPnlUsd, market: earnings.market))
                }.help("Current unrefined reward value after claim fees, less historical mining spend. Refined GODL and gold excluded: opening history incomplete. Verified through \(earnings.total.throughAt.map { ledgerDate($0, format: "MMM d, HH:mm") } ?? "—").")
            }
        }.padding(.vertical, 8)
    }
}

func resultColor(_ value: String?, market: MarketQuotes) -> Color {
    guard market.isFresh(), let value, let number = Decimal(string: value) else { return WarmLedger.ink }
    return number < 0 ? WarmLedger.critical : number > 0 ? WarmLedger.positive : WarmLedger.ink
}

struct EarningsTableNote: View {
    let earnings: Earnings
    var body: some View {
        Text(earnings.market.isFresh()
             ? (earnings.market.quotes.count == 2 ? "* Partial day · USD at current prices" : "* Partial day · some prices unavailable")
             : "* Partial day · prices unavailable")
            .font(.system(size: 10.5)).foregroundStyle(earnings.market.isFresh() ? WarmLedger.tertiary : WarmLedger.caution)
            .help("\(earnings.timeZone). Each day includes only its covered interval. Hover a date for hours, an asset for exact quantity and USD, or net for costs. — means unavailable.")
    }
}

struct EarningsTable: View {
    let earnings: Earnings
    let days: [EarningsDay]
    var compact = false
    var accountingState: String? = nil

    var body: some View {
        if compact {
            compactRows
        } else {
            table
        }
    }

    private var compactRows: some View {
        VStack(spacing: 0) {
            ForEach(days) { day in
                VStack(alignment: .leading, spacing: 10) {
                    HStack(alignment: .firstTextBaseline) {
                        Text(dayLabel(day) + (day.coverage == "partial" ? "*" : ""))
                            .font(LedgerType.section)
                            .help("\(day.day) · \(coverageLabel(day)) · \(earnings.timeZone). \(day.reason)")
                        Spacer(minLength: 8)
                        Text(dailyNetText(day, earnings: earnings, accountingState: accountingState))
                            .font(LedgerType.section).foregroundStyle(resultColor(day.netRewardUsd, market: earnings.market))
                            .help(netHelp(day))
                            .accessibilityLabel("Net \(dailyNetText(day, earnings: earnings, accountingState: accountingState)). \(netHelp(day))")
                    }
                    compactAsset("Unrefined", amount: day.unrefinedGodl, usd: day.unrefinedUsd, symbol: "GODL", places: 4)
                    compactAsset("Refined", amount: day.refinedGodl, usd: day.refinedUsd, symbol: "GODL", places: 4)
                    compactAsset("Gold", amount: day.gold, usd: day.goldUsd, symbol: "XAUt0", places: 6)
                }.font(LedgerType.meta).monospacedDigit().padding(.vertical, 14)
                LedgerRule()
            }
        }
    }

    private func compactAsset(_ title: String, amount: TokenAmount?, usd: String?, symbol: String, places: Int) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Text(title).foregroundStyle(WarmLedger.tertiary)
            Spacer(minLength: 0)
            LedgerAmount(value: amount.map { displayAmount($0, places: places) } ?? "—",
                         asset: symbol == "XAUt0" ? .gold : .godl, iconSize: 11, wraps: true)
                .multilineTextAlignment(.trailing)
        }
        .help(amount.map { "\($0.display) \(symbol) · \(marketUSD(usd, market: earnings.market)) before claim fees" }
              ?? "No covered reward interval")
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(amount.map { "\(title): \($0.display) \(symbol). \(marketUSD(usd, market: earnings.market)) at current prices" }
                            ?? "\(title) unavailable")
    }

    private var table: some View {
        VStack(spacing: 0) {
            columns {
                Text("Day").frame(width: 145, alignment: .leading)
                heading("Unrefined", unit: "GODL")
                heading("Refined", unit: "GODL")
                heading("Gold", unit: "XAUt0")
                heading("Net", unit: "USD")
            }.font(.system(size: 11.5))
                .foregroundStyle(WarmLedger.tertiary).padding(.vertical, 9)
            LedgerRule()
            ForEach(Array(days.enumerated()), id: \.element.id) { index, day in
                columns {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(dayLabel(day) + (day.coverage == "partial" ? "*" : ""))
                            .fontWeight(.medium).lineLimit(1).minimumScaleFactor(0.8)
                        Text(coverageLabel(day)).font(.system(size: 10.5)).foregroundStyle(WarmLedger.tertiary)
                    }.frame(width: 145, alignment: .leading)
                        .help("\(day.day) · \(coverageLabel(day)) · \(earnings.timeZone). \(day.reason)")
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel("\(day.day), \(coverageLabel(day)), \(day.coverage == "partial" ? "partial day" : "unavailable")")
                    asset(day.unrefinedGodl, usd: day.unrefinedUsd, symbol: "unrefined GODL", places: 4)
                    asset(day.refinedGodl, usd: day.refinedUsd, symbol: "refined GODL", places: 4)
                    asset(day.gold, usd: day.goldUsd, symbol: "XAUt0", places: 6)
                    Text(dailyNetText(day, earnings: earnings, accountingState: accountingState))
                        .fontWeight(.semibold).foregroundStyle(resultColor(day.netRewardUsd, market: earnings.market))
                        .lineLimit(1).minimumScaleFactor(0.7).frame(maxWidth: .infinity, alignment: .trailing)
                        .help(netHelp(day))
                        .accessibilityLabel("Net \(dailyNetText(day, earnings: earnings, accountingState: accountingState)). \(netHelp(day))")
                }.font(.system(size: 12.5)).monospacedDigit()
                    .frame(minHeight: 48)
                    .background(index.isMultiple(of: 2) ? WarmLedger.control.opacity(0.28) : .clear)
            }
        }.frame(maxWidth: .infinity)
    }

    private func columns<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        HStack(spacing: 12, content: content).padding(.horizontal, 10)
    }
    private func heading(_ label: String, unit: String) -> some View {
        VStack(alignment: .trailing, spacing: 3) {
            Text(label)
            HStack(spacing: 4) {
                if unit != "USD" { LedgerAssetMark(asset: unit == "XAUt0" ? .gold : .godl, size: 10) }
                Text(unit).font(.system(size: 10))
            }
        }.frame(maxWidth: .infinity, alignment: .trailing)
            .help(label == "Net" ? "USD after claim fees and mining costs" : "\(label == "Unref." ? "Unrefined" : label) accrual · \(unit)")
    }
    private func asset(_ amount: TokenAmount?, usd: String?, symbol: String, places: Int) -> some View {
        Text(amount.map { displayAmount($0, places: places) } ?? "—")
            .lineLimit(1).minimumScaleFactor(0.7).frame(maxWidth: .infinity, alignment: .trailing)
            .help(amount.map { "\($0.display) \(symbol) · \(marketUSD(usd, market: earnings.market)) before claim fees" }
                  ?? "No covered reward interval")
            .accessibilityLabel(amount.map { "\($0.display) \(symbol). \(marketUSD(usd, market: earnings.market)) at current prices" } ?? "\(symbol) unavailable")
    }
    private func displayAmount(_ amount: TokenAmount, places: Int) -> String {
        if amount.baseUnits == "0" { return "0" }
        let formatted = amountText(amount.display, places: places)
        if Decimal(string: formatted.replacingOccurrences(of: ",", with: "")) == 0 {
            return "<" + (places == 6 ? "0.000001" : "0.0001")
        }
        return formatted
    }
    private func date(_ date: Date, format: String) -> String {
        let formatter = DateFormatter()
        formatter.timeZone = TimeZone(identifier: earnings.timeZone)
        formatter.dateFormat = format
        return formatter.string(from: date)
    }
    private func dayLabel(_ day: EarningsDay) -> String {
        if date(Date(), format: "yyyy-MM-dd") == day.day { return "Today" }
        let parts = day.day.split(separator: "-")
        return parts.count == 3 ? "\(parts[2])/\(parts[1])" : day.day
    }
    private func coverageLabel(_ day: EarningsDay) -> String {
        guard let from = day.fromAt, let through = day.throughAt else { return "No coverage" }
        return "\(date(from, format: "HH:mm"))–\(date(through, format: "HH:mm"))"
    }
    private func netHelp(_ day: EarningsDay) -> String {
        guard let value = day.netRewardUsd, earnings.market.isFresh() else { return day.reason + " Fresh prices and covered reward/cost history are required." }
        return "\(approximateUSDText(value, places: 6)) = after-fee rewards \(marketUSD(day.rewardValueUsd, market: earnings.market)) − net spend \(day.netSpendUsd.map { approximateUSDText($0) } ?? "—"). \(coverageLabel(day)) · current prices."
    }
}

struct EarningsDetailSheet: View {
    @ObservedObject var netHistory: EarningsHistoryController
    let earnings: Earnings?
    @ObservedObject var notifications: RewardNotifications
    var accountingState: String? = nil
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(spacing: 0) {
            LedgerDetailHeader("Daily earnings", close: { dismiss() })
            LedgerRule()
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    if let earnings, let position = earnings.position {
                        AccountingPositionView(position: position, timeZone: earnings.timeZone)
                    }
                    RecordedHistoryChart(entries: notifications.entries, earnings: earnings, historyError: notifications.inboxError)
                    if let earnings {
                        DisclosureGroup("Verified net & covered amounts") {
                            VerifiedNetHistory(history: netHistory, accountingState: accountingState)
                        }
                        DisclosureGroup("Calculation & coverage") {
                            VStack(alignment: .leading, spacing: 12) {
                                Text("Only the hours shown are included (\(earnings.timeZone)). Missing history is labelled; it is never treated as zero.")
                                Text("Net = rewards after claim fees − mining spend, including actual SOL received. Covered net ends at settled boundaries with no stored SOL. Current cash cost and outstanding SOL are shown separately.")
                                Text("USD uses current prices. Price changes on earlier holdings are excluded from daily accruals.")
                            }.padding(.top, 8)
                        }
                        LedgerRule()
                        DisclosureGroup("Last verified mining result · unrefined only") {
                            VStack(alignment: .leading, spacing: 12) {
                                valueRow("Estimated GODL after claim fees", earnings.total.claimableGodl.map { "\($0.display) GODL" } ?? "—", asset: .godl)
                                valueRow("Refining fee", earnings.total.refiningFee.map { "\($0.display) GODL" } ?? "—", asset: .godl)
                                valueRow("Referral fee", earnings.total.referralFee.map { "\($0.display) GODL" } ?? "—", asset: .godl)
                                valueRow("Current reward value", marketUSD(earnings.total.rewardValueUsd, market: earnings.market))
                                valueRow("Historical net mining spend", earnings.total.netSpendUsd.map { approximateUSDText($0) } ?? "—")
                                valueRow("Estimated gain / loss", marketUSD(earnings.total.netPnlUsd, market: earnings.market))
                                if let through = earnings.total.throughAt {
                                    Text("Rewards and costs verified through \(ledgerDate(through, format: "MMM d, HH:mm:ss")) · slot \(earnings.total.throughSlot ?? "—")")
                                }
                                Text(earnings.total.reason)
                                Text("Refined and gold excluded: opening history incomplete. Wallet holdings, staking, sale slippage, future transaction fees and off-chain costs excluded. Account rent is included in cash cost.")
                            }.padding(.top, 8)
                        }
                        LedgerRule()
                        DisclosureGroup("Market prices") {
                            VStack(alignment: .leading, spacing: 12) {
                                if let received = earnings.market.observedAt {
                                    Text("\(earnings.market.source) · received \(ledgerDate(received, format: "MMM d, HH:mm:ss"))\(earnings.market.isFresh() ? "" : " · expired")")
                                }
                                ForEach(earnings.market.quotes, id: \.asset) { quote in
                                    VStack(alignment: .leading, spacing: 5) {
                                        valueRow(quote.asset, earnings.market.isFresh() ? "$\(quote.priceUsd)" : "Expired")
                                        Text("\(quote.dexId) · pool liquidity \(approximateUSDText(quote.liquidityUsd, places: 0)) · 24h volume \(approximateUSDText(quote.volume24hUsd, places: 0))")
                                        if let url = URL(string: "https://dexscreener.com/solana/\(quote.pairAddress)") {
                                            Link("View market on DEX Screener", destination: url).foregroundStyle(WarmLedger.strongBrass)
                                        }
                                    }
                                }
                                Text("Quotes refresh every 5 minutes and expire after 10. Pool prices are estimates before sale slippage.")
                                if let reason = earnings.market.reason { Text(reason) }
                            }.padding(.top, 8)
                        }
                    } else {
                        Text("Waiting for earnings history")
                    }
                }.font(LedgerType.body).foregroundStyle(WarmLedger.secondary)
                    .fixedSize(horizontal: false, vertical: true).textSelection(.enabled).padding(LedgerLayout.detailInset)
            }
            LedgerRule()
            LedgerDetailFooter(note: earnings?.timeZone ?? "", close: { dismiss() })
        }.frame(width: 750, height: 620).background(WarmLedger.window).foregroundStyle(WarmLedger.ink)
            .disclosureGroupStyle(LedgerDisclosureStyle())
    }
    private func valueRow(_ label: String, _ value: String, asset: LedgerAsset? = nil) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(label)
            Spacer(minLength: 20)
            HStack(alignment: .firstTextBaseline, spacing: 5) {
                if let asset { LedgerAssetMark(asset: asset, size: 11) }
                Text(value).monospacedDigit().foregroundStyle(WarmLedger.ink)
            }
        }
    }
}

func dailyNetText(_ day: EarningsDay, earnings: Earnings, accountingState: String? = nil) -> String {
    let status = DailyNetAvailability(day: day, market: earnings.market, accountingState: accountingState, calendar: earnings.calendar)
    switch status {
    case .noHistory: return "Not covered"
    case .incomplete: return "Incomplete"
    case .pricesUnavailable: return "No price"
    default: return netAvailabilityText(status)
    }
}

func earningsInterval(from: Date, through: Date, timeZone: String?) -> String {
    let formatter = DateFormatter()
    formatter.timeZone = timeZone.flatMap(TimeZone.init(identifier:)) ?? .current
    formatter.dateFormat = "HH:mm"
    return formatter.string(from: from) + "–" + formatter.string(from: through)
}

func verifiedPeriod(_ earnings: Earnings) -> String {
    let formatter = DateFormatter()
    formatter.timeZone = earnings.calendar.timeZone
    formatter.dateFormat = "MMM d, HH:mm"
    guard let from = earnings.total.fromAt, let through = earnings.total.throughAt else { return "Period unavailable" }
    return formatter.string(from: from) + "–" + formatter.string(from: through) + " · valued at current prices"
}
