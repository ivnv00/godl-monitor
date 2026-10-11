import Foundation

extension HoldingValues {
    /// Called after earnings and native amounts have passed their structural checks.
    /// Expiry affects display availability, not the exact relationship in a saved observation.
    func validate(balances: Balances, market: MarketQuotes) throws {
        let fields: [(String?, Availability<TokenAmount>?, Int, String, String)] = [
            (unrefinedUsd, balances.unrefinedGodl, 11, "GODL", "GodL6KZ9uuUoQwELggtVzQkKmU1LfqmDokPibPeDKkhF"),
            (refinedUsd, balances.refinedGodl, 11, "GODL", "GodL6KZ9uuUoQwELggtVzQkKmU1LfqmDokPibPeDKkhF"),
            (goldUsd, balances.claimableGold, 6, "XAUt0", "AymATz4TCL9sWNEEV9Kvyz45CHVhDZ6kUgjTJPzLpU9P"),
        ]
        for (value, balance, decimals, asset, mint) in fields {
            guard let value else { continue }
            guard case .observed(let amount) = balance, amount.isCanonical(decimals: decimals),
                  let quote = market.quotes.first(where: { $0.asset == asset && $0.mint == mint }),
                  let supplied = HoldingUSD.microdollars(value),
                  supplied == HoldingUSD.roundedMicrodollars(units: amount.baseUnits, decimals: decimals, price: quote.priceUsd) else {
                throw MonitorLoadError.invalidEarnings
            }
        }
    }
}

/// Only the unsigned holdings product is needed here. Keep all digits, including
/// quantities above UInt64 and prices/products above Foundation Decimal precision.
private enum HoldingUSD {
    static func microdollars(_ value: String) -> String? {
        let parts = value.split(separator: ".", omittingEmptySubsequences: false)
        let whole = String(parts[0])
        let fraction = parts.count == 2 ? String(parts[1]) : ""
        guard fraction.dropFirst(6).allSatisfy({ $0 == "0" }) else { return nil }
        let scaled = whole + String(fraction.prefix(6)) + String(repeating: "0", count: max(0, 6 - fraction.count))
        // The existing decimal contract permits negative zero; preserve its numeric meaning.
        if scaled.first == "-" {
            return scaled.dropFirst().allSatisfy({ $0 == "0" }) ? "0" : nil
        }
        return normalized(scaled)
    }

    static func roundedMicrodollars(units: String, decimals: Int, price: String) -> String? {
        let parts = price.split(separator: ".", omittingEmptySubsequences: false)
        guard (1...2).contains(parts.count), parts.allSatisfy({
            !$0.isEmpty && $0.utf8.allSatisfy { (48...57).contains($0) }
        }) else { return nil }
        let fraction = parts.count == 2 ? String(parts[1]) : ""
        let lhs = units.utf8.reversed().map { Int($0 - 48) }
        let rhs = (String(parts[0]) + fraction).utf8.reversed().map { Int($0 - 48) }
        var product = [Int](repeating: 0, count: lhs.count + rhs.count)
        for i in lhs.indices {
            for j in rhs.indices { product[i + j] += lhs[i] * rhs[j] }
        }
        for i in 0..<(product.count - 1) {
            product[i + 1] += product[i] / 10
            product[i] %= 10
        }
        let digits = normalized(product.reversed().map(String.init).joined())
        let discarded = decimals + fraction.count - 6
        guard discarded > 0 else { return digits }
        let padded = String(repeating: "0", count: max(0, discarded + 1 - digits.count)) + digits
        let retained = normalized(String(padded.dropLast(discarded)))
        // engine/earnings.mjs usd uses Ratio.decimal(6): nearest, ties upward.
        guard padded.suffix(discarded).first! >= "5" else { return retained }
        var rounded = Array(retained.utf8)
        for i in rounded.indices.reversed() {
            if rounded[i] < 57 {
                rounded[i] += 1
                return String(decoding: rounded, as: UTF8.self)
            }
            rounded[i] = 48
        }
        return "1" + String(decoding: rounded, as: UTF8.self)
    }

    private static func normalized(_ digits: String) -> String {
        let significant = digits.drop(while: { $0 == "0" })
        return significant.isEmpty ? "0" : String(significant)
    }
}
