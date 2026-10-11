import Foundation

public enum MonitorLoadError: Error, Equatable, Sendable {
    case unsupportedSchema(Int)
    case unsupportedMode(String)
    case nonMainnet(network: String, genesisHash: String)
    case nonFinalized(String)
    case unsafeCapabilities
    case invalidFreshnessPolicy(Int64)
    case futureObservation(Date)
    case unsupportedAcquisitionPeriodStatus(String)
    case invalidAcquisitionPeriodDates
    case futureAcquisitionPeriod(Date)
    case invalidAcquisitionPeriodAmount(field: String, value: String)
    case invalidRewardAmount
    case invalidBalanceAmount
    case invalidSOLAmount
    case invalidBalanceHistory
    case invalidAccountingStatus
    case invalidEarnings
}

extension MonitorLoadError: LocalizedError {
    public var errorDescription: String? {
        switch self {
        case .unsupportedSchema(let version): "Unsupported monitor schema version \(version)."
        case .unsupportedMode(let mode): "Unsupported monitor mode \(mode)."
        case .nonMainnet: "The monitor document is not verified Solana mainnet data."
        case .nonFinalized(let commitment): "The observation commitment is \(commitment), not finalized."
        case .unsafeCapabilities: "The monitor document claims transaction or pause capabilities."
        case .invalidFreshnessPolicy: "The monitor freshness threshold must be positive."
        case .futureObservation: "The monitor observation is more than five seconds in the future."
        case .unsupportedAcquisitionPeriodStatus(let status): "Unsupported acquisition-period status \(status)."
        case .invalidAcquisitionPeriodDates: "The acquisition period must contain ordered UTC millisecond timestamps."
        case .futureAcquisitionPeriod: "The acquisition period extends into the future."
        case .invalidAcquisitionPeriodAmount(let field, let value): "The acquisition-period amount \(field) is invalid: \(value)."
        case .invalidRewardAmount: "Reward amounts are invalid or have inconsistent precision."
        case .invalidBalanceAmount: "Current balances have invalid or inconsistent token amounts."
        case .invalidSOLAmount: "SOL amounts have invalid or inconsistent lamport values."
        case .invalidBalanceHistory: "Balance history has invalid or inconsistent token amounts."
        case .invalidAccountingStatus: "The accounting status has invalid coverage or dates."
        case .invalidEarnings: "The earnings estimate has invalid amounts, prices or coverage."
        }
    }
}

public struct MonitorFileLoader: Sendable {
    public static let supportedSchemaVersion = 1
    public static let mainnetNetwork = "solana-mainnet-beta"
    public static let mainnetGenesisHash = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d"
    public static let futureTolerance: TimeInterval = 5

    public init() {}

    /// File validation and history derivation run together outside the UI actor.
    public func prepare(from url: URL, now: Date = Date()) throws -> PreparedMonitorView {
        let view = try load(from: url, now: now)
        return PreparedMonitorView(view: view, balancePoints: BalancePoint.observations(in: view.history),
            balanceChanges: BalanceChange.observations(in: view.history))
    }

    public func load(from url: URL, now: Date = Date()) throws -> MonitorView {
        let data = try Data(contentsOf: url, options: [.mappedIfSafe])
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let value = try decoder.singleValueContainer().decode(String.self)
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            guard let date = formatter.date(from: value) else {
                throw DecodingError.dataCorruptedError(in: try decoder.singleValueContainer(), debugDescription: "Invalid ISO-8601 date: \(value)")
            }
            return date
        }

