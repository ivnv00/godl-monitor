import Foundation

/// Decimal strings come from the exact accounting engine. The UI only formats them.
public struct Earnings: Codable, Equatable, Sendable {
    public let schemaVersion: Int
    public let timeZone: String
    public let market: MarketQuotes
    public let holdings: HoldingValues
    public let days: [EarningsDay]
    public let total: MiningResult
    public let position: AccountingPosition?
    /// First verified closing in this time zone; earlier dates remain unknown.
    public let historyStartDay: String?

    public init(schemaVersion: Int, timeZone: String, market: MarketQuotes, holdings: HoldingValues,
                days: [EarningsDay], total: MiningResult, position: AccountingPosition? = nil,
                historyStartDay: String? = nil) {
        self.schemaVersion = schemaVersion
        self.timeZone = timeZone
        self.market = market
        self.holdings = holdings
        self.days = days
        self.total = total
        self.position = position
        self.historyStartDay = historyStartDay
    }
}

/// Reconciled cash coverage; outstanding SOL remains separate from settled earnings.
public struct AccountingPosition: Codable, Equatable, Sendable {
    public let fromAt: Date
    public let throughAt: Date
    public let throughSlot: String
    public let netSpendSol: String
    public let netSpendUsd: String
    public let pendingRound: PendingAccountingRound?
    public let storedSol: SOLAmount
    public let netReady: Bool
    public let reason: String
}

public struct PendingAccountingRound: Codable, Equatable, Sendable {
    public let roundId: String
    public let deployedSol: SOLAmount
}

public struct MarketQuotes: Codable, Equatable, Sendable {
    public let observedAt: Date?
    public let expiresAt: Date?
    public let source: String
    public let quotes: [MarketQuote]
    public let reason: String?
    public let goldReference: GoldReference?

    public init(observedAt: Date?, expiresAt: Date?, source: String, quotes: [MarketQuote], reason: String?,
                goldReference: GoldReference? = nil) {
        self.observedAt = observedAt
        self.expiresAt = expiresAt
        self.source = source
        self.quotes = quotes
        self.reason = reason
        self.goldReference = goldReference
    }

