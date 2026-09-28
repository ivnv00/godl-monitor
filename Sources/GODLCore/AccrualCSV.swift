import Foundation

/// A snapshot of recorded gross increases. No wallet, provider, arbitrary text,
/// price estimate or inferred daily total is part of this export format.
public struct AccrualCSV: Sendable {
    public let data: Data
    public let recordCount: Int

    public enum Failure: Error, LocalizedError {
        case empty, invalidHistory
        public var errorDescription: String? {
            switch self {
            case .empty: "There are no matching accruals to export."
            case .invalidHistory: "This history couldn’t be exported safely. Existing records have been preserved."
            }
        }
    }

    public init(entries: [RewardInboxEntry], now: Date = Date()) throws {
        guard !entries.isEmpty else { throw Failure.empty }
        guard Set(entries.map(\.identity)).count == 1,
              Set(entries.map(\.id)).count == entries.count else { throw Failure.invalidHistory }
        let ordered = entries.sorted { $0.fromAt < $1.fromAt }
        let dates = ISO8601DateFormatter()
        dates.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        dates.timeZone = TimeZone(secondsFromGMT: 0)
        var previousEnd: Date?
        var text = "observed_from_utc,observed_through_utc,interval_kind,unrefined_godl,refined_godl,gold_xaut0,basis\r\n"
        for entry in ordered {
            try Task.checkCancellation()
            let amounts = [entry.unrefinedUnits, entry.refinedUnits, entry.goldUnits].compactMap { $0 }
            guard !amounts.isEmpty, amounts.allSatisfy({ $0 > 0 }),
                  entry.fromAt.timeIntervalSince1970.isFinite,
                  entry.throughAt.timeIntervalSince1970.isFinite,
                  entry.fromAt.timeIntervalSince1970 >= 0,
                  entry.throughAt.timeIntervalSince1970 < 253_402_300_800,
                  entry.fromAt <= entry.throughAt, entry.throughAt <= now,
                  previousEnd.map({ $0 <= entry.fromAt }) ?? true else { throw Failure.invalidHistory }
            let fields = [dates.string(from: entry.fromAt), dates.string(from: entry.throughAt),
                entry.throughAt.timeIntervalSince(entry.fromAt) > 300 ? "catch_up" : "observed",
                entry.unrefinedUnits.map { RewardTracker.format(units: $0, decimals: 11) } ?? "",
                entry.refinedUnits.map { RewardTracker.format(units: $0, decimals: 11) } ?? "",
                entry.goldUnits.map { RewardTracker.format(units: $0, decimals: 6) } ?? "",
                "gross_before_fees_and_costs"]
            // All fields are generated from fixed labels, dates or UInt64 values;
            // none can contain a CSV delimiter, quote, newline or formula prefix.
            text += fields.joined(separator: ",") + "\r\n"
            previousEnd = entry.throughAt
        }
        data = Data(text.utf8)
        recordCount = ordered.count
    }

    public func fileWrapper() -> FileWrapper {
        let file = FileWrapper(regularFileWithContents: data)
        file.fileAttributes = [FileAttributeKey.type.rawValue: FileAttributeType.typeRegular.rawValue,
                               FileAttributeKey.posixPermissions.rawValue: 0o600]
        return file
    }
}
