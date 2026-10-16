import Foundation

/// Unrefined principal credited by finalized checkpoint transactions. Refined
/// and gold accrual are intentionally outside this evidence's scope.
public struct DailyMiningRewards: Codable, Equatable, Sendable {
    public let schemaVersion: Int
    public let wallet: String
    public let genesisHash: String
    public let programAddress: String
    public let sourceCommit: String
    public let deployedAtSlot: String
    public let day: String
    public let timeZone: String
    public let fromAt: Date
    public let throughAt: Date
    public let throughSlot: String
    public let unrefinedBaseUnits: String
    public let transactionCount: Int
    public let checkpointCount: Int

    public var unrefinedUnits: UInt64? { UInt64(unrefinedBaseUnits) }

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
              let slot = UInt64(throughSlot), String(slot) == throughSlot,
              let observedSlot = UInt64(monitor.provenance.slot), slot <= observedSlot,
              slot >= 457_407_037,
              let units = unrefinedUnits, String(units) == unrefinedBaseUnits,
              transactionCount >= 0, transactionCount <= 10_000,
              checkpointCount >= 0, checkpointCount <= 10_000,
              checkpointCount > 0 || units == 0,
              let zone = TimeZone(identifier: timeZone),
              monitor.earnings == nil || monitor.earnings?.timeZone == timeZone,
              fromAt <= throughAt, throughAt <= monitor.provenance.observedAt else {
            throw MonitorLoadError.invalidRewardAmount
        }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = zone
        let parts = calendar.dateComponents([.year, .month, .day], from: fromAt)
        let key = String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
        guard fromAt == calendar.startOfDay(for: throughAt), day == key else {
            throw MonitorLoadError.invalidRewardAmount
        }
    }
}
