import Foundation

/// Exact yield since a proved local-midnight opening, independently per asset.
public struct DailyYield: Codable, Equatable, Sendable {
    public struct Amount: Codable, Equatable, Sendable {
        public let baseUnits: String
        public let openingBaseUnits: String
        public let closingBaseUnits: String
        public let lastClaimGodlAt: String?

        public var units: UInt64? { UInt64(baseUnits) }

        func validate() throws {
            guard let earned = units, String(earned) == baseUnits,
                  let opening = UInt64(openingBaseUnits), String(opening) == openingBaseUnits,
                  let closing = UInt64(closingBaseUnits), String(closing) == closingBaseUnits,
                  closing >= opening, closing - opening == earned else {
                throw MonitorLoadError.invalidRewardAmount
            }
        }
    }

    public let schemaVersion: Int
    public let wallet: String
    public let genesisHash: String
    public let programAddress: String
    public let sourceCommit: String
    public let deployedAtSlot: String
    public let proofHash: String
    public let day: String
    public let timeZone: String
    public let fromAt: Date
    public let throughAt: Date
    public let throughSlot: String
    public let refined: Amount?
    public let gold: Amount?

    public func isToday(at now: Date = Date()) -> Bool {
        guard let zone = TimeZone(identifier: timeZone) else { return false }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = zone
        return calendar.isDate(fromAt, inSameDayAs: now)
    }

    func validate(monitor: MonitorView) throws {
        guard schemaVersion == 1, wallet == monitor.wallet,
              genesisHash == monitor.provenance.genesisHash,
              programAddress == monitor.provenance.programAddress,
              programAddress == "mineWsRs2Rmw2jPMkVbgAbDjV1E23yQ8TEodaX3iza4",
              sourceCommit == monitor.provenance.sourceCommit,
              sourceCommit == "8cbbc86341445d11e3779dfd5be9363474d75683",
              deployedAtSlot == "457407037",
              proofHash.count == 64, proofHash.allSatisfy({ $0.isASCII && ("0"..."9" ~= $0 || "a"..."f" ~= $0) }),
              let slot = UInt64(throughSlot), String(slot) == throughSlot,
              throughSlot == monitor.provenance.slot, slot >= 457_407_037,
              throughAt == monitor.provenance.observedAt, fromAt <= throughAt,
              let zone = TimeZone(identifier: timeZone),
              monitor.earnings == nil || monitor.earnings?.timeZone == timeZone,
              refined != nil || gold != nil else {
            throw MonitorLoadError.invalidRewardAmount
        }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = zone
        let parts = calendar.dateComponents([.year, .month, .day], from: fromAt)
        let key = String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
        guard fromAt == calendar.startOfDay(for: throughAt), day == key else {
            throw MonitorLoadError.invalidRewardAmount
        }
        if let refined {
            try refined.validate()
            guard let marker = refined.lastClaimGodlAt, let seconds = Int64(marker), String(seconds) == marker,
                  Decimal(seconds) < Decimal(fromAt.timeIntervalSince1970),
                  marker == monitor.rewardObservation?.lastClaimGodlAt,
                  case .observed(let current) = monitor.balances.refinedGodl,
                  refined.closingBaseUnits == current.baseUnits else {
                throw MonitorLoadError.invalidRewardAmount
            }
        }
        if let gold {
            try gold.validate()
            guard gold.lastClaimGodlAt == nil,
                  gold.closingBaseUnits == monitor.rewardObservation?.cumulativeGoldBaseUnits else {
                throw MonitorLoadError.invalidRewardAmount
            }
        }
    }
}
