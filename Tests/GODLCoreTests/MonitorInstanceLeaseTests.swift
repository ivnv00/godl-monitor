import Darwin
import Foundation
import XCTest
@testable import GODLCore

final class MonitorInstanceLeaseTests: XCTestCase {
    private func directory() throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("godl-instance-test-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        return url
    }

    func testSecondOwnerIsRejected() throws {
        let root = try directory()
        let first = try MonitorInstanceLease(directory: root)
        try withExtendedLifetime(first) {
            XCTAssertThrowsError(try MonitorInstanceLease(directory: root)) { error in
                XCTAssertEqual(error as? MonitorInstanceLease.Failure, .alreadyRunning)
            }
        }
    }

    func testReleaseAllowsReopenWithoutDeletingOrTruncatingLockFile() throws {
        let root = try directory()
        var first: MonitorInstanceLease? = try MonitorInstanceLease(directory: root)
        let path = root.appendingPathComponent(MonitorInstanceLease.fileName)
        let inode = try FileManager.default.attributesOfItem(atPath: path.path)[.systemFileNumber] as? NSNumber
        XCTAssertNotNil(first)
        first = nil
        let second = try MonitorInstanceLease(directory: root)
        try withExtendedLifetime(second) {
            XCTAssertTrue(FileManager.default.fileExists(atPath: path.path))
            XCTAssertEqual(try FileManager.default.attributesOfItem(atPath: path.path)[.systemFileNumber] as? NSNumber, inode)
            XCTAssertEqual(try Data(contentsOf: path), Data())
        }
        let mode = try FileManager.default.attributesOfItem(atPath: path.path)[.posixPermissions] as? NSNumber
        XCTAssertEqual(mode?.intValue, 0o600)
    }

    func testDifferentDataRootsCanRunIndependently() throws {
        let first = try MonitorInstanceLease(directory: directory())
        let second = try MonitorInstanceLease(directory: directory())
        withExtendedLifetime((first, second)) {}
    }

    func testSymlinkAndNonFileLockAreRejectedWithoutChangingTargets() throws {
        let root = try directory(), target = root.appendingPathComponent("synthetic-target")
        try Data("preserve".utf8).write(to: target)
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: target.path)
        let lock = root.appendingPathComponent(MonitorInstanceLease.fileName)
        try FileManager.default.createSymbolicLink(at: lock, withDestinationURL: target)
        XCTAssertThrowsError(try MonitorInstanceLease(directory: root)) { error in
            XCTAssertEqual(error as? MonitorInstanceLease.Failure, .unavailable)
        }
        XCTAssertEqual(try String(contentsOf: target, encoding: .utf8), "preserve")
        try FileManager.default.removeItem(at: lock)
        try FileManager.default.linkItem(at: target, to: lock)
        XCTAssertThrowsError(try MonitorInstanceLease(directory: root))
        try FileManager.default.removeItem(at: lock)
        try FileManager.default.createDirectory(at: lock, withIntermediateDirectories: false)
        XCTAssertThrowsError(try MonitorInstanceLease(directory: root))
        XCTAssertThrowsError(try MonitorInstanceLease(directory: target))
    }

    func testChildRetainsOwnershipAfterParentReleasesAndUntilChildExits() throws {
        let root = try directory()
        var lease: MonitorInstanceLease? = try MonitorInstanceLease(directory: root)
        let child = Process()
        child.executableURL = URL(fileURLWithPath: "/bin/sleep")
        child.arguments = ["30"]
        try lease!.run(child)
        defer { if child.isRunning { child.terminate(); child.waitUntilExit() } }
        lease = nil
        XCTAssertThrowsError(try MonitorInstanceLease(directory: root)) { error in
            XCTAssertEqual(error as? MonitorInstanceLease.Failure, .alreadyRunning)
        }
        kill(child.processIdentifier, SIGKILL)
        child.waitUntilExit()
        let next = try MonitorInstanceLease(directory: root)
        withExtendedLifetime(next) {}
    }

    func testFailedChildLaunchDoesNotLeakOwnership() throws {
        let root = try directory()
        var lease: MonitorInstanceLease? = try MonitorInstanceLease(directory: root)
        let child = Process()
        child.executableURL = root.appendingPathComponent("missing-synthetic-executable")
        XCTAssertThrowsError(try lease!.run(child))
        lease = nil
        let next = try MonitorInstanceLease(directory: root)
        withExtendedLifetime(next) {}
    }
}
