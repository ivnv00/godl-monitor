import Foundation

/// Saved positive changes, not a continuous reward ledger or a net-profit calculation.
/// Cross-day observation intervals cannot safely be allocated to either day.
public struct RecordedAccruals: Sendable {
    public private(set) var unrefinedUnits: UInt64?
    public private(set) var refinedUnits: UInt64?
    public private(set) var goldUnits: UInt64?
    public private(set) var excludedCrossDayCount = 0
    public private(set) var isValid = true
    public var hasAccruals: Bool { unrefinedUnits != nil || refinedUnits != nil || goldUnits != nil }

    public init(entries: [RewardInboxEntry], calendar: Calendar, day: Date? = nil, now: Date = Date()) {
        guard Set(entries.map(\.identity)).count <= 1,
              Set(entries.map(\.id)).count == entries.count else { isValid = false; return }
        let start = calendar.startOfDay(for: day ?? now)
        guard let end = calendar.date(byAdding: .day, value: 1, to: start) else { isValid = false; return }
        for entry in entries {
            guard entry.fromAt <= entry.throughAt else { invalidate(); return }
            guard entry.throughAt >= start, entry.throughAt < end, entry.throughAt <= now else { continue }
            guard entry.fromAt >= start else { excludedCrossDayCount += 1; continue }
            let unrefined = (unrefinedUnits ?? 0).addingReportingOverflow(entry.unrefinedUnits ?? 0)
            let refined = (refinedUnits ?? 0).addingReportingOverflow(entry.refinedUnits ?? 0)
            let gold = (goldUnits ?? 0).addingReportingOverflow(entry.goldUnits ?? 0)
            guard !unrefined.overflow, !refined.overflow, !gold.overflow else { invalidate(); return }
            unrefinedUnits = unrefined.partialValue > 0 ? unrefined.partialValue : nil
            refinedUnits = refined.partialValue > 0 ? refined.partialValue : nil
            goldUnits = gold.partialValue > 0 ? gold.partialValue : nil
        }
    }

    /// Value of the recorded increases only. A missing required quote invalidates
    /// the combined value; native quantities remain available independently.
    public func valueUsd(market: MarketQuotes?, now: Date = Date()) -> String? {
        guard isValid, hasAccruals, let market, market.isFresh(at: now) else { return nil }
        var total = Decimal.zero
        for (units, decimals, asset) in [(unrefinedUnits, 11, "GODL"), (refinedUnits, 11, "GODL"), (goldUnits, 6, "XAUt0")] {
            guard let units else { continue }
            let quotes = market.quotes.filter { $0.asset == asset }
            guard quotes.count == 1, let quote = quotes.first,
                  quote.priceUsd.range(of: #"^(?:0|[1-9]\d*)(?:\.\d+)?$"#, options: .regularExpression) != nil,
                  quote.priceUsd.filter(\.isNumber).drop(while: { $0 == "0" }).count <= 38,
                  var price = Decimal(string: quote.priceUsd, locale: Locale(identifier: "en_US_POSIX")), price > 0,
                  var quantity = Decimal(string: RewardTracker.format(units: units, decimals: decimals), locale: Locale(identifier: "en_US_POSIX")) else { return nil }
            var value = Decimal(), next = Decimal()
            guard NSDecimalMultiply(&value, &quantity, &price, .plain) == .noError,
                  NSDecimalAdd(&next, &total, &value, .plain) == .noError else { return nil }
            total = next
        }
        return total.isNaN ? nil : NSDecimalNumber(decimal: total).stringValue
    }

    private mutating func invalidate() {
        isValid = false
        unrefinedUnits = nil; refinedUnits = nil; goldUnits = nil
    }
}

/// A calendar window over the saved reward journal, independent of settled cost
/// checkpoints. Empty days remain unknown, and overnight intervals stay unallocated.
public struct RecordedAccrualHistory: Sendable {
    public struct Day: Identifiable, Sendable {
        public let id: String
        public let date: Date
        public let accruals: RecordedAccruals
    }

    public let days: [Day]
    public let hasEarlier: Bool
    public let hasLater: Bool

    public init(entries: [RewardInboxEntry], calendar: Calendar, endingAt: Date? = nil, now: Date = Date()) {
        let today = calendar.startOfDay(for: now)
        let end = min(calendar.startOfDay(for: endingAt ?? now), today)
        days = (-6...0).compactMap { offset in
            guard let date = calendar.date(byAdding: .day, value: offset, to: end) else { return nil }
            let parts = calendar.dateComponents([.year, .month, .day], from: date)
            let key = String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
            return Day(id: key, date: date, accruals: RecordedAccruals(entries: entries, calendar: calendar, day: date, now: now))
        }
        hasEarlier = days.first.map { first in entries.contains { $0.throughAt < first.date } } ?? false
        hasLater = end < today
    }
}

public enum DailyNetAvailability: Equatable, Sendable {
    case value(String), settling, pricesUnavailable, incomplete, noHistory, needsReview, updating

    public init(day: EarningsDay?, market: MarketQuotes?, accountingState: String? = nil, now: Date = Date(), calendar: Calendar = .current) {
        if let value = day?.netRewardUsd {
            self = market?.isFresh(at: now) == true ? .value(value) : .pricesUnavailable
        } else if day?.coverage == "partial" {
            let godlKnown = day?.claimCount != nil ? day?.claimAdjustedGodl != nil
                : day?.unrefinedGodl != nil && day?.refinedGodl != nil
            if !godlKnown || day?.gold == nil { self = .incomplete }
            else if market?.isFresh(at: now) != true || Set(market?.quotes.map(\.asset) ?? []) != Set(["GODL", "XAUt0"]) { self = .pricesUnavailable }
            else { self = .incomplete }
        } else {
            if let day {
                let parts = calendar.dateComponents([.year, .month, .day], from: now)
                let today = String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
                guard day.day == today else { self = .noHistory; return }
            }
            switch accountingState {
            case "waiting": self = .settling
            case "blocked": self = .needsReview
            case "retrying": self = .updating
            default: self = .noHistory
            }
        }
    }
}

public extension Earnings {
    var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: timeZone) ?? .current
        return calendar
    }
    func day(at now: Date = Date()) -> EarningsDay? {
        let parts = calendar.dateComponents([.year, .month, .day], from: now)
        let key = String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
        return days.first { $0.day == key }
    }
}
