import Foundation
import XCTest
@testable import GODLCore

final class HoldingsValidationTests: XCTestCase {
    private let now = Date(timeIntervalSince1970: 1_790_512_800)
    private let godlMint = "GodL6KZ9uuUoQwELggtVzQkKmU1LfqmDokPibPeDKkhF"
    private let goldMint = "AymATz4TCL9sWNEEV9Kvyz45CHVhDZ6kUgjTJPzLpU9P"

    func testRejectsPositiveHoldingsForObservedZeroBalances() throws {
        var document = try fixture()
        setBalance("unrefinedGodl", units: "0", display: "0.00000000000", in: &document)
        setBalance("refinedGodl", units: "0", display: "0.00000000000", in: &document)
        setBalance("claimableGold", units: "0", display: "0.000000", in: &document)
        setHoldings(["unrefinedUsd": "1", "refinedUsd": "2", "goldUsd": "999"], in: &document)
        assertRejected(document)
    }

    func testSuppliedGoldHoldingRequiresItsOwnQuote() throws {
        var document = try fixture()
        setQuotes([quote(asset: "GODL", price: "2")], in: &document)
        assertRejected(document)
    }

    func testValidAllAssetHoldingsReachClaimableGoal() throws {
        let value = try load(fixture())
        XCTAssertEqual(value.earnings?.holdings, HoldingValues(unrefinedUsd: "2.000000", refinedUsd: "4.000000", goldUsd: "1.500000"))
        let progress = try MonitorGoal(title: "Synthetic value", metric: .claimableUsd, target: "7").progress(in: value, now: now)
        XCTAssertEqual(progress.current, "7.5")
        XCTAssertTrue(progress.isReached)
    }

    func testEachHoldingRequiresObservedBalance() throws {
        for field in ["unrefinedGodl", "refinedGodl", "claimableGold"] {
            var document = try fixture()
            var balances = document["balances"] as! [String: Any]
            balances[field] = ["status": "unavailable", "reason": "Synthetic missing balance."]
            document["balances"] = balances
            assertRejected(document)
            if field != "unrefinedGodl" {
                balances.removeValue(forKey: field)
                document["balances"] = balances
                assertRejected(document)
            }
        }
    }

    func testGODLQuoteIsRequiredAndWrongMintsFailClosed() throws {
        var document = try fixture()
        setQuotes([quote(asset: "XAUt0", price: "3")], in: &document)
        assertRejected(document)
        for asset in ["GODL", "XAUt0"] {
            document = try fixture()
            var wrong = quote(asset: asset, price: asset == "GODL" ? "2" : "3")
            wrong["mint"] = "synthetic-wrong-mint"
            setQuotes([wrong], in: &document)
            assertRejected(document)
        }
    }

    func testEachHoldingRejectsMismatchedValue() throws {
        for field in ["unrefinedUsd", "refinedUsd", "goldUsd"] {
            var document = try fixture()
            var values = ["unrefinedUsd": "2.000000", "refinedUsd": "4.000000", "goldUsd": "1.500000"]
            values[field] = "999.000000"
            setHoldings(values, in: &document)
            assertRejected(document)
        }
    }

    func testZeroAndSmallestUnitsPreserveExactValues() throws {
        var zero = try fixture()
        for field in ["unrefinedGodl", "refinedGodl", "claimableGold"] {
            setBalance(field, units: "0", display: field == "claimableGold" ? "0.000000" : "0.00000000000", in: &zero)
        }
        setHoldings(["unrefinedUsd": "0", "refinedUsd": "0.000000000", "goldUsd": "-0.000000"], in: &zero)
        XCTAssertNoThrow(try load(zero))

        var smallest = try fixture()
        setBalance("unrefinedGodl", units: "1", display: "0.00000000001", in: &smallest)
        setBalance("refinedGodl", units: "1", display: "0.00000000001", in: &smallest)
        setBalance("claimableGold", units: "1", display: "0.000001", in: &smallest)
        setHoldings(["unrefinedUsd": "0.000000", "refinedUsd": "0.000000", "goldUsd": "0.000003"], in: &smallest)
        XCTAssertNoThrow(try load(smallest))
    }

    func testHalfUpRoundingCarriesAndRejectsOneMicrodollarMismatch() throws {
        // Independent denomination examples: one GODL base unit is 10^-11 GODL.
        for (price, expected, wrong) in [
            ("49999", "0.000000", "0.000001"),
            ("50000", "0.000001", "0.000000"),
            ("99999950000", "1.000000", "0.999999"),
        ] {
            var document = try fixture()
            setBalance("unrefinedGodl", units: "1", display: "0.00000000001", in: &document)
            setQuotes([quote(asset: "GODL", price: price)], in: &document)
            setHoldings(["unrefinedUsd": expected], in: &document)
            XCTAssertNoThrow(try load(document), price)
            setHoldings(["unrefinedUsd": wrong], in: &document)
            assertRejected(document)
        }
    }