    /// Independent sanity proof only; the DEX quote remains the valuation price.
    public func hasValidGoldQuote(_ quote: MarketQuote, at now: Date) -> Bool {
        guard quote.asset == "XAUt0", let reference = goldReference,
              reference.source == "CoinGecko", reference.assetId == "tether-gold",
              let observedAt, reference.observedAt <= observedAt,
              reference.observedAt <= now, now.timeIntervalSince(reference.observedAt) <= 600,
              let expiresAt, expiresAt <= reference.observedAt.addingTimeInterval(600) else { return false }
        func price(_ text: String) -> Decimal? {
            guard text.count <= 60,
                  text.range(of: #"^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$"#, options: .regularExpression) != nil,
                  (text.split(separator: ".").dropFirst().first?.count ?? 0) <= 30,
                  text.filter(\.isNumber).drop(while: { $0 == "0" }).count <= 36,
                  let value = Decimal(string: text, locale: Locale(identifier: "en_US_POSIX")),
                  !value.isNaN, value > 0 else { return nil }
            return value
        }
        guard var quotePrice = price(quote.priceUsd), var referencePrice = price(reference.priceUsd) else { return false }
        var ten = Decimal(10), nine = Decimal(9), eleven = Decimal(11)
        var scaledQuote = Decimal(), lower = Decimal(), upper = Decimal()
        guard NSDecimalMultiply(&scaledQuote, &quotePrice, &ten, .plain) == .noError,
              NSDecimalMultiply(&lower, &referencePrice, &nine, .plain) == .noError,
              NSDecimalMultiply(&upper, &referencePrice, &eleven, .plain) == .noError else { return false }
        return scaledQuote >= lower && scaledQuote <= upper
    }

    public func isFresh(at now: Date = Date()) -> Bool {
        guard let observedAt, let expiresAt else { return false }
        return observedAt <= now && now < expiresAt && !quotes.isEmpty
    }
}

public struct GoldReference: Codable, Equatable, Sendable {
    public let source: String
    public let assetId: String
    public let priceUsd: String
    public let observedAt: Date
}

public struct MarketQuote: Codable, Equatable, Sendable {
    public let asset: String
    public let mint: String
    public let priceUsd: String
    public let pairAddress: String
    public let dexId: String
    public let liquidityUsd: String
    public let volume24hUsd: String
}

public struct HoldingValues: Codable, Equatable, Sendable {
    public let unrefinedUsd: String?
    public let refinedUsd: String?
    public let goldUsd: String?
}

public struct EarningsDay: Codable, Equatable, Sendable, Identifiable {
    public var id: String { day }
    public let day: String
    public let fromAt: Date?
    public let throughAt: Date?
    public let fromSlot: String?
    public let throughSlot: String?
    public let coverage: String
    public let reason: String
    public let unrefinedGodl: TokenAmount?
    public let refinedGodl: TokenAmount?
    public let gold: TokenAmount?
    public let unrefinedUsd: String?
    public let refinedUsd: String?
    public let goldUsd: String?
    public let netSpendUsd: String?
    public let rewardValueUsd: String?
    public let netRewardUsd: String?
    /// Combined receipts plus claimable-holdings change; principal split unknown.
    public var claimAdjustedGodl: String? = nil
    public var claimCount: Int? = nil
    /// Optional, evidence-derived claim components; does not change daily accrual or net.
    public var claimAttribution: ClaimAttribution? = nil
}

public struct ClaimAttribution: Codable, Equatable, Sendable {
    public let method: String
    public let status: String
    public let reason: String
    public let principalGodl: TokenAmount?
    public let refinedGodl: TokenAmount?
    public let refiningFeeGodl: TokenAmount?
    public let referralFeeGodl: TokenAmount?
    public let ownerReceiptGodl: TokenAmount?
}

public struct MiningResult: Codable, Equatable, Sendable {
    public let scope: String
    public let fromAt: Date?
    public let throughAt: Date?
    public let throughSlot: String?
    public let claimableGodl: TokenAmount?
    public let refiningFee: TokenAmount?
    public let referralFee: TokenAmount?
    public let rewardValueUsd: String?
    public let netSpendUsd: String?
    public let netPnlUsd: String?
    public let reason: String
}

extension Earnings {
    func validate(observedAt: Date, observedSlot: String, now: Date) throws {
        func require(_ condition: Bool) throws {
            if !condition { throw MonitorLoadError.invalidEarnings }
        }
        func decimal(_ value: String?, nonnegative: Bool = false) throws {
            guard let value else { return }
            try require(value.count <= 60 && value.range(of: #"^-?(?:0|[1-9]\d*)(?:\.\d+)?$"#, options: .regularExpression) != nil)
            guard let number = Decimal(string: value, locale: Locale(identifier: "en_US_POSIX")), !number.isNaN else {
                throw MonitorLoadError.invalidEarnings
            }
            try require(!nonnegative || number >= 0)
        }
        func token(_ value: TokenAmount?, decimals: Int) throws {
            guard let value else { return }
            guard let units = UInt64(value.baseUnits) else { throw MonitorLoadError.invalidEarnings }
            try require(String(units) == value.baseUnits && value.decimals == decimals
                        && value.display == RewardTracker.format(units: units, decimals: decimals))
        }
        func boundary(_ start: Date?, _ end: Date?, _ slot: String?) throws {
            if let start, let end, let slot, let n = UInt64(slot), let observed = UInt64(observedSlot) {
                try require(start <= end && end <= observedAt && n <= observed)
            } else { try require(start == nil && end == nil && slot == nil) }
        }
        try require([1, 2, 3].contains(schemaVersion) && TimeZone(identifier: timeZone) != nil && days.count <= 7)
        if let historyStartDay {
            let calendar = try EarningsCalendar(timeZone: timeZone)
            try require(calendar.date(historyStartDay) != nil && historyStartDay <= calendar.key(observedAt))
        }
        try require(schemaVersion == 1 ? position == nil : position != nil)
        try require(market.source == "DEX Screener" && market.quotes.count <= 2)
        try require(Set(market.quotes.map(\.asset)).count == market.quotes.count)
        if let start = market.observedAt, let end = market.expiresAt {
            try require(start.timeIntervalSince(now) <= 5 && end > start && end.timeIntervalSince(start) <= 600)
        } else { try require(market.observedAt == nil && market.expiresAt == nil && market.quotes.isEmpty) }
        for quote in market.quotes {
            if quote.asset == "XAUt0" { try require(market.hasValidGoldQuote(quote, at: market.observedAt ?? now)) }
            let expected = quote.asset == "GODL" ? "GodL6KZ9uuUoQwELggtVzQkKmU1LfqmDokPibPeDKkhF"
                : quote.asset == "XAUt0" ? "AymATz4TCL9sWNEEV9Kvyz45CHVhDZ6kUgjTJPzLpU9P" : ""
            try require(!expected.isEmpty && quote.mint == expected && !quote.pairAddress.isEmpty && !quote.dexId.isEmpty)
            for value in [quote.priceUsd, quote.liquidityUsd, quote.volume24hUsd] { try decimal(value, nonnegative: true) }
            try require(Decimal(string: quote.priceUsd)! > 0 && Decimal(string: quote.liquidityUsd)! >= 10_000
                        && Decimal(string: quote.volume24hUsd)! >= 100)
        }
        let verifiedGold = market.quotes.contains { $0.asset == "XAUt0"
            && market.hasValidGoldQuote($0, at: market.observedAt ?? now) }
        if holdings.goldUsd != nil || days.contains(where: { $0.goldUsd != nil }) { try require(verifiedGold) }
        for value in [holdings.unrefinedUsd, holdings.refinedUsd, holdings.goldUsd] { try decimal(value, nonnegative: true) }
        try require(Set(days.map(\.day)).count == days.count)
        for day in days {
            try require(day.day.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil)
            try require(["partial", "unavailable"].contains(day.coverage) && !day.reason.isEmpty)
            try boundary(day.fromAt, day.throughAt, day.throughSlot)
            if let from = day.fromSlot, let through = day.throughSlot {
                guard let from = UInt64(from), let through = UInt64(through) else { throw MonitorLoadError.invalidEarnings }
                try require(day.coverage == "partial" ? from < through : from <= through)
            } else { try require(day.fromSlot == nil && day.throughSlot == nil) }
            try token(day.unrefinedGodl, decimals: 11); try token(day.refinedGodl, decimals: 11); try token(day.gold, decimals: 6)
            if let count = day.claimCount {
                try require(schemaVersion == 3 && count > 0 && count <= 9_007_199_254_740_991
                            && day.coverage == "partial" && day.unrefinedGodl == nil && day.refinedGodl == nil
                            && day.unrefinedUsd == nil && day.refinedUsd == nil)
            } else { try require(day.claimAdjustedGodl == nil) }
            if let change = day.claimAdjustedGodl {
                try decimal(change)
                try require(change.range(of: #"^-?(?:0|[1-9]\d*)\.\d{11}$"#, options: .regularExpression) != nil
                            && change != "-0.00000000000")
            }
            if let attribution = day.claimAttribution {
                try require(schemaVersion == 3 && day.claimCount != nil
                            && attribution.method == "isolated-claim-factor-v1")
                let values = [attribution.principalGodl, attribution.refinedGodl, attribution.refiningFeeGodl,
                              attribution.referralFeeGodl, attribution.ownerReceiptGodl]
                if attribution.status == "observed" {
                    try require(attribution.reason == "isolated-claim-factor-proof" && values.allSatisfy { $0 != nil })
                    for value in values { try token(value, decimals: 11) }
                    let amounts = values.compactMap { $0.flatMap { UInt64($0.baseUnits) } }
                    try require(amounts.count == 5)
                    let (gross, overflow) = amounts[0].addingReportingOverflow(amounts[1])
                    try require(!overflow && amounts[2] <= amounts[0] / 10 && amounts[2] <= gross)
                    let afterRefining = gross - amounts[2]
                    try require(amounts[3] <= afterRefining / 200 && amounts[4] == afterRefining - amounts[3])
                    if day.claimCount == 1 { try require(amounts[2] == 0 || amounts[2] == amounts[0] / 10) }
                } else {
                    try require(attribution.status == "unavailable" && values.allSatisfy { $0 == nil }
                                && ["claim-evidence-unavailable", "claim-state-not-isolated", "claim-factor-unavailable",
                                    "claim-attribution-mismatch", "claim-attribution-range"].contains(attribution.reason))
                }
            }
            for value in [day.unrefinedUsd, day.refinedUsd, day.goldUsd, day.netSpendUsd, day.rewardValueUsd, day.netRewardUsd] { try decimal(value) }
            if day.netRewardUsd != nil {
                let godlKnown = day.claimCount == nil ? day.unrefinedGodl != nil && day.refinedGodl != nil
                    : day.claimAdjustedGodl != nil
                try require(day.coverage == "partial" && godlKnown
                            && day.gold != nil && day.netSpendUsd != nil && day.rewardValueUsd != nil)
            }
            try NetUSDValidation.validate(net: day.netRewardUsd, reward: day.rewardValueUsd, spend: day.netSpendUsd)
        }
        try require(total.scope == "unrefined-only" && !total.reason.isEmpty)
        try boundary(total.fromAt, total.throughAt, total.throughSlot)
        for amount in [total.claimableGodl, total.refiningFee, total.referralFee] { try token(amount, decimals: 11) }
        for value in [total.rewardValueUsd, total.netSpendUsd, total.netPnlUsd] { try decimal(value) }
        if total.netPnlUsd != nil { try require(total.claimableGodl != nil && total.rewardValueUsd != nil && total.netSpendUsd != nil && total.throughSlot != nil) }
        try NetUSDValidation.validate(net: total.netPnlUsd, reward: total.rewardValueUsd, spend: total.netSpendUsd)
        if schemaVersion == 3 {
            try require(total.claimableGodl == nil && total.refiningFee == nil && total.referralFee == nil
                        && total.rewardValueUsd == nil && total.netSpendUsd == nil && total.netPnlUsd == nil)
        }
        if let position {
            func unsigned(_ value: String) throws -> UInt64 {
                guard let number = UInt64(value), String(number) == value else { throw MonitorLoadError.invalidEarnings }
                return number
            }
            func cash(_ value: String, places: Int) throws {
                try decimal(value)
                try require(value.range(of: "^-?(?:0|[1-9][0-9]*)\\.[0-9]{\(places)}$", options: .regularExpression) != nil)
                try require(value != "-0." + String(repeating: "0", count: places))
            }
            func sol(_ value: SOLAmount) throws -> UInt64 {
                let units = try unsigned(value.lamports)
                try require(value.isCanonical)
                return units
            }
            let slot = try unsigned(position.throughSlot)
            let observed = try unsigned(observedSlot)
            try require(position.fromAt <= position.throughAt && position.throughAt <= observedAt && slot <= observed)
            try cash(position.netSpendSol, places: 9)
            try cash(position.netSpendUsd, places: 6)
            let stored = try sol(position.storedSol)
            if let pending = position.pendingRound {
                _ = try unsigned(pending.roundId)
                try require(try sol(pending.deployedSol) > 0)
            }
            try require(position.netReady == (position.pendingRound == nil && stored == 0)
                        && !position.reason.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            func settledBoundary(_ end: Date?, _ rawSlot: String?, hasNet: Bool) throws {
                if let end, let rawSlot {
                    let settledSlot = try unsigned(rawSlot)
                    try require(end <= position.throughAt && settledSlot <= slot)
                    if hasNet && !position.netReady {
                        try require(settledSlot < slot)
                    }
                } else if hasNet { throw MonitorLoadError.invalidEarnings }
            }
            try settledBoundary(total.throughAt, total.throughSlot, hasNet: total.netPnlUsd != nil)
            for day in days {
                if let from = day.fromSlot { _ = try unsigned(from) }
                try settledBoundary(day.throughAt, day.throughSlot, hasNet: day.netRewardUsd != nil)
            }
        }
    }
}
