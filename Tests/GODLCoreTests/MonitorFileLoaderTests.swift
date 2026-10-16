import Foundation
import XCTest
@testable import GODLCore

final class MonitorFileLoaderTests: XCTestCase {
    private let observedAt = Date(timeIntervalSince1970: 2_000_000_000)

    func testLoadsCompleteVersionOneDocumentAndKeepsReadOnlyProvenance() throws {
        let monitor = try load(fixture())

        XCTAssertEqual(monitor.schemaVersion, 1)
        XCTAssertEqual(monitor.wallet, "fixture-wallet")
        XCTAssertEqual(monitor.provenance.slot, "900719925474099312345")
        XCTAssertEqual(monitor.provenance.programAddress, "fixture-program")
        XCTAssertTrue(monitor.capabilities.canObserve)
        XCTAssertFalse(monitor.capabilities.canPause)
        XCTAssertFalse(monitor.capabilities.canExecute)
        XCTAssertEqual(monitor.automations.map(\.state), ["account-missing", "configured-execution-unverified"])
        XCTAssertEqual(monitor.history.count, 2)
        XCTAssertNil(monitor.acquisitionPeriod)

        guard case .observed(let goal) = monitor.goal,
              case .observed(let deployment) = monitor.deployment else {
            return XCTFail("Expected observed goal and deployment")
        }
        XCTAssertEqual(goal.progressPercent, "12.3456")
        XCTAssertTrue(deployment.precedingRoundNeedsCheckpoint)
    }

