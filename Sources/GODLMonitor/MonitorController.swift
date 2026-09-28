import AppKit
import Combine
import Foundation
import GODLCore

struct EngineConnection {
    let nodePath: String?
    let nodeRelativePath: String?
    let wallet: String

    var runtimeURL: URL? {
        if let nodeRelativePath, let resources = Bundle.main.resourceURL {
            let candidate = resources.appendingPathComponent(nodeRelativePath).standardizedFileURL
            guard candidate.path.hasPrefix(Bundle.main.bundleURL.appendingPathComponent("Contents/Helpers/").path + "/") else { return nil }
            return candidate
        }
        return nodePath.map { URL(fileURLWithPath: $0) }
    }
}

@MainActor
final class MonitorController: ObservableObject {
    @Published private(set) var monitor: MonitorView?
    @Published private(set) var isRefreshing = false
    @Published private(set) var observationFailure: RuntimeFailure?
    var errorMessage: String? { observationFailure?.message }
    @Published private(set) var isStale = true
    @Published private(set) var pricesExpired = true
    @Published private(set) var isReconciling = false
    @Published private(set) var accountingError: String?
    private(set) var balancePoints: [BalancePoint] = []
    private(set) var balanceChanges: [BalanceChange] = []
    @Published private(set) var connection: EngineConnection?
    @Published private(set) var setupError: String?
    @Published private(set) var setupNotice: String?
    private var savedSettings: WalletSettings?
    private var settingsWritable = true
    private let settingsStore: WalletSettingsStore
    private let automaticUpdates: Bool
    let launchAtLogin: LaunchAtLoginController
    private let rootDataDirectory: URL
    private var dataDirectory: URL
    @Published private(set) var notifications: RewardNotifications
    @Published private(set) var goals: GoalsController
    private var observationTimer: Timer?
    private var clockTimer: Timer?
    private var child: Process?
    private var watchdog: Task<Void, Never>?
    private var timedOut = false
    private var accountingTimer: Timer?
    private var accountingChild: Process?
    private var accountingWatchdog: Task<Void, Never>?
    private var accountingTimedOut = false
    private let accountingImportClient: AccountingImportClient
    private let instanceLease: MonitorInstanceLease?
    private var refreshLifecycle = MonitorRefreshLifecycle()
    private var workspaceSubscriptions = Set<AnyCancellable>()

