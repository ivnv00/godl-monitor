import Darwin
import Foundation

/// Exclusive ownership of one local data root. The file is never unlinked:
/// descriptors, including those inherited by owned helpers, hold the OS lock.
public final class MonitorInstanceLease {
    public enum Failure: Error, Equatable { case alreadyRunning, unavailable }
    public static let fileName = ".monitor-instance.lock"
    private let descriptor: Int32

    public init(directory: URL) throws {
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true,
                                                    attributes: [.posixPermissions: 0o700])
        } catch { throw Failure.unavailable }
        let path = directory.appendingPathComponent(Self.fileName).path
        let fd = open(path, O_RDWR | O_CREAT | O_CLOEXEC | O_NOFOLLOW | O_NONBLOCK, 0o600)
        guard fd >= 0 else { throw Failure.unavailable }
        var info = stat()
        guard fstat(fd, &info) == 0, info.st_mode & S_IFMT == S_IFREG,
              info.st_uid == geteuid(), info.st_nlink == 1, info.st_mode & 0o077 == 0 else {
            close(fd)
            throw Failure.unavailable
        }
        guard flock(fd, LOCK_EX | LOCK_NB) == 0 else {
            let failure: Failure = errno == EWOULDBLOCK ? .alreadyRunning : .unavailable
            close(fd)
            throw failure
        }
        descriptor = fd
    }

    deinit {
        // Do not LOCK_UN: a still-running helper may share this open file description.
        close(descriptor)
    }

    /// These helpers take arguments/environment, never stdin. Giving them a
    /// duplicate lease on stdin keeps data owned even if the app crashes first.
    public func run(_ process: Process) throws {
        let inherited = fcntl(descriptor, F_DUPFD_CLOEXEC, 3)
        guard inherited >= 0 else { throw Failure.unavailable }
        let handle = FileHandle(fileDescriptor: inherited, closeOnDealloc: true)
        defer { try? handle.close() }
        process.standardInput = handle
        try process.run()
    }
}
