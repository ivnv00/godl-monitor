import Foundation

/// The producer rounds reward, spend and net independently to six decimals.
/// Compare signed microdollars without narrowing large strings to Decimal/Int64.
enum NetUSDValidation {
    static func validate(net: String?, reward: String?, spend: String?) throws {
        guard let net else { return } // Missing net is never inferred.
        guard let reward, let spend else { throw MonitorLoadError.invalidEarnings }
        var positive = [0], negative = [0]
        for (value, subtract) in [(net, false), (spend, false), (reward, true)] {
            guard let amount = microdollars(value) else { throw MonitorLoadError.invalidEarnings }
            if amount.negative != subtract { negative = add(negative, amount.digits) }
            else { positive = add(positive, amount.digits) }
        }
        // R6(reward - spend) differs from R6(reward) - R6(spend) by at most 1 µUSD.
        guard positive == negative || add(positive, [1]) == negative || add(negative, [1]) == positive else {
            throw MonitorLoadError.invalidEarnings
        }
    }

    private static func microdollars(_ value: String) -> (negative: Bool, digits: [Int])? {
        guard value.count <= 60,
              value.range(of: #"^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$"#, options: .regularExpression) != nil else { return nil }
        let negative = value.first == "-"
        let unsigned = negative ? String(value.dropFirst()) : value
        let parts = unsigned.split(separator: ".")
        let fraction = parts.count == 2 ? String(parts[1]) : ""
        guard fraction.dropFirst(6).allSatisfy({ $0 == "0" }) else { return nil }
        let scaled = String(parts[0]) + String(fraction.prefix(6))
            + String(repeating: "0", count: max(0, 6 - fraction.count))
        return (negative, normalized(scaled.utf8.reversed().map { Int($0 - 48) }))
    }

    /// Least significant digit first; at most two digits plus carry per column.
    private static func add(_ lhs: [Int], _ rhs: [Int]) -> [Int] {
        var result: [Int] = [], carry = 0
        for index in 0..<max(lhs.count, rhs.count) {
            let sum = (index < lhs.count ? lhs[index] : 0) + (index < rhs.count ? rhs[index] : 0) + carry
            result.append(sum % 10)
            carry = sum / 10
        }
        if carry > 0 { result.append(carry) }
        return normalized(result)
    }

    private static func normalized(_ digits: [Int]) -> [Int] {
        var result = digits
        while result.count > 1 && result.last == 0 { result.removeLast() }
        return result
    }
}
