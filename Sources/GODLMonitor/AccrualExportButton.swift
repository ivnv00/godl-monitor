import SwiftUI
import UniformTypeIdentifiers
import GODLCore

private struct AccrualDocument: FileDocument {
    static let readableContentTypes: [UTType] = [.commaSeparatedText]
    let csv: AccrualCSV
    init(csv: AccrualCSV) { self.csv = csv }
    init(configuration: ReadConfiguration) throws { throw CocoaError(.fileReadUnsupportedScheme) }
    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper { csv.fileWrapper() }
}

// Hallmark · component: export · Warm Ledger · P5 H5 E4 S5 R5 V4
// Ledger button owns hover/focus/press/disabled; native save dialog owns file choice.
struct AccrualExportButton: View {
    let entries: [RewardInboxEntry]
    let scope: String
    let historyAvailable: Bool
    @State private var preparation: Task<AccrualCSV, Error>?
    @State private var requestID: UUID?
    @State private var document: AccrualDocument?
    @State private var showingExporter = false
    @State private var exportScope = ""
    @State private var filename = "GODL-accruals.csv"
    @State private var feedback: String?
    @State private var failed = false

    var body: some View {
        Button(action: prepare) {
            HStack(spacing: 8) {
                if preparation != nil { ProgressView().controlSize(.small).frame(width: 16, height: 16) }
                else { Image(systemName: feedback != nil && !failed ? "checkmark" : "square.and.arrow.up") }
                Text(preparation != nil ? "Preparing…" : "Export CSV")
            }
        }
        .buttonStyle(LedgerButtonStyle(minWidth: 126)).ledgerFocusRing()
        .disabled(entries.isEmpty || !historyAvailable || preparation != nil || showingExporter)
        .help("Export every matching recorded interval, including earlier rows. Exact token amounts; before fees and costs. No wallet address or RPC details.")
        .fileExporter(isPresented: $showingExporter, document: document,
                      contentType: .commaSeparatedText, defaultFilename: filename) { result in
            switch result {
            case .success:
                failed = false
                feedback = "Exported \(document?.csv.recordCount ?? 0) recorded intervals."
            case .failure(let error):
                if (error as NSError).domain == NSCocoaErrorDomain && (error as NSError).code == NSUserCancelledError { return }
                failed = true
                feedback = "Couldn’t save the CSV. Choose another location and try again."
            }
        }
        .fileDialogMessage(Text("\(document?.csv.recordCount ?? 0) recorded intervals · \(exportScope). Gross token amounts before fees and costs. No wallet address or RPC details."))
        .popover(isPresented: Binding(get: { feedback != nil }, set: { if !$0 { feedback = nil } })) {
            Text(feedback ?? "").font(LedgerType.meta)
                .foregroundStyle(failed ? WarmLedger.critical : WarmLedger.ink)
                .padding(16).frame(maxWidth: 300).fixedSize(horizontal: false, vertical: true)
                .background(WarmLedger.popover)
        }
        .onChange(of: scope) { feedback = nil }
        .onDisappear {
            preparation?.cancel()
            preparation = nil
            requestID = nil
        }
    }

    private func prepare() {
        guard preparation == nil, !showingExporter, historyAvailable, !entries.isEmpty else { return }
        let snapshot = entries, now = Date(), id = UUID()
        requestID = id
        feedback = nil
        exportScope = scope
        let date = ISO8601DateFormatter().string(from: now).prefix(10)
        filename = "GODL-accruals-\(date).csv"
        let task = Task.detached(priority: .userInitiated) { try AccrualCSV(entries: snapshot, now: now) }
        preparation = task
        Task { @MainActor in
            do {
                let csv = try await task.value
                guard requestID == id else { return }
                preparation = nil
                document = AccrualDocument(csv: csv)
                showingExporter = true
            } catch {
                guard requestID == id else { return }
                preparation = nil
                guard !(error is CancellationError) else { return }
                failed = true
                feedback = (error as? AccrualCSV.Failure)?.errorDescription
                    ?? "Couldn’t prepare the export. Existing records have been preserved."
            }
        }
    }
}