        let monitor = try decoder.decode(MonitorView.self, from: data)
        try validate(monitor, now: now)
        return monitor
    }

    private func validate(_ monitor: MonitorView, now: Date) throws {
        guard monitor.schemaVersion == Self.supportedSchemaVersion else {
            throw MonitorLoadError.unsupportedSchema(monitor.schemaVersion)
        }
        guard monitor.mode == "read-only" else {
            throw MonitorLoadError.unsupportedMode(monitor.mode)
        }
        guard monitor.network == Self.mainnetNetwork,
              monitor.provenance.genesisHash == Self.mainnetGenesisHash else {
            throw MonitorLoadError.nonMainnet(network: monitor.network, genesisHash: monitor.provenance.genesisHash)
        }
        guard monitor.provenance.commitment == "finalized" else {
            throw MonitorLoadError.nonFinalized(monitor.provenance.commitment)
        }
        guard !monitor.capabilities.canPause, !monitor.capabilities.canExecute else {
            throw MonitorLoadError.unsafeCapabilities
        }
        guard monitor.observation.staleAfterMs > 0 else {
            throw MonitorLoadError.invalidFreshnessPolicy(monitor.observation.staleAfterMs)
        }
        guard monitor.provenance.observedAt.timeIntervalSince(now) <= Self.futureTolerance else {
            throw MonitorLoadError.futureObservation(monitor.provenance.observedAt)
        }
        for field in [monitor.balances.unrefinedGodl, monitor.balances.storedRefinedGodl] {
            if case .observed(let amount) = field, !amount.isCanonical(decimals: 11) {
                throw MonitorLoadError.invalidBalanceAmount
            }
        }
        var solAmounts = monitor.automations.flatMap {
            [$0.balanceSol, $0.amountPerSquareSol, $0.executorFeeSol].compactMap { $0 }
        }
        if case .observed(let amount) = monitor.balances.storedClaimableSol { solAmounts.append(amount) }
        if case .observed(let deployment) = monitor.deployment { solAmounts.append(deployment.lastPlayedDeploymentSol) }
        guard solAmounts.allSatisfy(\.isCanonical) else { throw MonitorLoadError.invalidSOLAmount }
        for point in monitor.history.series {
            if let amount = point.unrefinedGodl, !amount.isCanonical(decimals: 11) {
                throw MonitorLoadError.invalidBalanceHistory
            }
        }
        for (field, decimals) in [(monitor.balances.refinedGodl, 11), (monitor.balances.pendingRefinedGodl, 11),
                                  (monitor.balances.claimableGold, 6), (monitor.balances.storedGold, 6), (monitor.balances.pendingGold, 6)] {
            if case .observed(let value) = field {
                guard value.decimals == decimals, let units = UInt64(value.baseUnits),
                      String(units) == value.baseUnits,
                      value.display == RewardTracker.format(units: units, decimals: decimals) else {
                    throw MonitorLoadError.invalidRewardAmount
                }
            }
        }
        if let units = monitor.rewardObservation?.cumulativeGoldBaseUnits,
           UInt64(units).map({ String($0) == units }) != true { throw MonitorLoadError.invalidRewardAmount }
        if let period = monitor.acquisitionPeriod {
            try validate(period, now: now)
        }
        if let status = monitor.accounting {
            guard monitor.acquisitionPeriod != nil,
                  ["current", "waiting", "blocked", "retrying"].contains(status.state),
                  status.verifiedAt <= status.checkedAt,
                  status.checkedAt.timeIntervalSince(now) <= Self.futureTolerance,
                  status.verifiedAt <= monitor.provenance.observedAt,
                  let verifiedSlot = UInt64(status.verifiedThroughSlot),
                  let observedSlot = UInt64(monitor.provenance.slot), verifiedSlot <= observedSlot,
                  !status.reason.isEmpty, status.reason.count <= 1000 else {
                throw MonitorLoadError.invalidAccountingStatus
            }
        }
        if let earnings = monitor.earnings {
            try earnings.validate(observedAt: monitor.provenance.observedAt, observedSlot: monitor.provenance.slot, now: now)
        }
    }

    private func validate(_ period: AcquisitionPeriod, now: Date) throws {
        guard period.status == "estimated" else {
            throw MonitorLoadError.unsupportedAcquisitionPeriodStatus(period.status)
        }

        guard let startedAt = Self.acquisitionDate(period.startedAt),
              let throughAt = Self.acquisitionDate(period.throughAt),
              startedAt <= throughAt else {
            throw MonitorLoadError.invalidAcquisitionPeriodDates
        }
        guard startedAt <= now, throughAt <= now else {
            throw MonitorLoadError.futureAcquisitionPeriod(max(startedAt, throughAt))
        }

        try Self.requireAmount(period.openingGodl, field: "openingGodl", minimum: 0)
        try Self.requireAmount(period.earnedGodl, field: "earnedGodl", minimum: 0, isStrictMinimum: true)
        try Self.requireAmount(period.netSpendSol, field: "netSpendSol")
        try Self.requireAmount(period.netCostPerGodlSol, field: "netCostPerGodlSol")
        try Self.requireAmount(period.netSpendUsd, field: "netSpendUsd")
        try Self.requireAmount(period.netCostPerGodlUsd, field: "netCostPerGodlUsd")
        try Self.requireAmount(period.grossOutSol, field: "grossOutSol", minimum: 0)
        try Self.requireAmount(period.returnedSol, field: "returnedSol", minimum: 0)
        try Self.requireAmount(period.ownerNetworkFeesSol, field: "ownerNetworkFeesSol", minimum: 0)
        try Self.requireAmount(period.newRentSol, field: "newRentSol", minimum: 0)
    }

    private static func acquisitionDate(_ value: String) -> Date? {
        guard value.range(of: #"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$"#, options: .regularExpression) != nil else {
            return nil
        }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        return formatter.date(from: value)
    }

    private static func requireAmount(
        _ value: String,
        field: String,
        minimum: Decimal? = nil,
        isStrictMinimum: Bool = false
    ) throws {
        guard value.range(of: #"^-?(?:0|[1-9]\d*)(?:\.\d+)?$"#, options: .regularExpression) != nil,
              let amount = Decimal(string: value, locale: Locale(identifier: "en_US_POSIX")),
              !amount.isNaN,
              minimum.map({ isStrictMinimum ? amount > $0 : amount >= $0 }) ?? true else {
            throw MonitorLoadError.invalidAcquisitionPeriodAmount(field: field, value: value)
        }
    }
}

public struct PreparedMonitorView: Sendable {
    public let view: MonitorView
    public let balancePoints: [BalancePoint]
    public let balanceChanges: [BalanceChange]
}
