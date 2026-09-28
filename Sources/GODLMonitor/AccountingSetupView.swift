import SwiftUI
import UniformTypeIdentifiers
import GODLCore

// Warm Ledger · component: reviewed accounting setup · existing native tokens.
struct AccountingSetupView: View {
    @ObservedObject var controller: MonitorController
    let close: () -> Void
    @State private var showingFilePicker = false
    @State private var selectedFile: URL?
    @State private var review: AccountingAnchorReview?
    @State private var acknowledged = false
    @State private var isBusy = false
    @State private var imported = false
    @State private var errorMessage: String?
    @State private var showBasis = false

    var body: some View {
        VStack(spacing: 0) {
            LedgerDetailHeader("Set up accounting", close: close).disabled(isBusy)
            LedgerRule()
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    if imported { success }
                    else if let review { reviewContent(review) }
                    else { introduction }
                    if let errorMessage {
                        Label(errorMessage, systemImage: "exclamationmark.circle")
                            .font(LedgerType.meta).foregroundStyle(WarmLedger.critical)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .padding(LedgerLayout.detailInset).frame(maxWidth: .infinity, alignment: .leading)
            }.scrollBounceBehavior(.basedOnSize)
            LedgerRule()
            footer
        }
        .frame(width: 560, height: 620).background(WarmLedger.window).foregroundStyle(WarmLedger.ink)
        .disclosureGroupStyle(LedgerDisclosureStyle())
        .interactiveDismissDisabled(isBusy)
        .fileImporter(isPresented: $showingFilePicker, allowedContentTypes: [.json]) { result in
            switch result {
            case .success(let url): select(url)
            case .failure:
                errorMessage = "The file could not be opened. Choose a local JSON file and try again."
            }
        }
        .onDisappear {
            controller.cancelAccountingFileCheck()
            releaseFile()
        }
    }

