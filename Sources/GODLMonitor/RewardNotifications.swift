import AppKit
import Combine
import CryptoKit
import Foundation
import GODLCore
import UserNotifications

enum RewardNotificationStatus: Equatable {
    case disabled
    case checkingPermission
    case ready
    case permissionNeeded
    case denied
    case error(String)

    var message: String {
        switch self {
        case .disabled: "Reward notifications are off."
        case .checkingPermission: "Checking notification permission…"
        case .ready: "Reward notifications are ready."
        case .permissionNeeded: "Notification permission is needed."
        case .denied: "Notifications are denied in System Settings."
        case .error(let detail): "Notifications need attention. \(detail)"
        }
    }
}

@MainActor
final class RewardNotifications: NSObject, ObservableObject, UNUserNotificationCenterDelegate {
    @Published private(set) var isEnabled: Bool
    @Published private(set) var status: RewardNotificationStatus
    @Published private(set) var isSendingTest = false
    @Published private(set) var testConfirmation: String?

    @Published private(set) var inbox = RewardInbox()
    @Published private(set) var inboxError: String?
    @Published private var identity: String?
    private let store: RewardInboxStore
    private var canSaveInbox = true

    var entries: [RewardInboxEntry] { identity.map { inbox.entries(for: $0) } ?? [] }
    var unreadCount: Int { entries.filter { !$0.isRead }.count }

    func setIdentity(_ identity: String) {
        if self.identity != identity { self.identity = identity }
    }

    func markAllRead() {
        guard canSaveInbox, let identity, unreadCount > 0 else { return }
        var candidate = inbox
        candidate.markAllRead(for: identity)
        _ = commit(candidate)
    }

    private func commit(_ candidate: RewardInbox) -> Bool {
        do {
            try store.save(candidate)
            inbox = candidate
            inboxError = nil
            return true
        } catch {
            inboxError = "History couldn’t be saved. Retrying on the next update."
            return false
        }
    }
    private let defaults: UserDefaults
    private let center: UNUserNotificationCenter
    private let enabledKey = "rewardNotifications.enabled"
    private let requestedKey = "rewardNotifications.authorizationRequested"

    init(
        dataDirectory: URL,
        defaults: UserDefaults = .standard,
        center: UNUserNotificationCenter = .current()
    ) {
        store = RewardInboxStore(directory: dataDirectory)
        self.defaults = defaults
        self.center = center
        let initiallyEnabled = defaults.object(forKey: enabledKey) as? Bool ?? true
        isEnabled = initiallyEnabled
        status = initiallyEnabled ? .checkingPermission : .disabled
        do {
            inbox = try store.load()
        } catch {
            canSaveInbox = false
            inboxError = "Saved history couldn’t be read. It has been preserved; tracking is paused."
        }
        super.init()
        center.delegate = self
        if isEnabled, case .error = status {} else if isEnabled { refreshStatus() }
    }

    func setEnabled(_ enabled: Bool) {
        guard enabled != isEnabled else { return }
        isEnabled = enabled
        testConfirmation = nil
        defaults.set(enabled, forKey: enabledKey)
        if enabled { refreshStatus() } else { status = .disabled }
    }

    func consume(_ sample: RewardSample, calendar: Calendar = .current) {
        guard canSaveInbox else { return }
        var candidate = inbox
        let change = candidate.consume(sample, calendar: calendar)
        guard candidate != inbox else { return }
        guard commit(candidate) else { return }
        // Refined accruals live in the inbox without adding a banner every poll.
        guard isEnabled else { return }
        let bannerChange = change.flatMap { value in
            value.unrefinedUnits != nil || value.goldUnits != nil ? value : nil
        }
        Task { await authorizeIfNeededAndSchedule(bannerChange) }
    }

    func requestAuthorization() {
        guard isEnabled else { return }
        Task { await requestPermissionAndUpdate(schedule: nil) }
    }

    func sendTest() {
        guard isEnabled else { status = .disabled; return }
        guard !isSendingTest else { return }
        isSendingTest = true
        testConfirmation = nil
        Task {
            defer { isSendingTest = false }
            let authorization = await authorizationStatus()
            switch authorization {
            case .authorized, .provisional, .ephemeral:
                await scheduleTest()
            case .notDetermined:
                await requestPermissionAndUpdate(schedule: .test)
            case .denied:
                status = .denied
            @unknown default:
                status = .permissionNeeded
            }
        }
    }

