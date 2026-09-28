import Foundation

public struct UnavailableValue: Codable, Equatable, Sendable {
    public let status: String
    public let reason: String

    public var isUnavailable: Bool { status == "unavailable" }
}

public enum Availability<Value: Codable & Equatable & Sendable>: Codable, Equatable, Sendable {
    case observed(Value)
    case unavailable(UnavailableValue)

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: StatusKey.self)
        if try container.decodeIfPresent(String.self, forKey: .status) == "unavailable" {
            self = .unavailable(try UnavailableValue(from: decoder))
        } else {
            self = .observed(try Value(from: decoder))
        }
    }

    public func encode(to encoder: Encoder) throws {
        switch self {
        case .observed(let value): try value.encode(to: encoder)
        case .unavailable(let value): try value.encode(to: encoder)
        }
    }

    private enum StatusKey: String, CodingKey { case status }
}

public struct TokenAmount: Codable, Equatable, Sendable {
    /// Kept as text so values larger than 64-bit integers and all decimal precision survive decoding.
    public let baseUnits: String
    public let decimals: Int
    public let display: String
}

public struct SOLAmount: Codable, Equatable, Sendable {
    /// Kept as text for the same lossless representation used by the monitor producer.
    public let lamports: String
    public let display: String
}

public struct MonitorView: Codable, Equatable, Sendable {
    public let schemaVersion: Int
    public let mode: String
    public let wallet: String
    public let network: String
    public let provenance: Provenance
    /// Serialized status and age are retained for contract fidelity, but callers should use `freshness(at:)`.
    public let observation: SerializedObservation
    public let capabilities: Capabilities
    public let balances: Balances
    public let goal: Goal
    public let deployment: Deployment
    public let automations: [Automation]
    public let performance: Performance
    public let acquisitionPeriod: AcquisitionPeriod?
    public let accounting: AccountingStatus?
    public let rewardObservation: RewardObservation?
    public let earnings: Earnings?
    public let history: History

    public func freshness(at now: Date = Date()) -> Freshness {
        let age = max(0, now.timeIntervalSince(provenance.observedAt))
        return age > TimeInterval(observation.staleAfterMs) / 1_000
            ? .stale(age: age)
            : .current(age: age)
    }
}

public struct RewardObservation: Codable, Equatable, Sendable {
    public let lastClaimGodlAt: String?
    public let cumulativeGoldBaseUnits: String?
}

public struct AccountingStatus: Codable, Equatable, Sendable {
    public let state: String
    public let checkedAt: Date
    public let verifiedAt: Date
    public let verifiedThroughSlot: String
    public let reason: String
}

public struct AcquisitionPeriod: Codable, Equatable, Sendable {
    public let status: String
    public let startedAt: String
    public let throughAt: String
    public let openingGodl: String
    public let earnedGodl: String
    public let netSpendSol: String
    public let netCostPerGodlSol: String
    public let netSpendUsd: String
    public let netCostPerGodlUsd: String
    public let grossOutSol: String
    public let returnedSol: String
    public let ownerNetworkFeesSol: String
    public let newRentSol: String
    public let priceBasis: String
    public let baselineBasis: String
    public let caveats: [String]
}

public struct Provenance: Codable, Equatable, Sendable {
    public let programAddress: String
    public let sourceCommit: String
    public let genesisHash: String
    public let commitment: String
    public let slot: String
    public let observedAt: Date
}

public struct SerializedObservation: Codable, Equatable, Sendable {
    public let status: String
    public let ageMs: Int64
    public let staleAfterMs: Int64
    public let caveat: String
}

public enum Freshness: Equatable, Sendable {
    case current(age: TimeInterval)
    case stale(age: TimeInterval)

    public var age: TimeInterval {
        switch self {
        case .current(let age), .stale(let age): age
        }
    }

    public var isStale: Bool {
        if case .stale = self { return true }
        return false
    }
}

