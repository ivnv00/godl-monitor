import Foundation

/// An observed change in the unrefined GODL balance between two valid history points.
public struct BalanceChange: Identifiable, Sendable {
    public let fromAt: Date
    public let throughAt: Date
    public let fromSlot: String
    public let throughSlot: String
    public let before: String
    public let after: String
    public let delta: String
    public let isIncrease: Bool
    public let isCatchUp: Bool

    public var id: String { throughSlot }

    /// Exact, selectable detail text without narrowing to Decimal or Double.
    public var signedDelta: String {
        isIncrease ? "+" + delta : "−" + delta.dropFirst()
    }

    /// Returns actual balance movements in reverse chronological order. Invalid,
    /// missing, or non-increasing observations break the baseline so movements are
    /// never inferred across an unknown interval.
    public static func observations(in history: History) -> [BalanceChange] {
        let format = Date.ISO8601FormatStyle(includingFractionalSeconds: true)

        var baseline: Observation?
        var highWater: Chronology?
        var changes = [BalanceChange]()
        for point in history.series {
            guard let date = try? format.parse(point.observedAt),
                  DecimalDigits.isCanonical(point.slot) else {
                baseline = nil
                continue
            }
            let chronology = Chronology(date: date, slot: point.slot)
            if let highWater,
               !(chronology.date > highWater.date
                 && DecimalDigits.compare(highWater.slot, chronology.slot) == .orderedAscending) {
                baseline = nil
                continue
            }
            highWater = chronology
            guard let amount = point.unrefinedGodl,
                  amount.isCanonical(decimals: 11) else {
                baseline = nil
                continue
            }

            let current = Observation(date: date, slot: point.slot, amount: amount)
            guard let previous = baseline else {
                baseline = current
                continue
            }

            baseline = current
            guard previous.amount.baseUnits != current.amount.baseUnits else { continue }
            let increase = DecimalDigits.compare(previous.amount.baseUnits, current.amount.baseUnits) == .orderedAscending
            let difference = increase
                ? DecimalDigits.subtract(current.amount.baseUnits, previous.amount.baseUnits)
                : DecimalDigits.subtract(previous.amount.baseUnits, current.amount.baseUnits)
            changes.append(BalanceChange(
                fromAt: previous.date,
                throughAt: current.date,
                fromSlot: previous.slot,
                throughSlot: current.slot,
                before: previous.amount.display,
                after: current.amount.display,
                delta: (increase ? "" : "-") + DecimalDigits.decimal(difference, places: 11),
                isIncrease: increase,
                isCatchUp: current.date.timeIntervalSince(previous.date) > 300
            ))
        }
        return changes.reversed()
    }
}

private extension BalanceChange {
    struct Chronology {
        let date: Date
        let slot: String
    }

    struct Observation {
        let date: Date
        let slot: String
        let amount: TokenAmount
    }
}

private enum DecimalDigits {
    static func isCanonical(_ value: String) -> Bool {
        !value.isEmpty
            && value.utf8.allSatisfy { (48...57).contains($0) }
            && (value == "0" || value.first != "0")
    }

    static func compare(_ lhs: String, _ rhs: String) -> ComparisonResult {
        if lhs.count != rhs.count { return lhs.count < rhs.count ? .orderedAscending : .orderedDescending }
        if lhs == rhs { return .orderedSame }
        return lhs.lexicographicallyPrecedes(rhs) ? .orderedAscending : .orderedDescending
    }

    /// Subtracts two canonical unsigned integer strings where `lhs >= rhs`.
    static func subtract(_ lhs: String, _ rhs: String) -> String {
        let left = lhs.utf8.reversed().map { Int($0 - 48) }
        let right = rhs.utf8.reversed().map { Int($0 - 48) }
        var result = [Int]()
        var borrow = 0
        for index in left.indices {
            var digit = left[index] - borrow - (index < right.count ? right[index] : 0)
            if digit < 0 {
                digit += 10
                borrow = 1
            } else {
                borrow = 0
            }
            result.append(digit)
        }
        while result.count > 1 && result.last == 0 { result.removeLast() }
        return result.reversed().map(String.init).joined()
    }

    static func decimal(_ baseUnits: String, places: Int) -> String {
        let padded = String(repeating: "0", count: max(0, places + 1 - baseUnits.count)) + baseUnits
        guard places > 0 else { return padded }
        return String(padded.dropLast(places)) + "." + String(padded.suffix(places))
    }
}