    private var introduction: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("Start with reviewed history.").font(LedgerType.section)
            Text("Choose an accounting-anchor.json prepared and reviewed for this wallet. It records the starting boundary and mining costs needed for net earnings.")
                .font(LedgerType.body).foregroundStyle(WarmLedger.secondary)
            wallet(controller.connection?.wallet ?? "")
            Label("File checks run locally", systemImage: "doc.text.magnifyingglass")
                .font(LedgerType.body)
            Text("We check the wallet, account identities and arithmetic. These checks cannot prove that the recorded historical costs are correct.")
                .font(LedgerType.meta).foregroundStyle(WarmLedger.secondary)
            Text("No reviewed file yet? Keep using balances, recorded rewards and goals. Net values stay unavailable until a reviewed starting point is supplied.")
                .font(LedgerType.meta).foregroundStyle(WarmLedger.tertiary)
        }
    }

    private func reviewContent(_ review: AccountingAnchorReview) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            Label("File checks passed", systemImage: "checkmark.circle")
                .font(LedgerType.section).foregroundStyle(WarmLedger.positive)
            wallet(review.wallet)
            VStack(alignment: .leading, spacing: 12) {
                reviewRow("Cost period", "\(date(review.startedAt)) – \(date(review.throughAt))")
                reviewRow("Unrefined GODL", "\(review.earnedGodl) GODL")
                reviewRow("Recorded net cost", "\(review.netSpendSol) SOL")
                reviewRow("Historical USD estimate", "\(review.netSpendUsd) USD")
            }.ledgerPanel()
            DisclosureGroup("Starting point & scope", isExpanded: $showBasis) {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Closing observation · \(date(review.observedAt)) · slot \(review.closingSlot)")
                    Text(review.baselineBasis)
                    Text(review.priceBasis)
                    ForEach(Array(review.caveats.enumerated()), id: \.offset) { _, caveat in Text(caveat) }
                }
                .font(LedgerType.meta).foregroundStyle(WarmLedger.secondary).textSelection(.enabled)
                .padding(.top, 8)
            }
            Text("File checks confirm consistency, not historical truth. Import only after the opening balance, transactions and costs have been reviewed.")
                .font(LedgerType.meta).foregroundStyle(WarmLedger.secondary)
            Toggle("I have reviewed this wallet’s starting balance and cost history.", isOn: $acknowledged)
                .toggleStyle(.checkbox).font(LedgerType.body).fixedSize(horizontal: false, vertical: true)
                .disabled(isBusy)
            Text("Existing accounting is never replaced. Earlier daily history is not restored by this file.")
                .font(LedgerType.caption).foregroundStyle(WarmLedger.tertiary)
        }
    }

    private var success: some View {
        VStack(alignment: .leading, spacing: 20) {
            Label("Starting point imported", systemImage: "checkmark.circle")
                .font(LedgerType.section).foregroundStyle(WarmLedger.positive)
            Text("The next accounting check will reconcile finalized activity from this point. Net earnings appear only when settlement, history and price coverage are sufficient.")
                .font(LedgerType.body).foregroundStyle(WarmLedger.secondary)
            Text("Balances, goals and recorded rewards continue as usual.")
                .font(LedgerType.meta).foregroundStyle(WarmLedger.tertiary)
        }
    }

    private var footer: some View {
        HStack(spacing: 12) {
            if imported {
                Spacer()
                Button("Done", action: close).buttonStyle(LedgerButtonStyle(minWidth: 100)).ledgerFocusRing()
                    .keyboardShortcut(.defaultAction)
            } else {
                Button("Cancel", action: close).buttonStyle(LedgerButtonStyle()).ledgerFocusRing().disabled(isBusy)
                Spacer(minLength: 0)
                if review != nil {
                    Button("Choose another") { showingFilePicker = true }
                        .buttonStyle(LedgerButtonStyle()).ledgerFocusRing().disabled(isBusy)
                    Button(isBusy ? "Importing…" : "Import starting point", action: importFile)
                        .buttonStyle(LedgerButtonStyle(minWidth: 170)).ledgerFocusRing()
                        .disabled(isBusy || !acknowledged).keyboardShortcut(.defaultAction)
                } else {
                    Button(isBusy ? "Checking…" : "Choose reviewed file") { showingFilePicker = true }
                        .buttonStyle(LedgerButtonStyle(minWidth: 180)).ledgerFocusRing()
                        .disabled(isBusy).keyboardShortcut(.defaultAction)
                }
            }
        }.padding(LedgerLayout.detailInset)
    }

    private func wallet(_ address: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Active wallet").font(LedgerType.caption).foregroundStyle(WarmLedger.tertiary)
            Text(address).font(.system(size: 12, design: .monospaced)).textSelection(.enabled)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func reviewRow(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label).font(LedgerType.caption).foregroundStyle(WarmLedger.secondary)
            Text(value).font(LedgerType.body).monospacedDigit().textSelection(.enabled)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func date(_ value: String) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = formatter.date(from: value) else { return value }
        return date.formatted(date: .abbreviated, time: .shortened)
    }

    private func select(_ url: URL) {
        releaseFile()
        _ = url.startAccessingSecurityScopedResource()
        selectedFile = url
        review = nil; acknowledged = false; errorMessage = nil; isBusy = true; showBasis = false
        Task { @MainActor in
            defer { isBusy = false }
            do { review = try await controller.checkAccountingFile(url) }
            catch { errorMessage = error.localizedDescription; releaseFile() }
        }
    }

    private func importFile() {
        guard acknowledged, !isBusy, let selectedFile, let review else { return }
        isBusy = true; errorMessage = nil
        Task { @MainActor in
            defer { isBusy = false }
            do {
                _ = try await controller.checkAccountingFile(selectedFile, reviewed: review)
                imported = true; releaseFile()
            } catch {
                errorMessage = error.localizedDescription
                self.review = nil; acknowledged = false; releaseFile()
            }
        }
    }

    private func releaseFile() {
        selectedFile?.stopAccessingSecurityScopedResource()
        selectedFile = nil
    }
}