    func testNumericEqualityAllowsTrailingZerosButRejectsExtraNonzeroPrecision() throws {
        var document = try fixture()
        setQuotes([quote(asset: "GODL", price: "2.0000000"), quote(asset: "XAUt0", price: "3.0")], in: &document)
        setHoldings(["unrefinedUsd": "2", "refinedUsd": "4.000000000", "goldUsd": "1.5000"], in: &document)
        XCTAssertNoThrow(try load(document))
        setHoldings(["unrefinedUsd": "2.000000000001"], in: &document)
        assertRejected(document)
    }

    func testUnrefinedQuantityAboveUInt64IsNotNarrowed() throws {
        var document = try fixture()
        setBalance("unrefinedGodl", units: "18446744073709551616", display: "184467440.73709551616", in: &document)
        setQuotes([quote(asset: "GODL", price: "1")], in: &document)
        setHoldings(["unrefinedUsd": "184467440.737096"], in: &document)
        XCTAssertNoThrow(try load(document))
        setHoldings(["unrefinedUsd": "184467440.737095"], in: &document)
        assertRejected(document)
    }

    func testLargeQuantityAndFractionalQuoteMatchEngineRatioOutput() throws {
        // Oracle: engine Ratio(123456789012345678901, 10^11) * Ratio(23456789, 10^7), decimal(6).
        var document = try fixture()
        setBalance("unrefinedGodl", units: "123456789012345678901", display: "1234567890.12345678901", in: &document)
        setQuotes([quote(asset: "GODL", price: "2.3456789")], in: &document)
        setHoldings(["unrefinedUsd": "2895899850.480111"], in: &document)
        XCTAssertNoThrow(try load(document))
        setHoldings(["unrefinedUsd": "2895899850.480110"], in: &document)
        assertRejected(document)
    }

    func testGoldSmallestUnitRoundsFractionalQuoteHalfUp() throws {
        var document = try fixture()
        setBalance("claimableGold", units: "1", display: "0.000001", in: &document)
        setQuotes([quote(asset: "XAUt0", price: "1.5")], in: &document)
        setHoldings(["goldUsd": "0.000002"], in: &document)
        XCTAssertNoThrow(try load(document))
        setHoldings(["goldUsd": "0.000001"], in: &document)
        assertRejected(document)
    }

    func testQuantityBeyondDecimalPrecisionCannotHideMicrodollarMismatch() throws {
        var document = try fixture()
        setBalance("unrefinedGodl", units: "12345678901234567890123456789012345678900000000000",
                   display: "123456789012345678901234567890123456789.00000000000", in: &document)
        setQuotes([quote(asset: "GODL", price: "1")], in: &document)
        setHoldings(["unrefinedUsd": "123456789012345678901234567890123456789.000000"], in: &document)
        XCTAssertNoThrow(try load(document))
        setHoldings(["unrefinedUsd": "123456789012345678901234567890123456789.000001"], in: &document)
        assertRejected(document)
    }

    func testQuoteBeyondDecimalPrecisionStillRoundsExactDigits() throws {
        var document = try fixture()
        setQuotes([quote(asset: "GODL", price: "123456789012345678901234567890123456789.1234565")], in: &document)
        setHoldings(["unrefinedUsd": "123456789012345678901234567890123456789.123457"], in: &document)
        XCTAssertNoThrow(try load(document))
        setHoldings(["unrefinedUsd": "123456789012345678901234567890123456789.123456"], in: &document)
        assertRejected(document)
    }

    func testMissingHoldingsStayUnknownAndPreventClaimableGoal() throws {
        let goal = try MonitorGoal(title: "Synthetic value", metric: .claimableUsd, target: "7")
        for missing in ["unrefinedUsd", "refinedUsd", "goldUsd"] {
            var document = try fixture()
            var values = ["unrefinedUsd": "2.000000", "refinedUsd": "4.000000", "goldUsd": "1.500000"]
            values.removeValue(forKey: missing)
            setHoldings(values, in: &document)
            let progress = goal.progress(in: try load(document), now: now)
            XCTAssertNil(progress.current)
            XCTAssertFalse(progress.isReached)
        }
        var document = try fixture()
        setQuotes([], in: &document)
        setHoldings([:], in: &document)
        let value = try load(document)
        XCTAssertEqual(value.earnings?.holdings, HoldingValues(unrefinedUsd: nil, refinedUsd: nil, goldUsd: nil))
        XCTAssertNil(goal.progress(in: value, now: now).current)
    }

    func testExpiredCorrectHoldingsLoadButGoalRemainsUnavailable() throws {
        let expired = now.addingTimeInterval(60)
        let value = try load(fixture(), at: expired)
        XCTAssertEqual(value.earnings?.holdings.goldUsd, "1.500000")
        let progress = try MonitorGoal(title: "Synthetic value", metric: .claimableUsd, target: "7").progress(in: value, now: expired)
        XCTAssertNil(progress.current)
        XCTAssertFalse(progress.isReached)
    }

