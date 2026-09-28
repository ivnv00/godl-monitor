import SwiftUI
import UniformTypeIdentifiers
import GODLCore

private struct ProfileBackupDocument: FileDocument {
    static let readableContentTypes: [UTType] = [.json]
    let backup: ProfileBackup
    init(_ backup: ProfileBackup) { self.backup = backup }
    init(configuration: ReadConfiguration) throws { throw CocoaError(.fileReadUnsupportedScheme) }
    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper { backup.fileWrapper() }
}

enum ProfileTransferMode { case save, restore }

// Hallmark · component: private profile transfer · Warm Ledger · P5 H5 E4 S5 R5 V4
// Shared controls, native dialogs, explicit review and fixed feedback. No new motion.
struct ProfileTransferButton: View {
    @ObservedObject var controller: MonitorController
    let mode: ProfileTransferMode
    var onRestored: (String) -> Void = { _ in }
    @State private var showing = false

    var body: some View {
        Button { showing = true } label: {
            Label(mode == .save ? "Save backup" : "Restore backup",
                  systemImage: mode == .save ? "square.and.arrow.up" : "square.and.arrow.down")
        }
        .buttonStyle(LedgerButtonStyle()).ledgerFocusRing()
        .disabled(mode == .save && !controller.canBackUpProfile)
        .sheet(isPresented: $showing) {
            ProfileTransferSheet(controller: controller, mode: mode, onRestored: onRestored) { showing = false }
        }
    }
}

private struct ProfileTransferSheet: View {
    @ObservedObject var controller: MonitorController
    let mode: ProfileTransferMode
    let onRestored: (String) -> Void
    let close: () -> Void
    @State private var backup: ProfileBackup?
    @State private var operation: Task<Void, Never>?
    @State private var showingImporter = false
    @State private var showingExporter = false
    @State private var completed = false
    @State private var errorMessage: String?
    private var busy: Bool { operation != nil || showingExporter }