    static var defaultDataDirectory: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("GODL Monitor", isDirectory: true)
    }

    init(rootDirectory: URL? = nil, startUpdates: Bool = true, loginItemService: (any LoginItemService)? = nil,
         instanceLease: MonitorInstanceLease? = nil) {
        self.instanceLease = instanceLease
        accountingImportClient = AccountingImportClient(instanceLease: instanceLease)
        launchAtLogin = LaunchAtLoginController(service: loginItemService ?? SystemLoginItemService())
        let root = rootDirectory ?? Self.defaultDataDirectory
        rootDataDirectory = root
        dataDirectory = root
        settingsStore = WalletSettingsStore(directory: root)
        automaticUpdates = startUpdates
        notifications = RewardNotifications(dataDirectory: root)
        goals = GoalsController(directory: root)
        if startUpdates {
            // Workspace notifications use NSWorkspace's own notification center.
            // No sleep assertion: let existing helpers suspend with the system.
            let center = NSWorkspace.shared.notificationCenter
            center.publisher(for: NSWorkspace.willSleepNotification)
                .receive(on: DispatchQueue.main)
                .sink { [weak self] _ in self?.refreshLifecycle.willSleep() }
                .store(in: &workspaceSubscriptions)
            center.publisher(for: NSWorkspace.didWakeNotification)
                .receive(on: DispatchQueue.main)
                .sink { [weak self] _ in self?.resumeAfterWake() }
                .store(in: &workspaceSubscriptions)
        }
        do {
            try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true,
                attributes: [.posixPermissions: 0o700])
            savedSettings = try settingsStore.load()
            // Personal builds used local cached observations. Preserve that wallet's
            // directory in place; never put the address into the distributable bundle.
            if savedSettings == nil,
               let cached = try? MonitorFileLoader().load(from: root.appendingPathComponent("monitor-view.json")) {
                let migrated = try WalletSettings(wallet: cached.wallet, legacyWallet: cached.wallet)
                try settingsStore.save(migrated)
                savedSettings = migrated
            }
            if let savedSettings { try activate(savedSettings) }
        } catch {
            setupError = "Local settings could not be loaded. Existing files have been preserved."
            settingsWritable = false
        }
    }

    var needsSetup: Bool { connection == nil }
    var configuredWallet: String { savedSettings?.wallet ?? connection?.wallet ?? "" }

    func saveWallet(_ input: String) throws {
        guard settingsWritable else { throw CocoaError(.fileWriteNoPermission) }
        let value = try WalletSettings(wallet: input, legacyWallet: savedSettings?.legacyWallet)
        try settingsStore.save(value)
        savedSettings = value
        if connection == nil {
            try activate(value)
            setupNotice = nil
        } else {
            setupNotice = value.wallet == connection?.wallet ? "Wallet saved." : "Wallet saved. Quit and reopen GODL to switch. Each wallet keeps its own history."
        }
    }

    func saveRPC(_ input: String) throws {
        try settingsStore.saveRPC(input)
        objectWillChange.send()
    }

    private func activate(_ settings: WalletSettings) throws {
        guard let resources = Bundle.main.resourceURL,
              FileManager.default.fileExists(atPath: resources.appendingPathComponent("engine/monitor-cli.mjs").path) else {
            setupError = "The observation engine is missing. Build and open the packaged app."
            throw CocoaError(.fileNoSuchFile)
        }
        dataDirectory = settings.dataDirectory(in: rootDataDirectory)
        try FileManager.default.createDirectory(at: dataDirectory, withIntermediateDirectories: true,
            attributes: [.posixPermissions: 0o700])
        notifications = RewardNotifications(dataDirectory: dataDirectory)
        goals = GoalsController(directory: dataDirectory)
        connection = EngineConnection(nodePath: nil, nodeRelativePath: "../Helpers/node", wallet: settings.wallet)
        if let cached = try? MonitorFileLoader().load(from: viewURL), cached.wallet == settings.wallet { accept(cached) }
        setupError = nil
        guard automaticUpdates else { return }
        clockTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.updateFreshness() }
        }
        observationTimer = Timer.scheduledTimer(withTimeInterval: 30, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.refresh() }
        }
        accountingTimer = Timer.scheduledTimer(withTimeInterval: 300, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.reconcileCosts() }
        }
        refresh()
        reconcileCosts()
    }

    var viewURL: URL { dataDirectory.appendingPathComponent("monitor-view.json") }
    var databaseURL: URL { dataDirectory.appendingPathComponent("observations.sqlite") }
    var rpcConfigURL: URL { rootDataDirectory.appendingPathComponent("rpc-config.json") }
    var rpcProvider: String {
        FileManager.default.fileExists(atPath: rpcConfigURL.path) ? "Private RPC" : "Public Solana RPC"
    }
    var accountingURL: URL { dataDirectory.appendingPathComponent("accounting-checkpoint.json") }

    var supportDiagnostics: SupportDiagnostics {
        let profile: SupportDiagnostics.Profile
        if setupError != nil { profile = .needsAttention }
        else if needsSetup { profile = .notSetUp }
        else if configuredWallet != connection?.wallet { profile = .restartRequired }
        else { profile = .ready }
        let observation: SupportDiagnostics.Observation
        if isRefreshing { observation = .updating }
        else if errorMessage != nil { observation = .failed }
        else if let monitor { observation = monitor.freshness(at: Date()).isStale ? .stale : .current }
        else { observation = .none }
        let quotes: SupportDiagnostics.Quotes
        if let market = monitor?.earnings?.market { quotes = market.isFresh() ? .current : .expired }
        else { quotes = .unavailable }
        let accounting: SupportDiagnostics.Accounting
        if !canReconcileCosts { accounting = .notSetUp }
        else if isReconciling { accounting = .updating }
        else if accountingError != nil { accounting = .needsAttention }
        else if let status = monitor?.accounting, Date().timeIntervalSince(status.checkedAt) > 660 { accounting = .stale }
        else { accounting = .init(engineState: monitor?.accounting?.state) }
        let notification: SupportDiagnostics.Notifications
        switch notifications.status {
        case .disabled: notification = .disabled
        case .checkingPermission: notification = .checking
        case .ready: notification = .ready
        case .permissionNeeded: notification = .permissionNeeded
        case .denied: notification = .denied
        case .error: notification = .needsAttention
        }
        #if arch(arm64)
        let architecture = SupportDiagnostics.Architecture.appleSilicon
        #elseif arch(x86_64)
        let architecture = SupportDiagnostics.Architecture.intel
        #else
        let architecture = SupportDiagnostics.Architecture.unknown
        #endif
        let runtime = Bundle.main.bundleURL.appendingPathComponent("Contents/Helpers/node")
        return SupportDiagnostics(
            appVersion: Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String,
            build: Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String,
            osVersion: ProcessInfo.processInfo.operatingSystemVersion, architecture: architecture,
            profile: profile, runtimePresent: FileManager.default.isExecutableFile(atPath: runtime.path),
            savedRPCConfiguration: FileManager.default.fileExists(atPath: rpcConfigURL.path),
            observation: observation, quotes: quotes, accounting: accounting, notifications: notification,
            launchAtLogin: launchAtLogin.status)
    }

    func checkAccountingFile(_ file: URL, reviewed: AccountingAnchorReview? = nil) async throws -> AccountingAnchorReview {
        guard let connection, configuredWallet == connection.wallet,
              let runtime = connection.runtimeURL, let resources = Bundle.main.resourceURL else {
            throw AccountingImportError.rejected("Reopen the app with the wallet you want to set up, then try again.")
        }
        let importing = reviewed != nil
        if importing && isReconciling { throw AccountingImportError.rejected("Wait for the current accounting check to finish, then try again.") }
        if let reviewed, reviewed.wallet != connection.wallet { throw AccountingImportError.invalidResponse }
        var arguments = [resources.appendingPathComponent("engine/accounting-import-cli.mjs").path,
                         "--mode", importing ? "import" : "inspect", "--wallet", connection.wallet, "--input", file.path]
        if let reviewed {
            arguments += ["--profile", dataDirectory.path, "--expected-sha256", reviewed.sha256, "--reviewed"]
        }
        let bytes = try await accountingImportClient.run(executable: runtime, arguments: arguments)
        let result = try AccountingImportResponse.decode(bytes, expectedWallet: connection.wallet, importing: importing)
        guard let checked = result.review, reviewed == nil || checked == reviewed else { throw AccountingImportError.invalidResponse }
        if importing {
            objectWillChange.send()
            accountingError = nil
            reconcileCosts()
        }
        return checked
    }

    func cancelAccountingFileCheck() { accountingImportClient.cancel() }
    var canReconcileCosts: Bool {
        connection?.runtimeURL != nil && FileManager.default.fileExists(
            atPath: dataDirectory.appendingPathComponent("accounting-anchor.json").path)
    }
    var accountingSummary: String {
        if isReconciling { return "Updating costs from mining history…" }
        if let accountingError { return accountingError }
        guard let status = monitor?.accounting else { return "Net earnings require a verified accounting history" }
        if Date().timeIntervalSince(status.checkedAt) > 660 { return "Cost check delayed · last verified period shown" }
        switch status.state {
        case "current": return "History checked · \(status.checkedAt.formatted(date: .omitted, time: .shortened))"
        case "waiting": return "Waiting for settled history or a newer finalized slot"
        case "retrying": return (status.failure?.title ?? "Cost check delayed") + " · last verified period shown"
        default: return "Cost history needs review · last verified period shown"
        }
    }
    var status: String {
        if isRefreshing && monitor == nil { return "Reading chain data…" }
        if monitor == nil { return errorMessage == nil ? "No observations yet" : "Observation unavailable" }
        if errorMessage != nil { return "Refresh failed · showing last observation" }
        return isStale ? "Observation stale" : "Monitoring · read-only"
    }

    private func accept(_ view: MonitorView) {
        goals.configure(view)
        balancePoints = BalancePoint.observations(in: view.history)
        balanceChanges = BalanceChange.observations(in: view.history)
        monitor = view
        notifications.setIdentity(RewardSample.identity(wallet: view.wallet,
            network: view.provenance.genesisHash, program: view.provenance.programAddress,
            source: view.provenance.sourceCommit))
        updateFreshness()
    }

    @Published private(set) var displayDay = Calendar.current.startOfDay(for: Date())

    private func updateFreshness() {
        let day = (monitor?.earnings?.calendar ?? .current).startOfDay(for: Date())
        if day != displayDay { displayDay = day }
        let stale = monitor?.freshness(at: Date()).isStale ?? true
        // The one-second freshness check publishes only when the status changes.
        // It must not rebuild the complete chart and ledger every second.
        if stale != isStale { isStale = stale }
        let expired = !(monitor?.earnings?.market.isFresh() ?? false)
        if expired != pricesExpired { pricesExpired = expired }
    }

    private func resumeAfterWake() {
        guard refreshLifecycle.didWake() else { return }
        updateFreshness()
        refresh()
        reconcileCosts()
    }

    func refresh() {
        guard automaticUpdates, !isRefreshing, let connection else { return }
        let process = Process()
        let output = Pipe()
        guard let runtimeURL = connection.runtimeURL else {
            observationFailure = .runtimeUnavailable
            return
        }
        process.executableURL = runtimeURL
        guard let resources = Bundle.main.resourceURL else { return }
        let entrypoint = resources.appendingPathComponent("engine/monitor-cli.mjs")
        process.currentDirectoryURL = dataDirectory
        process.arguments = [entrypoint.path, "observe", "--wallet", connection.wallet,
            "--db", databaseURL.path, "--out", viewURL.path,
            "--period", dataDirectory.appendingPathComponent("acquisition-period.json").path,
            "--accounting", accountingURL.path, "--rpc-config", rpcConfigURL.path,
            "--prices", dataDirectory.appendingPathComponent("market-quotes.json").path,
            "--evidence", dataDirectory.appendingPathComponent("accounting-evidence").path,
            "--time-zone", TimeZone.current.identifier]
        process.environment = ProcessInfo.processInfo.environment.filter { !["NODE_OPTIONS", "NODE_PATH"].contains($0.key) }
        process.standardOutput = FileHandle.nullDevice
        process.standardError = output
        process.terminationHandler = { [weak self] completed in
            let message = String(data: output.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
            Task { @MainActor [weak self] in
                guard let self, self.child === completed else { return }
                self.watchdog?.cancel()
                self.watchdog = nil
                self.child = nil
                self.isRefreshing = false
                let retryAfterWake = self.refreshLifecycle.finish(.observation)
                defer { if retryAfterWake { self.refresh() } }
                if self.timedOut { return }
                if completed.terminationStatus == 0 {
                    do {
                        let fresh = try MonitorFileLoader().load(from: self.viewURL)
                        guard fresh.wallet == self.connection?.wallet else {
                            throw CocoaError(.fileReadCorruptFile)
                        }
                        self.accept(fresh)
                        if let slot = UInt64(fresh.provenance.slot), let rewards = fresh.rewardObservation {
                            let unrefined: UInt64?
                            if case .observed(let amount) = fresh.balances.unrefinedGodl {
                                unrefined = UInt64(amount.baseUnits)
                            } else { unrefined = nil }
                            let refined: UInt64?
                            if case .observed(let amount) = fresh.balances.refinedGodl { refined = UInt64(amount.baseUnits) }
                            else { refined = nil }
                            self.notifications.consume(RewardSample(wallet: fresh.wallet, network: fresh.provenance.genesisHash,
                                program: fresh.provenance.programAddress, source: fresh.provenance.sourceCommit,
                                slot: slot, observedAt: fresh.provenance.observedAt, unrefinedUnits: unrefined,
                                lastClaimGodlAt: rewards.lastClaimGodlAt,
                                cumulativeGoldUnits: rewards.cumulativeGoldBaseUnits.flatMap(UInt64.init),
                                refinedUnits: refined))
                        }
                        self.observationFailure = nil
                    } catch { self.observationFailure = .invalidData }
                } else {
                    self.observationFailure = RuntimeFailure.decode(stderr: message)
                }
            }
        }
        guard refreshLifecycle.begin(.observation) else { return }
        do {
            timedOut = false
            if let instanceLease { try instanceLease.run(process) }
            else { try process.run() }
            child = process
            isRefreshing = true
            watchdog = Task { [weak self] in
                do { try await Task.sleep(for: .seconds(35)) } catch { return }
                guard let self, self.child === process, process.isRunning else { return }
                self.timedOut = true
                self.observationFailure = .timedOut
                process.terminate()
                do { try await Task.sleep(for: .seconds(3)) } catch { return }
                if self.child === process && process.isRunning {
                    // Only this owned read-only subprocess; SQLite recovers interrupted writes via WAL.
                    kill(process.processIdentifier, SIGKILL)
                }
            }
        } catch {
            _ = refreshLifecycle.finish(.observation)
            observationFailure = .runtimeUnavailable
        }
    }

    func reconcileCosts() {
        guard automaticUpdates, !isReconciling, let connection, let runtimeURL = connection.runtimeURL,
              let resources = Bundle.main.resourceURL else { return }
        let anchor = dataDirectory.appendingPathComponent("accounting-anchor.json")
        guard FileManager.default.fileExists(atPath: anchor.path) else { return }
        let process = Process(), output = Pipe()
        process.executableURL = runtimeURL
        process.currentDirectoryURL = dataDirectory
        process.arguments = [resources.appendingPathComponent("engine/accounting-cli.mjs").path,
            "--wallet", connection.wallet, "--checkpoint", accountingURL.path,
            "--anchor", anchor.path, "--evidence", dataDirectory.appendingPathComponent("accounting-evidence").path, "--rpc-config", rpcConfigURL.path]
        process.environment = ProcessInfo.processInfo.environment.filter { !["NODE_OPTIONS", "NODE_PATH"].contains($0.key) }
        process.standardOutput = FileHandle.nullDevice
        process.standardError = output
        process.terminationHandler = { [weak self] completed in
            let message = String(data: output.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
            Task { @MainActor [weak self] in
                guard let self, self.accountingChild === completed else { return }
                self.accountingWatchdog?.cancel()
                self.accountingWatchdog = nil
                self.accountingChild = nil
                self.isReconciling = false
                let retryAfterWake = self.refreshLifecycle.finish(.accounting)
                if !self.accountingTimedOut {
                    self.accountingError = [0, 2].contains(completed.terminationStatus) ? nil
                        : "Cost check: " + RuntimeFailure.decode(stderr: message).message
                }
                self.refresh()
                if retryAfterWake { self.reconcileCosts() }
            }
        }
        guard refreshLifecycle.begin(.accounting) else { return }
        do {
            accountingTimedOut = false
            if let instanceLease { try instanceLease.run(process) }
            else { try process.run() }
            accountingChild = process
            isReconciling = true
            accountingError = nil
            accountingWatchdog = Task { [weak self] in
                do { try await Task.sleep(for: .seconds(900)) } catch { return }
                guard let self, self.accountingChild === process, process.isRunning else { return }
                self.accountingTimedOut = true
                self.accountingError = "Cost check timed out · cached evidence will be reused on retry"
                process.terminate()
                do { try await Task.sleep(for: .seconds(3)) } catch { return }
                if self.accountingChild === process && process.isRunning { kill(process.processIdentifier, SIGKILL) }
            }
        } catch {
            _ = refreshLifecycle.finish(.accounting)
            accountingError = "Cost check: " + RuntimeFailure.runtimeUnavailable.message
        }
    }

    func stop() {
        refreshLifecycle.stop()
        workspaceSubscriptions.removeAll()
        accountingImportClient.cancel()
        watchdog?.cancel()
        observationTimer?.invalidate()
        clockTimer?.invalidate()
        child?.terminate()
        accountingTimer?.invalidate()
        accountingWatchdog?.cancel()
        accountingChild?.terminate()
    }
}