    func testDailyMiningRecoveryKeepsExactUnitsAndEnforcesItsSeparateCoverage() throws {
        var document = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(fixture().utf8)) as? [String: Any])
        var provenance = try XCTUnwrap(document["provenance"] as? [String: Any])
        provenance["programAddress"] = "mineWsRs2Rmw2jPMkVbgAbDjV1E23yQ8TEodaX3iza4"
        provenance["sourceCommit"] = "8cbbc86341445d11e3779dfd5be9363474d75683"
        provenance["slot"] = "500000001"
        document["provenance"] = provenance
        let mining: [String: Any] = ["schemaVersion": 1, "wallet": "fixture-wallet",
            "genesisHash": MonitorFileLoader.mainnetGenesisHash,
            "programAddress": provenance["programAddress"]!, "sourceCommit": provenance["sourceCommit"]!,
            "deployedAtSlot": "457407037", "day": "2033-05-18", "timeZone": "UTC",
            "fromAt": "2033-05-18T00:00:00.000Z", "throughAt": "2033-05-18T03:30:00.000Z",
            "throughSlot": "500000000", "unrefinedBaseUnits": "1234567890123",
            "transactionCount": 12, "checkpointCount": 10]
        func loadMining(_ value: [String: Any]) throws -> MonitorView {
            var next = document
            next["dailyMining"] = value
            return try load(String(decoding: JSONSerialization.data(withJSONObject: next), as: UTF8.self))
        }
        let result = try XCTUnwrap(loadMining(mining).dailyMining)
        XCTAssertEqual(result.unrefinedUnits, 1_234_567_890_123)
        XCTAssertTrue(result.isToday(at: observedAt))
        XCTAssertFalse(result.isToday(at: observedAt.addingTimeInterval(86_400)))
        for (key, value) in [("wallet", "other-wallet"), ("sourceCommit", "unsupported"),
                             ("deployedAtSlot", "457407038"), ("throughSlot", "500000002"),
                             ("day", "2033-05-17"), ("timeZone", "Unknown/Zone"),
                             ("fromAt", "2033-05-18T00:00:01.000Z"),
                             ("throughAt", "2033-05-18T03:34:00.000Z"),
                             ("unrefinedBaseUnits", "0123"), ("unrefinedBaseUnits", "18446744073709551616")] {
            var invalid = mining
            invalid[key] = value
            XCTAssertThrowsError(try loadMining(invalid), key)
        }
        var invalid = mining
        invalid["checkpointCount"] = 0
        XCTAssertThrowsError(try loadMining(invalid))
    }

    func testLoadsEstimatedAcquisitionPeriodWithoutChangingLegacyPerformance() throws {
        let monitor = try load(fixture(acquisitionPeriod: acquisitionPeriodFixture()))
        let period = try XCTUnwrap(monitor.acquisitionPeriod)

        XCTAssertEqual(period.status, "estimated")
        XCTAssertEqual(period.startedAt, "2033-05-18T03:32:00.000Z")
        XCTAssertEqual(period.earnedGodl, "25.50000000000")
        XCTAssertEqual(period.netCostPerGodlUsd, "0.0412")
        XCTAssertTrue(monitor.performance.netCostPerGodlUsd.isUnavailable)
    }

    func testDailyYieldValidatesExactIndependentAmountsAgainstCurrentBalances() throws {
        var document = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(fixture().utf8)) as? [String: Any])
        var provenance = try XCTUnwrap(document["provenance"] as? [String: Any])
        provenance["programAddress"] = "mineWsRs2Rmw2jPMkVbgAbDjV1E23yQ8TEodaX3iza4"
        provenance["sourceCommit"] = "8cbbc86341445d11e3779dfd5be9363474d75683"
        provenance["slot"] = "500000001"
        document["provenance"] = provenance
        var balances = try XCTUnwrap(document["balances"] as? [String: Any])
        balances["refinedGodl"] = ["baseUnits": "9007199254741003", "decimals": 11, "display": "90071.99254741003"]
        document["balances"] = balances
        document["rewardObservation"] = ["lastClaimGodlAt": "0", "cumulativeGoldBaseUnits": "9007199254741004"]
        let yield: [String: Any] = ["schemaVersion": 1, "wallet": "fixture-wallet",
            "genesisHash": MonitorFileLoader.mainnetGenesisHash,
            "programAddress": provenance["programAddress"]!, "sourceCommit": provenance["sourceCommit"]!,
            "deployedAtSlot": "457407037", "proofHash": String(repeating: "a", count: 64),
            "day": "2033-05-18", "timeZone": "UTC", "fromAt": "2033-05-18T00:00:00.000Z",
            "throughAt": "2033-05-18T03:33:20.000Z", "throughSlot": "500000001",
            "refined": ["baseUnits": "10", "openingBaseUnits": "9007199254740993", "closingBaseUnits": "9007199254741003", "lastClaimGodlAt": "0"],
            "gold": ["baseUnits": "11", "openingBaseUnits": "9007199254740993", "closingBaseUnits": "9007199254741004"]]
        func loadYield(_ value: [String: Any]) throws -> MonitorView {
            var next = document
            next["dailyYield"] = value
            return try load(String(decoding: JSONSerialization.data(withJSONObject: next), as: UTF8.self))
        }
        let valid = try XCTUnwrap(loadYield(yield).dailyYield)
        XCTAssertEqual(valid.refined?.units, 10)
        XCTAssertEqual(valid.gold?.units, 11)
        XCTAssertTrue(valid.isToday(at: observedAt))
        XCTAssertFalse(valid.isToday(at: observedAt.addingTimeInterval(86_400)))
        var goldOnly = yield; goldOnly.removeValue(forKey: "refined")
        XCTAssertNoThrow(try loadYield(goldOnly))
        for (key, value) in [("wallet", "other-wallet"), ("sourceCommit", "unsupported"),
                             ("deployedAtSlot", "457407038"), ("throughSlot", "500000000"),
                             ("day", "2033-05-17"), ("timeZone", "Unknown/Zone"),
                             ("fromAt", "2033-05-18T00:00:01.000Z"),
                             ("throughAt", "2033-05-18T03:33:19.000Z"), ("proofHash", "unverified")] {
            var invalid = yield; invalid[key] = value
            XCTAssertThrowsError(try loadYield(invalid), key)
        }
        for (field, key, value) in [("refined", "baseUnits", "11"), ("gold", "baseUnits", "011"),
                                    ("refined", "closingBaseUnits", "9007199254741004"),
                                    ("gold", "closingBaseUnits", "9007199254741005"),
                                    ("refined", "lastClaimGodlAt", "2000000000"),
                                    ("gold", "openingBaseUnits", "18446744073709551616")] {
            var invalid = yield
            var amount = try XCTUnwrap(invalid[field] as? [String: Any]); amount[key] = value
            invalid[field] = amount
            XCTAssertThrowsError(try loadYield(invalid), "\(field).\(key)")
        }
        var missing = yield; missing.removeValue(forKey: "refined"); missing.removeValue(forKey: "gold")
        XCTAssertThrowsError(try loadYield(missing))
    }

    func testAcquisitionPeriodAllowsNegativeNetSpendAndCost() throws {
        let period = acquisitionPeriodFixture()
            .replacingOccurrences(of: #""netSpendSol":"0.750000000""#, with: #""netSpendSol":"-0.750000000""#)
            .replacingOccurrences(of: #""netCostPerGodlSol":"0.0294117647""#, with: #""netCostPerGodlSol":"-0.0294117647""#)
            .replacingOccurrences(of: #""netSpendUsd":"1.0506""#, with: #""netSpendUsd":"-1.0506""#)
            .replacingOccurrences(of: #""netCostPerGodlUsd":"0.0412""#, with: #""netCostPerGodlUsd":"-0.0412""#)

        XCTAssertNoThrow(try load(fixture(acquisitionPeriod: period)))
    }

    func testRejectsInvalidAcquisitionPeriodStatusDatesAndAmounts() throws {
        XCTAssertThrowsError(try load(fixture(acquisitionPeriod: acquisitionPeriodFixture()
            .replacingOccurrences(of: #""status":"estimated""#, with: #""status":"observed""#)))) {
            XCTAssertEqual($0 as? MonitorLoadError, .unsupportedAcquisitionPeriodStatus("observed"))
        }
        XCTAssertThrowsError(try load(fixture(acquisitionPeriod: acquisitionPeriodFixture()
            .replacingOccurrences(of: "2033-05-18T03:32:00.000Z", with: "2033-05-18T03:34:00.000Z")))) {
            XCTAssertEqual($0 as? MonitorLoadError, .invalidAcquisitionPeriodDates)
        }
        XCTAssertThrowsError(try load(fixture(acquisitionPeriod: acquisitionPeriodFixture()
            .replacingOccurrences(of: #""earnedGodl":"25.50000000000""#, with: #""earnedGodl":"0""#)))) {
            XCTAssertEqual($0 as? MonitorLoadError, .invalidAcquisitionPeriodAmount(field: "earnedGodl", value: "0"))
        }
        XCTAssertThrowsError(try load(fixture(acquisitionPeriod: acquisitionPeriodFixture()
            .replacingOccurrences(of: #""ownerNetworkFeesSol":"0.000015000""#, with: #""ownerNetworkFeesSol":"-0.000015000""#)))) {
            XCTAssertEqual($0 as? MonitorLoadError, .invalidAcquisitionPeriodAmount(field: "ownerNetworkFeesSol", value: "-0.000015000"))
        }
        XCTAssertThrowsError(try load(fixture(acquisitionPeriod: acquisitionPeriodFixture()
            .replacingOccurrences(of: #""openingGodl":"0""#, with: #""openingGodl":"1e3""#)))) {
            XCTAssertEqual($0 as? MonitorLoadError, .invalidAcquisitionPeriodAmount(field: "openingGodl", value: "1e3"))
        }
    }

    func testRejectsFutureAcquisitionPeriodAndNonMillisecondUTCDate() throws {
        XCTAssertThrowsError(try load(fixture(acquisitionPeriod: acquisitionPeriodFixture()
            .replacingOccurrences(of: "2033-05-18T03:33:00.000Z", with: "2034-05-18T03:33:00.000Z")))) {
            guard case .futureAcquisitionPeriod = $0 as? MonitorLoadError else { return XCTFail("Expected futureAcquisitionPeriod") }
        }
        XCTAssertThrowsError(try load(fixture(acquisitionPeriod: acquisitionPeriodFixture()
            .replacingOccurrences(of: ".000Z", with: "Z")))) {
            XCTAssertEqual($0 as? MonitorLoadError, .invalidAcquisitionPeriodDates)
        }
    }

    func testAccountingStatusIsOptionalAndValidatesItsObservationBoundary() throws {
        XCTAssertNil(try load(fixture()).accounting)
        let timestamp = ISO8601DateFormatter.string(from: observedAt, timeZone: .gmt, formatOptions: [.withInternetDateTime, .withFractionalSeconds])
        let status = "{\"state\":\"current\",\"checkedAt\":\"\(timestamp)\",\"verifiedAt\":\"\(timestamp)\",\"verifiedThroughSlot\":\"100\",\"reason\":\"Closed history reconciled\"}"
        func document(_ status: String, period: Bool = true) -> String {
            fixture(acquisitionPeriod: period ? acquisitionPeriodFixture() : nil)
                .replacingOccurrences(of: "900719925474099312345", with: "100")
                .replacingOccurrences(of: "\"performance\":", with: "\"accounting\":\(status),\"performance\":")
        }
        XCTAssertEqual(try load(document(status)).accounting?.verifiedThroughSlot, "100")
        for invalid in [
            status.replacingOccurrences(of: "current", with: "invented"),
            status.replacingOccurrences(of: "\"100\"", with: "\"101\""),
            status.replacingOccurrences(of: "Closed history reconciled", with: ""),
            status.replacingOccurrences(of: timestamp, with: "2034-01-01T00:00:00.000Z")
        ] {
            XCTAssertThrowsError(try load(document(invalid))) {
                XCTAssertEqual($0 as? MonitorLoadError, .invalidAccountingStatus)
            }
        }
        XCTAssertThrowsError(try load(document(status, period: false)))
    }

    func testUnknownCostsRemainExplicitlyUnavailable() throws {
        let performance = try load(fixture()).performance
        XCTAssertTrue(performance.netCostPerGodlUsd.isUnavailable)
        XCTAssertEqual(performance.netCostPerGodlUsd.reason, "history-not-reconciled")
        XCTAssertTrue(performance.netSpendUsd.isUnavailable)
    }

    func testMissingMinerNeverBecomesZeroAndGoalIsUnavailable() throws {
        var json = fixture()
        replaceFirst(in: &json, #""unrefinedGodl":{"baseUnits":"123456789012345678901","decimals":11,"display":"1234567890.12345678901"}"#, with: #""unrefinedGodl":{"status":"unavailable","reason":"miner-account-not-found"}"#)
        replaceFirst(in: &json, #""storedRefinedGodl":{"baseUnits":"777777777777777777777","decimals":11,"display":"7777777777.77777777777"}"#, with: #""storedRefinedGodl":{"status":"unavailable","reason":"miner-account-not-found"}"#)
        json = json.replacingOccurrences(of: #""goal":{"status":"observed","targetGodl":"10000.00000000000","remainingGodl":"8765.43210987655","progressPercent":"12.3456","reached":false}"#, with: #""goal":{"status":"unavailable","reason":"miner-account-not-found","targetGodl":"10000"}"#)

        let monitor = try load(json)
        guard case .unavailable(let unrefined) = monitor.balances.unrefinedGodl,
              case .unavailable(let goal) = monitor.goal else {
            return XCTFail("Missing miner values must remain unavailable")
        }
        XCTAssertEqual(unrefined.reason, "miner-account-not-found")
        XCTAssertEqual(goal.targetGodl, "10000")
    }

    func testFreshnessUsesCurrentClockInsteadOfSerializedCurrentStatusAndAge() throws {
        let monitor = try load(fixture(), now: observedAt.addingTimeInterval(1))
        XCTAssertEqual(monitor.observation.status, "current")
        XCTAssertEqual(monitor.observation.ageMs, 1)

        let freshness = monitor.freshness(at: observedAt.addingTimeInterval(61))
        XCTAssertTrue(freshness.isStale)
        XCTAssertEqual(freshness.age, 61, accuracy: 0.001)
    }

    func testRejectsUnsupportedSchemaNonMainnetAndFutureObservation() throws {
        XCTAssertThrowsError(try load(fixture().replacingOccurrences(of: #""schemaVersion":1"#, with: #""schemaVersion":2"#))) {
            XCTAssertEqual($0 as? MonitorLoadError, .unsupportedSchema(2))
        }
        XCTAssertThrowsError(try load(fixture().replacingOccurrences(of: #""network":"solana-mainnet-beta""#, with: #""network":"solana-devnet""#))) {
            guard case .nonMainnet = $0 as? MonitorLoadError else { return XCTFail("Expected nonMainnet") }
        }
        XCTAssertThrowsError(try load(fixture(), now: observedAt.addingTimeInterval(-5.001))) {
            guard case .futureObservation = $0 as? MonitorLoadError else { return XCTFail("Expected futureObservation") }
        }
    }

    func testRetainsTokenPrecisionAndKeepsRefinedSeparateFromUnrefined() throws {
        let balances = try load(fixture()).balances
        guard case .observed(let unrefined) = balances.unrefinedGodl,
              case .observed(let refined) = balances.storedRefinedGodl else {
            return XCTFail("Expected observed token balances")
        }
        XCTAssertEqual(unrefined.baseUnits, "123456789012345678901")
        XCTAssertEqual(unrefined.display, "1234567890.12345678901")
        XCTAssertEqual(refined.baseUnits, "777777777777777777777")
        XCTAssertNotEqual(unrefined, refined)
    }

    func testNewRewardBalancesDecodeExactlyAndRejectInconsistentUnits() throws {
        let fields = "\"refinedGodl\":{\"baseUnits\":\"375233470793\",\"decimals\":11,\"display\":\"3.75233470793\"},\"claimableGold\":{\"baseUnits\":\"718\",\"decimals\":6,\"display\":\"0.000718\"},"
        let document = fixture().replacingOccurrences(of: "\"storedRefinedGodl\":", with: fields + "\"storedRefinedGodl\":")
        guard case .observed(let gold) = try load(document).balances.claimableGold else { return XCTFail("Missing gold") }
        XCTAssertEqual(gold.baseUnits, "718")
        XCTAssertThrowsError(try load(document.replacingOccurrences(of: "0.000718", with: "0.718000"))) {
            XCTAssertEqual($0 as? MonitorLoadError, .invalidRewardAmount)
        }
        XCTAssertNil(try load(fixture()).balances.claimableGold)
    }

    func testRejectsMalformedCurrentGODLBalancesBeforeTheyReachTheDashboard() throws {
        let invalidAmounts: [[String: Any]] = [
            ["baseUnits": "1200000000000", "decimals": 11, "display": "999.00000000000"],
            ["baseUnits": "1", "decimals": 11, "display": "-0.00000000001"],
            ["baseUnits": "1", "decimals": 11, "display": "NaN"],
            ["baseUnits": "1", "decimals": 11, "display": "Infinity"],
            ["baseUnits": "1", "decimals": 11, "display": "1e-11"],
            ["baseUnits": "1", "decimals": 11, "display": "0,00000000001"],
            ["baseUnits": "1", "decimals": 11, "display": "0.000000000010"],
            ["baseUnits": "1", "decimals": 6, "display": "0.000001"],
            ["baseUnits": "01", "decimals": 11, "display": "0.00000000001"],
            ["baseUnits": "+1", "decimals": 11, "display": "0.00000000001"],
            ["baseUnits": "-1", "decimals": 11, "display": "-0.00000000001"],
            ["baseUnits": "1 ", "decimals": 11, "display": "0.00000000001"],
        ]
        for field in ["unrefinedGodl", "storedRefinedGodl"] {
            for amount in invalidAmounts {
                var document = try fixtureObject()
                var balances = try XCTUnwrap(document["balances"] as? [String: Any])
                balances[field] = amount
                document["balances"] = balances
                XCTAssertThrowsError(try load(object: document), "Invalid \(field): \(amount)") {
                    XCTAssertEqual($0 as? MonitorLoadError, .invalidBalanceAmount)
                }
            }
        }
    }

    private func fixtureObject() throws -> [String: Any] {
        try XCTUnwrap(JSONSerialization.jsonObject(with: Data(fixture().utf8)) as? [String: Any])
    }

    private func load(object: [String: Any]) throws -> MonitorView {
        try load(String(decoding: JSONSerialization.data(withJSONObject: object), as: UTF8.self))
    }

    func testRejectsMalformedSOLAcrossBalancesDeploymentAndBothAutomationKinds() throws {
        let invalidAmounts: [[String: String]] = [
            ["lamports": "1000000000", "display": "999.000000000"],
            ["lamports": "1", "display": "-0.000000001"],
            ["lamports": "1", "display": "NaN"],
            ["lamports": "1", "display": "Infinity"],
            ["lamports": "1", "display": "1e-9"],
            ["lamports": "1", "display": "0,000000001"],
            ["lamports": "1", "display": "0.0000000010"],
            ["lamports": "01", "display": "0.000000001"],
            ["lamports": "+1", "display": "0.000000001"],
            ["lamports": "-1", "display": "-0.000000001"],
            ["lamports": "1 ", "display": "0.000000001"],
        ]
        for amount in invalidAmounts {
            for document in try documents(withSOL: amount) {
                XCTAssertThrowsError(try load(object: document), "Invalid SOL: \(amount)") {
                    XCTAssertEqual($0 as? MonitorLoadError, .invalidSOLAmount)
                }
            }
        }
    }

    private func documents(withSOL amount: [String: String]) throws -> [[String: Any]] {
        let original = try fixtureObject()
        var balanceDocument = original
        var balances = try XCTUnwrap(original["balances"] as? [String: Any])
        balances["storedClaimableSol"] = amount
        balanceDocument["balances"] = balances
        var deploymentDocument = original
        var deployment = try XCTUnwrap(original["deployment"] as? [String: Any])
        deployment["lastPlayedDeploymentSol"] = amount
        deploymentDocument["deployment"] = deployment
        var documents = [balanceDocument, deploymentDocument]
        let automations = try XCTUnwrap(original["automations"] as? [[String: Any]])
        for index in automations.indices {
            for field in ["balanceSol", "amountPerSquareSol", "executorFeeSol"] {
                var document = original, modified = automations
                modified[index][field] = amount
                document["automations"] = modified
                documents.append(document)
            }
        }
        return documents
    }

    func testCanonicalBalancesPreserveZeroSmallestUnitsAndLargeLegacyIntegers() throws {
        // These literal pairs are independent denomination examples, including UInt64 + 1.
        let examples = [
            ("0", "0.00000000000", "0.000000000"),
            ("1", "0.00000000001", "0.000000001"),
            ("18446744073709551615", "184467440.73709551615", "18446744073.709551615"),
            ("18446744073709551616", "184467440.73709551616", "18446744073.709551616"),
            ("123456789012345678901", "1234567890.12345678901", "123456789012.345678901"),
        ]
        for (units, godlDisplay, solDisplay) in examples {
            var document = try fixtureObject()
            var balances = try XCTUnwrap(document["balances"] as? [String: Any])
            for field in ["unrefinedGodl", "storedRefinedGodl"] {
                balances[field] = ["baseUnits": units, "decimals": 11, "display": godlDisplay]
            }
            document["balances"] = balances
            let accepted = try load(object: document)
            guard case .observed(let amount) = accepted.balances.unrefinedGodl else {
                return XCTFail("Observed zero and large balances must remain observed")
            }
            XCTAssertEqual(amount.baseUnits, units)
            XCTAssertEqual(amount.display, godlDisplay)
            for solDocument in try documents(withSOL: ["lamports": units, "display": solDisplay]) {
                XCTAssertNoThrow(try load(object: solDocument))
            }
        }
    }

    func testUnavailableBalancesAndMissingAutomationSOLRemainUnknown() throws {
        var document = try fixtureObject()
        var balances = try XCTUnwrap(document["balances"] as? [String: Any])
        let unavailable = ["status": "unavailable", "reason": "account-not-found"]
        for field in ["unrefinedGodl", "storedRefinedGodl", "storedClaimableSol"] { balances[field] = unavailable }
        document["balances"] = balances
        document["deployment"] = unavailable
        document["automations"] = [["kind": "automation", "state": "account-missing"],
                                   ["kind": "automationV2", "state": "account-missing"]]
        let accepted = try load(object: document)
        guard case .unavailable = accepted.balances.unrefinedGodl,
              case .unavailable = accepted.balances.storedRefinedGodl,
              case .unavailable = accepted.balances.storedClaimableSol,
              case .unavailable = accepted.deployment else { return XCTFail("Unknown amounts must not become zero") }
        XCTAssertTrue(accepted.automations.allSatisfy { $0.balanceSol == nil && $0.amountPerSquareSol == nil && $0.executorFeeSol == nil })
    }

    func testRejectedBalanceFileIsPreservedAndFreshValidFileCanRecover() throws {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".json")
        defer { try? FileManager.default.removeItem(at: url) }
        let malformed = try XCTUnwrap(documents(withSOL: ["lamports": "1", "display": "999.000000000"]).first)
        let data = try JSONSerialization.data(withJSONObject: malformed)
        try data.write(to: url)
        XCTAssertThrowsError(try MonitorFileLoader().load(from: url, now: observedAt)) {
            XCTAssertEqual($0 as? MonitorLoadError, .invalidSOLAmount)
        }
        XCTAssertEqual(try Data(contentsOf: url), data)
        try Data(fixture().utf8).write(to: url, options: .atomic)
        XCTAssertNoThrow(try MonitorFileLoader().load(from: url, now: observedAt))
    }

    func testRejectsMalformedHistoryBeforeItCanReachCharts() throws {
        let original = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(fixture().utf8)) as? [String: Any])
        let invalidAmounts: [[String: Any]] = [
            ["baseUnits": "1", "decimals": 11, "display": "-1"],
            ["baseUnits": "1", "decimals": 11, "display": "1e308"],
            ["baseUnits": "01", "decimals": 11, "display": "0.00000000001"],
            ["baseUnits": "1", "decimals": 6, "display": "0.000001"],
            ["baseUnits": "1", "decimals": 11, "display": "0.00000000002"],
        ]
        for amount in invalidAmounts {
            var document = original
            var history = try XCTUnwrap(document["history"] as? [String: Any])
            var series = try XCTUnwrap(history["series"] as? [[String: Any]])
            series[1]["unrefinedGodl"] = amount
            history["series"] = series
            document["history"] = history
            let data = try JSONSerialization.data(withJSONObject: document)
            XCTAssertThrowsError(try load(String(decoding: data, as: UTF8.self)))
        }
    }

    private func load(_ json: String, now: Date? = nil) throws -> MonitorView {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString)
            .appendingPathExtension("json")
        try Data(json.utf8).write(to: url)
        defer { try? FileManager.default.removeItem(at: url) }
        return try MonitorFileLoader().load(from: url, now: now ?? observedAt.addingTimeInterval(1))
    }

    private func replaceFirst(in value: inout String, _ target: String, with replacement: String) {
        guard let range = value.range(of: target) else {
            return XCTFail("Fixture fragment not found: \(target)")
        }
        value.replaceSubrange(range, with: replacement)
    }

    private func fixture(acquisitionPeriod: String? = nil) -> String {
        let timestamp = ISO8601DateFormatter.string(from: observedAt, timeZone: .gmt, formatOptions: [.withInternetDateTime, .withFractionalSeconds])
        let acquisitionField = acquisitionPeriod.map { ",\"acquisitionPeriod\":\($0)" } ?? ""
        return """
        {
          "schemaVersion":1,"mode":"read-only","wallet":"fixture-wallet","network":"solana-mainnet-beta",
          "provenance":{"programAddress":"fixture-program","sourceCommit":"fixture-commit","genesisHash":"5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d","commitment":"finalized","slot":"900719925474099312345","observedAt":"\(timestamp)"},
          "observation":{"status":"current","ageMs":1,"staleAfterMs":60000,"caveat":"Observation freshness only."},
          "capabilities":{"canObserve":true,"canPause":false,"canExecute":false,"reason":"Read only."},
          "balances":{"unrefinedGodl":{"baseUnits":"123456789012345678901","decimals":11,"display":"1234567890.12345678901"},"storedRefinedGodl":{"baseUnits":"777777777777777777777","decimals":11,"display":"7777777777.77777777777"},"storedClaimableSol":{"lamports":"12345678901234567890","display":"12345678901.234567890"},"notes":["Synthetic fixture."]},
          "goal":{"status":"observed","targetGodl":"10000.00000000000","remainingGodl":"8765.43210987655","progressPercent":"12.3456","reached":false},
          "deployment":{"status":"observed","lastPlayedRound":"51","currentRound":"52","currentRoundDeployed":false,"lastPlayedDeploymentSol":{"lamports":"25000000","display":"0.025000000"},"precedingRoundNeedsCheckpoint":true,"pendingGodl":{"status":"unavailable","reason":"not-calculated"}},
          "automations":[{"kind":"automation","state":"account-missing"},{"kind":"automationV2","state":"configured-execution-unverified","balanceSol":{"lamports":"100","display":"0.000000100"},"amountPerSquareSol":{"lamports":"10","display":"0.000000010"},"executorFeeSol":{"lamports":"1","display":"0.000000001"}}],
          "performance":{"netCostPerGodlUsd":{"status":"unavailable","reason":"history-not-reconciled"},"netSpendUsd":{"status":"unavailable","reason":"history-not-reconciled"},"earnedTodayGodl":{"status":"unavailable","reason":"balance-deltas-ambiguous"},"estimatedCompletionDate":{"status":"unavailable","reason":"insufficient-evidence"}}\(acquisitionField),
          "history":{"coverage":"observed-balances-only","firstObservedAt":"\(timestamp)","count":2,"series":[{"observedAt":"\(timestamp)","slot":"900719925474099312344","unrefinedGodl":null},{"observedAt":"\(timestamp)","slot":"900719925474099312345","unrefinedGodl":{"baseUnits":"123456789012345678901","decimals":11,"display":"1234567890.12345678901"}}],"note":"Not a cash-flow ledger."}
        }
        """
    }

    private func acquisitionPeriodFixture() -> String {
        """
        {"status":"estimated","startedAt":"2033-05-18T03:32:00.000Z","throughAt":"2033-05-18T03:33:00.000Z","openingGodl":"0","earnedGodl":"25.50000000000","netSpendSol":"0.750000000","netCostPerGodlSol":"0.0294117647","netSpendUsd":"1.0506","netCostPerGodlUsd":"0.0412","grossOutSol":"0.900000000","returnedSol":"0.150000000","ownerNetworkFeesSol":"0.000015000","newRentSol":"0.002039280","priceBasis":"Coinbase SOL-USD one-minute candle close matched to each wallet cash flow.","baselineBasis":"Opening principal reconstructed as zero after the preceding claim and activity gap.","caveats":["Estimated baseline.","Closed period; later mining is excluded."]}
        """
    }
}
