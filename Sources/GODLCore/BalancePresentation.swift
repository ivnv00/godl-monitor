import Foundation

extension Goal {
    /// Unavailable is distinct from an observed zero, including for accessibility.
    public var progressFraction: Double? {
        guard case .observed(let goal) = self,
              let percent = Double(goal.progressPercent), percent.isFinite else { return nil }
        return min(1, max(0, percent / 100))
    }
}

public struct BalancePoint: Identifiable, Sendable {
    public let slot: String
    public let date: Date
    public let raw: String
    public let value: Double
    public var id: String { slot }

    public static func observations(in history: History) -> [BalancePoint] {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return history.series.compactMap { item in
            guard let amount = item.unrefinedGodl, amount.isCanonical(decimals: 11),
                  let date = formatter.date(from: item.observedAt),
                  let value = Double(amount.display), value.isFinite else { return nil }
            return BalancePoint(slot: item.slot, date: date, raw: amount.display, value: value)
        }
    }
}

/// One derivation per render. Exact strings remain available in the ledger;
/// floating-point values serve only as chart coordinates.
public struct BalancePlot {
    public let points: [BalancePoint]
    /// The exact step path, omitting only interior samples of unchanged runs.
    /// `points` and the Activity ledger still retain every observation.
    public let renderedPoints: [BalancePoint]
    public let domain: ClosedRange<Double>
    public let markedIDs: Set<String>
    public let change: Decimal?
    public let longSpan: Bool

    public init(points: [BalancePoint], days: Int, now: Date) {
        let cutoff = now.addingTimeInterval(-Double(days) * 86400)
        let candidate = points.filter { days == 0 || $0.date >= cutoff }
        // A direct caller must not be able to send invalid coordinates to Charts.
        // Unknown data stays empty, rather than becoming an invented zero balance.
        let valid = candidate.allSatisfy {
            $0.value.isFinite && $0.value >= 0 && $0.date.timeIntervalSince1970.isFinite
        } && Set(candidate.map(\.id)).count == candidate.count
        let series = valid ? candidate : []
        self.points = series
        var low = series.first?.value ?? 0
        var high = low
        var markers = Set<String>()
        var rendered = [BalancePoint]()
        for (index, point) in series.enumerated() {
            low = min(low, point.value)
            high = max(high, point.value)
            if index == 0 || index == series.count - 1 || point.raw != series[index - 1].raw {
                markers.insert(point.id)
            }
            if index == 0 || index == series.count - 1 || point.raw != series[index - 1].raw || point.raw != series[index + 1].raw {
                rendered.append(point)
            }
        }
        let padding = max(0.0001, max((high - low) * 0.15, abs(high) * 0.005))
        let upper = high > Double.greatestFiniteMagnitude - padding ? Double.greatestFiniteMagnitude : high + padding
        domain = max(0, low - padding)...upper
        renderedPoints = rendered
        markedIDs = markers
        if let first = series.first, let last = series.last {
            longSpan = last.date.timeIntervalSince(first.date) >= 86400
            if let opening = Decimal(string: first.raw, locale: Locale(identifier: "en_US_POSIX")),
               let closing = Decimal(string: last.raw, locale: Locale(identifier: "en_US_POSIX")) {
                let difference = closing - opening
                change = difference.isNaN ? nil : difference
            } else { change = nil }
        } else {
            longSpan = false
            change = nil
        }
    }
}
