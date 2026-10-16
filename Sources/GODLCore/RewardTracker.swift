import Foundation

public struct RewardSample: Equatable, Sendable {
    public let identity: String
    public let slot: UInt64
    public let observedAt: Date
    public let unrefinedUnits: UInt64?
    public let lastClaimGodlAt: String?
    public let cumulativeGoldUnits: UInt64?
    public let refinedUnits: UInt64?

    public init(
        identity: String,
        slot: UInt64,
        observedAt: Date,
        unrefinedUnits: UInt64?,
        lastClaimGodlAt: String?,
        cumulativeGoldUnits: UInt64?,
        refinedUnits: UInt64? = nil
    ) {
        self.identity = identity
        self.slot = slot
        self.observedAt = observedAt
        self.unrefinedUnits = unrefinedUnits
        self.lastClaimGodlAt = lastClaimGodlAt
        self.cumulativeGoldUnits = cumulativeGoldUnits
        self.refinedUnits = refinedUnits
    }

    public init(
        wallet: String,
        network: String,
        program: String,
        source: String,
        slot: UInt64,
        observedAt: Date,
        unrefinedUnits: UInt64?,
        lastClaimGodlAt: String?,
        cumulativeGoldUnits: UInt64?,
        refinedUnits: UInt64? = nil
    ) {
        self.init(
            identity: Self.identity(wallet: wallet, network: network, program: program, source: source),
            slot: slot,
            observedAt: observedAt,
            unrefinedUnits: unrefinedUnits,
            lastClaimGodlAt: lastClaimGodlAt,
            cumulativeGoldUnits: cumulativeGoldUnits,
            refinedUnits: refinedUnits
        )
    }

    public static func identity(wallet: String, network: String, program: String, source: String) -> String {
        // This verified Config-only upgrade leaves all reward fields and
        // settlement formulas unchanged. Keep the existing journal namespace;
        // the monitor retains its actual decoder-source provenance separately.
        let rewardSource = program == "mineWsRs2Rmw2jPMkVbgAbDjV1E23yQ8TEodaX3iza4"
            && source == "8cbbc86341445d11e3779dfd5be9363474d75683"
            ? "4b7bb4c6619d25f52ef9152de906a46027995143" : source
        return [wallet, network, program, rewardSource].joined(separator: "\u{1F}")
    }
}

public struct RewardChange: Equatable, Sendable {
    public let identity: String
    public let slot: UInt64
    public let unrefinedUnits: UInt64?
    public let goldUnits: UInt64?
    public let refinedUnits: UInt64?

    public init(identity: String, slot: UInt64, unrefinedUnits: UInt64?, goldUnits: UInt64?, refinedUnits: UInt64? = nil) {
        self.identity = identity
        self.slot = slot
        self.unrefinedUnits = unrefinedUnits
        self.goldUnits = goldUnits
        self.refinedUnits = refinedUnits
    }
}

public struct RewardTracker: Codable, Equatable, Sendable {
    public static let staleAfter: TimeInterval = 60

    private var cursor: Cursor?

    public init() {}

    public var observedAt: Date? { cursor?.observedAt }
    public var identity: String? { cursor?.identity }

    public mutating func consume(_ sample: RewardSample, now: Date = Date()) -> RewardChange? {
        let age = now.timeIntervalSince(sample.observedAt)
        guard age >= 0, age <= Self.staleAfter else { return nil }
        guard let previous = cursor else {
            cursor = Cursor(sample)
            return nil
        }
        guard sample.identity == previous.identity else {
            cursor = Cursor(sample)
            return nil
        }
        guard sample.slot > previous.slot, sample.observedAt >= previous.observedAt else { return nil }

        let unrefinedDelta: UInt64?
        if sample.lastClaimGodlAt != nil, sample.lastClaimGodlAt == previous.lastClaimGodlAt,
           let old = previous.unrefinedUnits, let new = sample.unrefinedUnits, new > old {
            unrefinedDelta = new - old
        } else {
            unrefinedDelta = nil
        }

        let refinedDelta: UInt64?
        if sample.lastClaimGodlAt != nil, sample.lastClaimGodlAt == previous.lastClaimGodlAt,
           let old = previous.refinedUnits, let new = sample.refinedUnits, new > old {
            refinedDelta = new - old
        } else {
            refinedDelta = nil
        }

        let goldDelta: UInt64?
        if let old = previous.cumulativeGoldUnits, let new = sample.cumulativeGoldUnits, new > old {
            goldDelta = new - old
        } else {
            goldDelta = nil
        }

        cursor = Cursor(sample)
        guard unrefinedDelta != nil || goldDelta != nil || refinedDelta != nil else { return nil }
        return RewardChange(identity: sample.identity, slot: sample.slot,
            unrefinedUnits: unrefinedDelta, goldUnits: goldDelta, refinedUnits: refinedDelta)
    }

    public static func format(units: UInt64, decimals: Int) -> String {
        precondition((0...19).contains(decimals))
        guard decimals > 0 else { return String(units) }
        let divisor = (0..<decimals).reduce(UInt64(1)) { value, _ in value * 10 }
        let whole = units / divisor
        let fraction = String(units % divisor)
        return "\(whole).\(String(repeating: "0", count: decimals - fraction.count))\(fraction)"
    }

    private struct Cursor: Codable, Equatable, Sendable {
        let identity: String
        let slot: UInt64
        let observedAt: Date
        let unrefinedUnits: UInt64?
        let lastClaimGodlAt: String?
        let cumulativeGoldUnits: UInt64?
        let refinedUnits: UInt64?

        init(_ sample: RewardSample) {
            identity = sample.identity
            slot = sample.slot
            observedAt = sample.observedAt
            unrefinedUnits = sample.unrefinedUnits
            lastClaimGodlAt = sample.lastClaimGodlAt
            cumulativeGoldUnits = sample.cumulativeGoldUnits
            refinedUnits = sample.refinedUnits
        }
    }
}