    func testRejectionPreservesPublicationBytesAndLastAcceptedViewThenRecovers() throws {
        let loader = MonitorFileLoader()
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".json")
        defer { try? FileManager.default.removeItem(at: url) }
        let valid = try JSONSerialization.data(withJSONObject: fixture())
        try valid.write(to: url)
        let previous = try loader.load(from: url, now: now)
        var displayed = previous
        var document = try fixture()
        setHoldings(["unrefinedUsd": "999"], in: &document)
        let invalid = try JSONSerialization.data(withJSONObject: document)
        try invalid.write(to: url, options: .atomic)
        XCTAssertThrowsError(try { displayed = try loader.load(from: url, now: now) }()) {
            XCTAssertEqual($0 as? MonitorLoadError, .invalidEarnings)
        }
        XCTAssertEqual(displayed, previous)
        XCTAssertEqual(try Data(contentsOf: url), invalid)
        try valid.write(to: url, options: .atomic)
        displayed = try loader.load(from: url, now: now)
        XCTAssertEqual(displayed, previous)
        XCTAssertEqual(try Data(contentsOf: url), valid)
    }

    private func assertRejected(_ document: [String: Any], file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertThrowsError(try load(document), file: file, line: line) {
            XCTAssertEqual($0 as? MonitorLoadError, .invalidEarnings, file: file, line: line)
        }
    }

    private func load(_ document: [String: Any], at date: Date? = nil) throws -> MonitorView {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".json")
        defer { try? FileManager.default.removeItem(at: url) }
        try JSONSerialization.data(withJSONObject: document).write(to: url)
        return try MonitorFileLoader().load(from: url, now: date ?? now)
    }

    private func setBalance(_ field: String, units: String, display: String, in document: inout [String: Any]) {
        var balances = document["balances"] as! [String: Any]
        balances[field] = ["baseUnits": units, "decimals": field == "claimableGold" ? 6 : 11, "display": display]
        document["balances"] = balances
    }

    private func setHoldings(_ values: [String: String], in document: inout [String: Any]) {
        var earnings = document["earnings"] as! [String: Any]
        earnings["holdings"] = values
        document["earnings"] = earnings
    }

    private func setQuotes(_ quotes: [[String: String]], in document: inout [String: Any]) {
        var earnings = document["earnings"] as! [String: Any]
        var market = earnings["market"] as! [String: Any]
        market["quotes"] = quotes
        earnings["market"] = market
        document["earnings"] = earnings
    }

    private func quote(asset: String, price: String) -> [String: String] {
        ["asset": asset, "mint": asset == "GODL" ? godlMint : goldMint, "priceUsd": price,
         "pairAddress": "synthetic-pair", "dexId": "synthetic-dex", "liquidityUsd": "10000", "volume24hUsd": "100"]
    }

    private func fixture() throws -> [String: Any] {
        // All identities and amounts are synthetic; 1 GODL * $2, 2 GODL * $2, 0.5 XAUt0 * $3.
        let json = """
        {
          "schemaVersion":1,"mode":"read-only","wallet":"fixture-wallet","network":"solana-mainnet-beta",
          "provenance":{"programAddress":"fixture-program","sourceCommit":"fixture-commit","genesisHash":"5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d","commitment":"finalized","slot":"100","observedAt":"2026-09-27T12:40:00.000Z"},
          "observation":{"status":"current","ageMs":0,"staleAfterMs":60000,"caveat":"Synthetic."},
          "capabilities":{"canObserve":true,"canPause":false,"canExecute":false,"reason":"Read only."},
          "balances":{"unrefinedGodl":{"baseUnits":"100000000000","decimals":11,"display":"1.00000000000"},"storedRefinedGodl":{"baseUnits":"0","decimals":11,"display":"0.00000000000"},"storedClaimableSol":{"lamports":"0","display":"0.000000000"},"refinedGodl":{"baseUnits":"200000000000","decimals":11,"display":"2.00000000000"},"claimableGold":{"baseUnits":"500000","decimals":6,"display":"0.500000"},"notes":[]},
          "goal":{"status":"unavailable","reason":"Synthetic.","targetGodl":"10000"},
          "deployment":{"status":"unavailable","reason":"Synthetic."},"automations":[],
          "performance":{"netCostPerGodlUsd":{"status":"unavailable","reason":"Synthetic."},"netSpendUsd":{"status":"unavailable","reason":"Synthetic."},"earnedTodayGodl":{"status":"unavailable","reason":"Synthetic."},"estimatedCompletionDate":{"status":"unavailable","reason":"Synthetic."}},
          "history":{"coverage":"observed-balances-only","firstObservedAt":"2026-09-27T12:40:00.000Z","count":0,"series":[],"note":"Synthetic."},
          "earnings":{"schemaVersion":1,"timeZone":"Europe/Sofia","market":{"source":"DEX Screener","observedAt":"2026-09-27T12:39:00.000Z","expiresAt":"2026-09-27T12:41:00.000Z","quotes":[]},"holdings":{"unrefinedUsd":"2.000000","refinedUsd":"4.000000","goldUsd":"1.500000"},"days":[],"total":{"scope":"unrefined-only","reason":"No accounting."}}
        }
        """
        var document = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(json.utf8)) as? [String: Any])
        setQuotes([quote(asset: "GODL", price: "2"), quote(asset: "XAUt0", price: "3")], in: &document)
        return document
    }
}