public struct Capabilities: Codable, Equatable, Sendable {
    public let canObserve: Bool
    public let canPause: Bool
    public let canExecute: Bool
    public let reason: String
}

public struct Balances: Codable, Equatable, Sendable {
    public let unrefinedGodl: Availability<TokenAmount>
    public let storedRefinedGodl: Availability<TokenAmount>
    public let storedClaimableSol: Availability<SOLAmount>
    public let refinedGodl: Availability<TokenAmount>?
    public let pendingRefinedGodl: Availability<TokenAmount>?
    public let claimableGold: Availability<TokenAmount>?
    public let storedGold: Availability<TokenAmount>?
    public let pendingGold: Availability<TokenAmount>?
    public let notes: [String]
}

public enum Goal: Codable, Equatable, Sendable {
    case observed(ObservedGoal)
    case unavailable(UnavailableGoal)

    public init(from decoder: Decoder) throws {
        let status = try decoder.container(keyedBy: StatusKey.self).decode(String.self, forKey: .status)
        switch status {
        case "observed": self = .observed(try ObservedGoal(from: decoder))
        case "unavailable": self = .unavailable(try UnavailableGoal(from: decoder))
        default:
            throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unsupported goal status: \(status)"))
        }
    }

    public func encode(to encoder: Encoder) throws {
        switch self {
        case .observed(let value): try value.encode(to: encoder)
        case .unavailable(let value): try value.encode(to: encoder)
        }
    }

    private enum StatusKey: String, CodingKey { case status }
}

public struct ObservedGoal: Codable, Equatable, Sendable {
    public let status: String
    public let targetGodl: String
    public let remainingGodl: String
    public let progressPercent: String
    public let reached: Bool
}

public struct UnavailableGoal: Codable, Equatable, Sendable {
    public let status: String
    public let reason: String
    public let targetGodl: String
}

public enum Deployment: Codable, Equatable, Sendable {
    case observed(ObservedDeployment)
    case unavailable(UnavailableValue)

    public init(from decoder: Decoder) throws {
        let status = try decoder.container(keyedBy: StatusKey.self).decode(String.self, forKey: .status)
        switch status {
        case "observed": self = .observed(try ObservedDeployment(from: decoder))
        case "unavailable": self = .unavailable(try UnavailableValue(from: decoder))
        default:
            throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unsupported deployment status: \(status)"))
        }
    }

    public func encode(to encoder: Encoder) throws {
        switch self {
        case .observed(let value): try value.encode(to: encoder)
        case .unavailable(let value): try value.encode(to: encoder)
        }
    }

    private enum StatusKey: String, CodingKey { case status }
}

public struct ObservedDeployment: Codable, Equatable, Sendable {
    public let status: String
    public let lastPlayedRound: String
    public let currentRound: String
    public let currentRoundDeployed: Bool
    public let lastPlayedDeploymentSol: SOLAmount
    public let precedingRoundNeedsCheckpoint: Bool
    public let pendingGodl: UnavailableValue
}

public struct Automation: Codable, Equatable, Sendable {
    public let kind: String
    public let state: String
    public let balanceSol: SOLAmount?
    public let amountPerSquareSol: SOLAmount?
    public let executorFeeSol: SOLAmount?
}

public struct Performance: Codable, Equatable, Sendable {
    public let netCostPerGodlUsd: UnavailableValue
    public let netSpendUsd: UnavailableValue
    public let earnedTodayGodl: UnavailableValue
    public let estimatedCompletionDate: UnavailableValue
}

public struct History: Codable, Equatable, Sendable {
    public let coverage: String
    public let firstObservedAt: String
    public let count: Int
    public let series: [HistoryPoint]
    public let note: String
}

public struct HistoryPoint: Codable, Equatable, Sendable {
    public let observedAt: String
    public let slot: String
    public let unrefinedGodl: TokenAmount?
}
