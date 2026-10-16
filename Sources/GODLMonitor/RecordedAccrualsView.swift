import SwiftUI
import GODLCore

/// One consistent summary across Activity, Overview and the menu-bar widget.
struct RecordedAccrualsView: View {
    @ObservedObject var notifications: RewardNotifications
    let earnings: Earnings?
    var compact = false

    var dailyMining: DailyMiningRewards? = nil
    var dailyYield: DailyYield? = nil

    private var currentMining: DailyMiningRewards? {
        dailyMining.flatMap { $0.isToday() ? $0 : nil }
    }

    private var currentYield: DailyYield? {
        dailyYield.flatMap { $0.isToday() ? $0 : nil }
    }

    var body: some View {
        if compact, let mining = currentMining, let units = mining.unrefinedUnits {
            compactToday(mining, units: units)
        } else {
            detailedSummary
        }
    }

    @ViewBuilder
    private var detailedSummary: some View {
        let calendar = earnings?.calendar ?? miningCalendar
        let rewards = RecordedAccrualSummary(entries: notifications.entries, calendar: calendar)
        VStack(alignment: .leading, spacing: compact ? 6 : 12) {
            if let mining = currentMining, let units = mining.unrefinedUnits {
                let exact = RewardTracker.format(units: units, decimals: 11)
                let usd = activityUSD(exact, asset: "GODL", market: earnings?.market)
                if !compact { Text("Mining credits today").font(LedgerType.section) }
                LedgerAmount(value: activityAmount(exact, places: 4), asset: .godl, iconSize: compact ? 20 : 24, minimumScale: 0.7)
                    .font(LedgerType.cost).monospacedDigit()
                    .help("\(exact) unrefined GODL · \(miningHelp(mining))")
                    .accessibilityLabel("\(exact) unrefined GODL mined today")
                Text("Unrefined · 00:00–\(date(mining.throughAt, calendar: miningCalendar, format: "HH:mm")) · \(mining.timeZone)")
                    .font(LedgerType.caption).foregroundStyle(WarmLedger.tertiary)
                Text((usd.map { approximateUSDText($0) + " · unrefined only" } ?? "Unrefined USD unavailable") + " · current price · before fees & costs")
                    .font(LedgerType.caption).foregroundStyle(WarmLedger.tertiary)
                    .fixedSize(horizontal: false, vertical: true)
                    .help(miningHelp(mining)).accessibilityHint(miningHelp(mining))
            } else {
                if currentYield == nil {
                    Text("Before fees & costs").font(LedgerType.caption).foregroundStyle(WarmLedger.tertiary)
                }
            }
            if let yield = currentYield {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Rewards today · 00:00–\(date(yield.throughAt, calendar: calendar, format: "HH:mm")) · \(yield.timeZone)")
                        .font(LedgerType.caption).foregroundStyle(WarmLedger.tertiary)
                        .fixedSize(horizontal: false, vertical: true)
                    HStack(spacing: 24) {
                        if let refined = yield.refined { amount("Refined", units: refined.units, asset: .godl) }
                        if let gold = yield.gold { amount("Gold", units: gold.units, asset: .gold) }
                    }
                    Text("Before fees & costs").font(LedgerType.caption).foregroundStyle(WarmLedger.tertiary)
                }.help("Exact rewards from a verified midnight opening through slot \(yield.throughSlot). Gold includes earnings already claimed today. Refined is available while no GODL claim has changed the opening. Current prices do not establish net profit.")
                    .accessibilityElement(children: .combine)
            }
            if currentMining == nil || currentYield?.refined == nil || currentYield?.gold == nil {
                observed(rewards.today, title: "Observed today", calendar: calendar,
                         includeUnrefined: currentMining == nil,
                         includeRefined: currentYield?.refined == nil, includeGold: currentYield?.gold == nil)
            }
            if rewards.catchUp.hasAccruals {
                observed(rewards.catchUp, title: "Observed catch-up", calendar: calendar, includeUnrefined: true)
            }
            if let error = notifications.inboxError {
                Text(error).font(LedgerType.caption).foregroundStyle(WarmLedger.caution)
            }
        }
    }

    private func compactToday(_ mining: DailyMiningRewards, units: UInt64) -> some View {
        let exact = RewardTracker.format(units: units, decimals: 11)
        let usd = activityUSD(exact, asset: "GODL", market: earnings?.market)
        return VStack(alignment: .leading, spacing: 8) {
            LedgerAmount(value: activityAmount(exact, places: 4), asset: .godl, iconSize: 20, minimumScale: 0.7)
                .font(LedgerType.cost).monospacedDigit()
                .help(miningHelp(mining) + " " + (usd.map { approximateUSDText($0) + " · unrefined only · current price." } ?? "USD unavailable."))
                .accessibilityLabel("\(exact) unrefined GODL mined today")
            Text("Unrefined GODL").font(LedgerType.caption).foregroundStyle(WarmLedger.tertiary)
            HStack(spacing: 24) {
                compactYield("Refined", amount: currentYield?.refined, asset: .godl)
                compactYield("Gold", amount: currentYield?.gold, asset: .gold)
            }.padding(.top, 2)
            Text("Before fees & costs").font(LedgerType.caption).foregroundStyle(WarmLedger.tertiary)
            if Date().timeIntervalSince(mining.throughAt) > 300 {
                Text("Mining through \(date(mining.throughAt, calendar: miningCalendar, format: "HH:mm"))")
                    .font(LedgerType.caption).foregroundStyle(WarmLedger.caution)
            }
            if let error = notifications.inboxError {
                Text(error).font(LedgerType.caption).foregroundStyle(WarmLedger.caution)
            }
        }.help("Mining: midnight through \(date(mining.throughAt, calendar: miningCalendar, format: "d MMM HH:mm:ss")), \(mining.timeZone). "
               + (currentYield.map { "Refined/gold: midnight through \(date($0.throughAt, calendar: miningCalendar, format: "d MMM HH:mm:ss")). " } ?? "Full-day refined/gold unavailable. ")
               + "Open daily earnings for exact coverage, current-price values and observed catch-up history.")
    }

    @ViewBuilder
    private func compactYield(_ title: String, amount value: DailyYield.Amount?, asset: LedgerAsset) -> some View {
        if let value {
            amount(title, units: value.units, asset: asset)
        } else {
            VStack(alignment: .leading, spacing: 4) {
                Text(title).font(LedgerType.caption).foregroundStyle(WarmLedger.tertiary)
                Text("—").font(LedgerType.section).foregroundStyle(WarmLedger.secondary)
            }.frame(maxWidth: .infinity, alignment: .leading)
                .help("Full-day \(title.lowercased()) unavailable. Open daily earnings for partial observed records.")
        }
    }

    private var miningCalendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = dailyYield.flatMap { TimeZone(identifier: $0.timeZone) }
            ?? dailyMining.flatMap { TimeZone(identifier: $0.timeZone) } ?? .current
        return calendar
    }

    @ViewBuilder
    private func observed(_ summary: RecordedAccruals, title: String, calendar: Calendar, includeUnrefined: Bool,
                          includeRefined: Bool = true, includeGold: Bool = true) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            if let from = summary.fromAt, let through = summary.throughAt {
                Text(title + " · " + date(from, calendar: calendar, format: "d MMM HH:mm") + "–" + date(through, calendar: calendar, format: "d MMM HH:mm") + " · partial")
                    .font(LedgerType.caption).foregroundStyle(WarmLedger.tertiary)
                    .fixedSize(horizontal: false, vertical: true)
            } else if !compact || currentMining != nil || title != "Observed today" {
                Text(title + " · partial").font(LedgerType.caption).foregroundStyle(WarmLedger.secondary)
            }
            if notifications.inboxError != nil || !summary.isValid {
                Text("History unavailable").font(LedgerType.caption).foregroundStyle(WarmLedger.caution)
            } else if !summary.hasAccruals {
                Text("No records yet").font(LedgerType.caption).foregroundStyle(WarmLedger.tertiary)
            } else if compact {
                Text((includeUnrefined ? "Unrefined " + observedAmount(summary.unrefinedUnits, decimals: 11) + " · " : "")
                     + (includeRefined ? "Refined " + observedAmount(summary.refinedUnits, decimals: 11) : "")
                     + (includeGold ? (includeRefined ? " · " : "") + "Gold " + observedAmount(summary.goldUnits, decimals: 6) : ""))
                    .font(LedgerType.caption).monospacedDigit().foregroundStyle(WarmLedger.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                HStack(spacing: 24) {
                    if includeUnrefined { amount("Unrefined", units: summary.unrefinedUnits, asset: .godl) }
                    if includeRefined { amount("Refined", units: summary.refinedUnits, asset: .godl) }
                    if includeGold { amount("Gold", units: summary.goldUnits, asset: .gold) }
                }
            }
        }.help("Observed increases only, before fees and costs. \(calendar.timeZone.identifier). Missing observations are unknown. These partial intervals are separate from recovered unrefined mining credits.")
            .accessibilityElement(children: .combine)
            .accessibilityValue(notifications.inboxError != nil || !summary.isValid ? "History unavailable" :
                (includeUnrefined ? "Unrefined \(summary.unrefinedUnits.map { RewardTracker.format(units: $0, decimals: 11) } ?? "unavailable") GODL; " : "")
                + (includeRefined ? "Refined \(summary.refinedUnits.map { RewardTracker.format(units: $0, decimals: 11) } ?? "unavailable") GODL; " : "")
                + (includeGold ? "Gold \(summary.goldUnits.map { RewardTracker.format(units: $0, decimals: 6) } ?? "unavailable") XAUt0" : ""))
    }

    private func observedAmount(_ units: UInt64?, decimals: Int) -> String {
        units.map { activityAmount(RewardTracker.format(units: $0, decimals: decimals), places: decimals == 6 ? 6 : 4) } ?? "—"
    }

    private func date(_ value: Date, calendar: Calendar, format: String) -> String {
        let formatter = DateFormatter()
        formatter.timeZone = calendar.timeZone
        formatter.dateFormat = format
        return formatter.string(from: value)
    }

    private func miningHelp(_ mining: DailyMiningRewards) -> String {
        "Finalized unrefined principal credited from midnight through " + date(mining.throughAt, calendar: miningCalendar, format: "d MMM yyyy HH:mm:ss")
        + " (\(mining.timeZone)), slot \(mining.throughSlot). Credit time can differ from round settlement. Refined GODL and gold have separate coverage. USD values only this unrefined principal at the current price, before fees and mining costs; it is not net profit."
    }

    private func amount(_ title: String, units: UInt64?, asset: LedgerAsset) -> some View {
        let exact = units.map { RewardTracker.format(units: $0, decimals: asset == .gold ? 6 : 11) }
        let usd = exact.flatMap { activityUSD($0, asset: asset.symbol, market: earnings?.market) }
        let formatted = exact.map { activityAmount($0, places: asset == .gold ? 6 : 4) } ?? "—"
        return VStack(alignment: .leading, spacing: 4) {
            Text(title).font(LedgerType.caption).foregroundStyle(WarmLedger.tertiary)
            LedgerAmount(value: formatted, asset: asset, iconSize: 12, minimumScale: 0.7)
                .font(LedgerType.section).monospacedDigit()
        }.frame(maxWidth: .infinity, alignment: .leading)
            .help(exact.map { "+\($0) \(title) · \(asset.symbol) · \(usd.map { approximateUSDText($0, places: 6) + " at current prices" } ?? "USD unavailable") · before fees and costs" }
                  ?? "No \(title.lowercased()) increase recorded in this interval; missing observations are not zero.")
            .accessibilityLabel("\(title), \(exact ?? "unavailable") \(asset.symbol)")
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