    var body: some View {
        VStack(spacing: 0) {
            LedgerDetailHeader(mode == .save ? "Save backup" : "Restore backup", close: close).disabled(busy)
            LedgerRule()
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    if completed {
                        Label(mode == .save ? "Backup saved" : "Goals and activity restored", systemImage: "checkmark.circle")
                            .font(LedgerType.section).foregroundStyle(WarmLedger.positive)
                        Text(mode == .save
                             ? "Keep this file private. On your other Mac, choose Restore backup before adding this wallet."
                             : "The wallet field is ready. Start monitoring or save the wallet when you’re ready; an active monitor switches after you quit and reopen.")
                            .font(LedgerType.body).foregroundStyle(WarmLedger.secondary)
                    } else {
                        Text("Your goals. Your recorded rewards.").font(LedgerType.section)
                        if let backup { review(backup) }
                        else if operation != nil {
                            HStack(spacing: 10) { ProgressView().controlSize(.small); Text("Preparing…").font(LedgerType.body) }
                        } else {
                            Text("Choose a goals and activity backup created by GODL Monitor.")
                                .font(LedgerType.body).foregroundStyle(WarmLedger.secondary)
                        }
                        Text("Includes wallet address, goal titles, reward amounts and read states. This file is not encrypted; keep it private.")
                            .font(LedgerType.meta).foregroundStyle(WarmLedger.secondary)
                        Text("RPC keys, balance charts, prices and net accounting are excluded. Your first fresh observation starts a new reward baseline.")
                            .font(LedgerType.meta).foregroundStyle(WarmLedger.tertiary)
                        if mode == .restore {
                            Text("Restore creates a new local profile. Existing profiles are never merged or replaced.")
                                .font(LedgerType.meta).foregroundStyle(WarmLedger.secondary)
                        }
                    }
                    if let errorMessage {
                        Label(errorMessage, systemImage: "exclamationmark.circle")
                            .font(LedgerType.meta).foregroundStyle(WarmLedger.critical)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }.padding(LedgerLayout.detailInset).frame(maxWidth: .infinity, alignment: .leading)
            }.scrollBounceBehavior(.basedOnSize)
            LedgerRule()
            footer
        }
        .frame(width: 560, height: 620).background(WarmLedger.window).foregroundStyle(WarmLedger.ink)
        .interactiveDismissDisabled(busy)
        .fileImporter(isPresented: $showingImporter, allowedContentTypes: [.json]) { result in
            switch result {
            case .success(let url): read(url)
            case .failure(let error): if !cancelled(error) { errorMessage = "Couldn’t open the backup. Choose a local file and try again." }
            }
        }
        .fileExporter(isPresented: $showingExporter, document: backup.map(ProfileBackupDocument.init),
                      contentType: .json, defaultFilename: "GODL-goals-activity-backup.json") { result in
            switch result {
            case .success: completed = true
            case .failure(let error): if !cancelled(error) { errorMessage = "Couldn’t save the backup. Choose another location and try again." }
            }
        }
        .fileDialogMessage(Text("Private, unencrypted wallet address, goals and recorded rewards. RPC keys and accounting files are excluded."))
        .onAppear { if mode == .save { prepare() } }
        .onDisappear { operation?.cancel() }
    }

    private func review(_ backup: ProfileBackup) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Wallet").font(LedgerType.caption).foregroundStyle(WarmLedger.secondary)
            Text(backup.wallet).font(.system(size: 12, design: .monospaced)).textSelection(.enabled)
                .fixedSize(horizontal: false, vertical: true)
            LedgerRule()
            HStack {
                Text("\(backup.goalCount) goals")
                Spacer()
                Text("\(backup.entries.count) recorded intervals")
            }.font(LedgerType.body).monospacedDigit()
            Text("\(backup.unreadCount) unread · Saved \(backup.createdAt.formatted(date: .abbreviated, time: .shortened))")
                .font(LedgerType.meta).foregroundStyle(WarmLedger.secondary)
        }.ledgerPanel()
    }

    private var footer: some View {
        HStack(spacing: 12) {
            if completed {
                Spacer()
                Button("Done", action: close).buttonStyle(LedgerButtonStyle(minWidth: 100)).ledgerFocusRing()
                    .keyboardShortcut(.defaultAction)
            } else {
                Button("Cancel", action: close).buttonStyle(LedgerButtonStyle()).ledgerFocusRing().disabled(busy)
                Spacer(minLength: 0)
                if mode == .restore {
                    Button(backup == nil ? "Choose backup" : "Choose another") { errorMessage = nil; showingImporter = true }
                        .buttonStyle(LedgerButtonStyle()).ledgerFocusRing().disabled(busy)
                    if backup != nil {
                        Button(busy ? "Restoring…" : "Restore", action: restore)
                            .buttonStyle(LedgerButtonStyle(minWidth: 110)).ledgerFocusRing()
                            .disabled(busy).keyboardShortcut(.defaultAction)
                    }
                } else {
                    Button("Save backup") { errorMessage = nil; showingExporter = true }
                        .buttonStyle(LedgerButtonStyle()).ledgerFocusRing()
                        .disabled(busy || backup == nil).keyboardShortcut(.defaultAction)
                }
            }
        }.padding(LedgerLayout.detailInset)
    }

    private func prepare() {
        operation = Task { @MainActor in
            defer { operation = nil }
            do {
                let value = try await controller.makeProfileBackup()
                try Task.checkCancellation()
                backup = value
            } catch { show(error) }
        }
    }

    private func read(_ url: URL) {
        backup = nil; errorMessage = nil
        operation = Task { @MainActor in
            defer { operation = nil }
            let task = Task.detached(priority: .userInitiated) {
                let scoped = url.startAccessingSecurityScopedResource()
                defer { if scoped { url.stopAccessingSecurityScopedResource() } }
                return try ProfileBackup.read(from: url)
            }
            do {
                let value = try await withTaskCancellationHandler(operation: { try await task.value }, onCancel: { task.cancel() })
                try Task.checkCancellation()
                backup = value
            } catch { show(error) }
        }
    }

    private func restore() {
        guard let backup, !busy else { return }
        errorMessage = nil
        operation = Task { @MainActor in
            defer { operation = nil }
            do {
                try await controller.restoreProfileBackup(backup)
                completed = true
                onRestored(backup.wallet)
            } catch { show(error) }
        }
    }

    private func show(_ error: Error) {
        guard !cancelled(error) else { return }
        errorMessage = (error as? ProfileBackup.Failure)?.errorDescription
            ?? "Couldn’t complete the transfer. Existing profiles are unchanged."
    }

    private func cancelled(_ error: Error) -> Bool {
        error is CancellationError || ((error as NSError).domain == NSCocoaErrorDomain && (error as NSError).code == NSUserCancelledError)
    }
}