    func openSystemSettings() {
        guard let url = URL(string: "x-apple.systempreferences:com.apple.Notifications-Settings.extension") else { return }
        NSWorkspace.shared.open(url)
    }

    func refreshStatus() {
        guard isEnabled else { status = .disabled; return }
        status = .checkingPermission
        Task {
            let authorization = await authorizationStatus()
            status = Self.status(for: authorization)
        }
    }

    private func authorizationStatus() async -> UNAuthorizationStatus {
        // Older SDKs do not make UNNotificationSettings Sendable. Read it inside
        // the callback and transfer only the permission value to the main actor.
        await withCheckedContinuation { continuation in
            center.getNotificationSettings { settings in
                continuation.resume(returning: settings.authorizationStatus)
            }
        }
    }

    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .sound])
    }

    private enum PendingSchedule { case test, reward(RewardChange) }

    private func authorizeIfNeededAndSchedule(_ change: RewardChange?) async {
        guard isEnabled else { return }
        let authorization = await authorizationStatus()
        guard isEnabled else { return }
        switch authorization {
        case .authorized, .provisional, .ephemeral:
            status = .ready
            if let change { await scheduleReward(change) }
        case .notDetermined:
            guard !defaults.bool(forKey: requestedKey) else {
                status = .permissionNeeded
                return
            }
            await requestPermissionAndUpdate(schedule: change.map(PendingSchedule.reward))
        case .denied:
            status = .denied
        @unknown default:
            status = .permissionNeeded
        }
    }

    private func requestPermissionAndUpdate(schedule: PendingSchedule?) async {
        guard isEnabled else { return }
        defaults.set(true, forKey: requestedKey)
        do {
            let granted = try await center.requestAuthorization(options: [.alert, .sound])
            guard isEnabled else { return }
            guard granted else { status = .denied; return }
            status = .ready
            switch schedule {
            case .reward(let change): await scheduleReward(change)
            case .test: await scheduleTest()
            case nil: break
            }
        } catch {
            status = .error("Notification permission could not be requested.")
        }
    }

    private func scheduleReward(_ change: RewardChange) async {
        guard isEnabled else { return }
        let parts = [
            change.unrefinedUnits.map {
                "Unrefined balance increased by \(RewardTracker.format(units: $0, decimals: 11)) GODL."
            },
            change.goldUnits.map {
                "Gold rewards earned: \(RewardTracker.format(units: $0, decimals: 6)) XAUt0."
            },
        ].compactMap { $0 }
        guard !parts.isEmpty else { return }
        let content = UNMutableNotificationContent()
        content.title = "GODL rewards updated"
        content.body = parts.joined(separator: "\n")
        content.sound = .default
        let digest = SHA256.hash(data: Data(change.identity.utf8)).map { String(format: "%02x", $0) }.joined()
        let request = UNNotificationRequest(identifier: "godl-rewards-\(digest)-\(change.slot)", content: content, trigger: nil)
        do { try await center.add(request); status = .ready }
        catch { status = .error("The reward notification could not be delivered.") }
    }

    private func scheduleTest() async {
        guard isEnabled else { return }
        let content = UNMutableNotificationContent()
        content.title = "GODL notification test"
        content.body = "This is a test notification. No reward was detected."
        content.sound = .default
        do {
            try await center.add(UNNotificationRequest(identifier: "godl-rewards-test", content: content, trigger: nil))
            status = .ready
            testConfirmation = "Test sent · \(Date().formatted(date: .omitted, time: .shortened)). Check Notification Center."
        } catch { status = .error("The test notification could not be delivered.") }
    }

    private static func status(for authorization: UNAuthorizationStatus) -> RewardNotificationStatus {
        switch authorization {
        case .authorized, .provisional, .ephemeral: .ready
        case .notDetermined: .permissionNeeded
        case .denied: .denied
        @unknown default: .permissionNeeded
        }
    }
}
