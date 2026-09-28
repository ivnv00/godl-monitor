import Foundation

/// Display-only projection. Exact strings remain authoritative; doubles only set bar geometry.
public enum EarningsMetric: String, CaseIterable, Sendable {
    case net, refined, gold, unrefined

    public func rawValue(for day: EarningsDay, market: MarketQuotes, at now: Date) -> String? {
        switch self {
        case .net: market.isFresh(at: now) ? day.netRewardUsd : nil
        case .refined: day.refinedGodl?.display
        case .gold: day.gold?.display
        case .unrefined: day.unrefinedGodl?.display
        }
    }
}

public struct EarningsPlotPoint: Identifiable, Sendable {
    public var id: String { day.id }
    public let day: EarningsDay
    public let raw: String?
    public var value: Double? { raw.flatMap(Double.init).flatMap { $0.isFinite ? $0 : nil } }
}

public struct EarningsPlot: Sendable {
    public let points: [EarningsPlotPoint]
    public let domain: ClosedRange<Double>

    public init(earnings: Earnings, metric: EarningsMetric, now: Date = Date()) {
        points = earnings.days.sorted { $0.day < $1.day }.map {
            EarningsPlotPoint(day: $0, raw: metric.rawValue(for: $0, market: earnings.market, at: now))
        }
        let values = points.compactMap(\.value)
        let low = min(values.min() ?? 0, 0)
        let high = max(values.max() ?? 0, 0)
        let span = high - low
        domain = span == 0 ? 0...1 : (low < 0 ? low - span * 0.15 : 0)...(high > 0 ? high + span * 0.15 : 0)
    }
}
