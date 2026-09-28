import Foundation
import XCTest
@testable import GODLCore

final class RewardTrackerTests: XCTestCase {
    private let now = Date(timeIntervalSince1970: 2_000_000_000)

    private func sample(
        identity: String = "wallet\u{1F}mainnet\u{1F}program\u{1F}source",
        slot: UInt64,
        age: TimeInterval = 0,
        unrefined: UInt64? = 100,
        claim: String? = "claim-a",
        gold: UInt64? = 1_000
    ) -> RewardSample {
        RewardSample(identity: identity, slot: slot, observedAt: now.addingTimeInterval(-age),
            unrefinedUnits: unrefined, lastClaimGodlAt: claim, cumulativeGoldUnits: gold)
    }

    func testFirstSampleSeedsAndPositiveDeltasUseExactUnsignedSubtraction() {
        var tracker = RewardTracker()
        XCTAssertNil(tracker.consume(sample(slot: 10), now: now))
        XCTAssertEqual(tracker.consume(sample(slot: 11, unrefined: 109, gold: 1_007), now: now),
            RewardChange(identity: sample(slot: 11).identity, slot: 11, unrefinedUnits: 9, goldUnits: 7))
    }

    func testClaimTransitionRebaselinesUnrefinedButDoesNotHideCumulativeGold() {
        var tracker = RewardTracker()
        XCTAssertNil(tracker.consume(sample(slot: 10), now: now))
        XCTAssertEqual(tracker.consume(sample(slot: 11, unrefined: 5, claim: "claim-b", gold: 1_025), now: now),
            RewardChange(identity: sample(slot: 11).identity, slot: 11, unrefinedUnits: nil, goldUnits: 25))
        XCTAssertEqual(tracker.consume(sample(slot: 12, unrefined: 8, claim: "claim-b", gold: 1_025), now: now)?.unrefinedUnits, 3)
    }

    func testMissingAndRegressedValuesRebaselineSilently() {
        var tracker = RewardTracker()
        XCTAssertNil(tracker.consume(sample(slot: 1), now: now))
        XCTAssertNil(tracker.consume(sample(slot: 2, unrefined: nil, gold: nil), now: now))
        XCTAssertNil(tracker.consume(sample(slot: 3, unrefined: 50, gold: 900), now: now))
        XCTAssertEqual(tracker.consume(sample(slot: 4, unrefined: 55, gold: 905), now: now),
            RewardChange(identity: sample(slot: 4).identity, slot: 4, unrefinedUnits: 5, goldUnits: 5))
    }

    func testStaleRepeatedOutOfOrderAndIdentityChangesNeverReplayRewards() throws {
        var tracker = RewardTracker()
        XCTAssertNil(tracker.consume(sample(slot: 10), now: now))
        XCTAssertNil(tracker.consume(sample(slot: 11, age: 61, unrefined: 500, gold: 1_500), now: now))
        XCTAssertNil(tracker.consume(sample(slot: 10, unrefined: 500, gold: 1_500), now: now))
        XCTAssertNil(tracker.consume(sample(identity: "another", slot: 12, unrefined: 500, gold: 1_500), now: now))
        XCTAssertNil(tracker.consume(sample(identity: "another", slot: 12, unrefined: 900, gold: 1_900), now: now))

        let restored = try JSONDecoder().decode(RewardTracker.self, from: JSONEncoder().encode(tracker))
        var resumed = restored
        XCTAssertNil(resumed.consume(sample(identity: "another", slot: 12, unrefined: 900, gold: 1_900), now: now))
        XCTAssertEqual(resumed.consume(sample(identity: "another", slot: 13, unrefined: 901, gold: 1_901), now: now)?.slot, 13)
    }

    func testDecimalFormattingPreservesAllDenominationDigits() {
        XCTAssertEqual(RewardTracker.format(units: 1, decimals: 11), "0.00000000001")
        XCTAssertEqual(RewardTracker.format(units: 17_142_953_091_313, decimals: 11), "171.42953091313")
        XCTAssertEqual(RewardTracker.format(units: 1, decimals: 6), "0.000001")
    }

    func testFreshPostWakeObservationCoalescesUnseenRewardsOnce() throws {
        var tracker = RewardTracker()
        XCTAssertNil(tracker.consume(sample(slot: 10), now: now))
        var resumed = try JSONDecoder().decode(RewardTracker.self, from: JSONEncoder().encode(tracker))
        let wake = now.addingTimeInterval(3_600)
        // A stale cached balance cannot notify. A fresh RPC observation after
        // wake catches up unseen rewards rather than silently discarding them.
        XCTAssertNil(resumed.consume(sample(slot: 11, unrefined: 120, gold: 1_004), now: wake))
        let fresh = RewardSample(identity: sample(slot: 10).identity, slot: 20, observedAt: wake,
            unrefinedUnits: 150, lastClaimGodlAt: "claim-a", cumulativeGoldUnits: 1_010)
        XCTAssertEqual(resumed.consume(fresh, now: wake),
            RewardChange(identity: fresh.identity, slot: 20, unrefinedUnits: 50, goldUnits: 10))
        XCTAssertNil(resumed.consume(fresh, now: wake))
    }
}
