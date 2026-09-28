import AppKit
import SwiftUI

// Hallmark · component: support report · Warm Ledger · P5 H4 E4 S5 R5 V4
// Shared native hover/focus/pressed states; synchronous copy has no loading phase.
struct DiagnosticsButton: View {
    private struct Snapshot: Identifiable {
        let id = UUID()
        let text: String
    }

    @ObservedObject var controller: MonitorController
    @State private var report: Snapshot?

    var body: some View {
        Button {
            controller.launchAtLogin.refresh()
            report = Snapshot(text: controller.supportDiagnostics.text)
        } label: {
            Label("Diagnostics", systemImage: "doc.text.magnifyingglass")
        }
        .buttonStyle(LedgerButtonStyle()).ledgerFocusRing()
        .help("Review app health before copying a support report")
        .sheet(item: $report) { snapshot in
            DiagnosticsView(report: snapshot.text) { report = nil }
        }
    }
}

struct DiagnosticsView: View {
    let report: String
    let close: () -> Void
    @State private var copySucceeded: Bool?

    var body: some View {
        VStack(spacing: 0) {
            LedgerDetailHeader("Diagnostics", close: close)
            LedgerRule()
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text("Review, then copy.").font(LedgerType.section)
                    Text("App health only. No wallet, RPC address, keys, balances or file paths. Nothing is sent automatically.")
                        .font(LedgerType.meta).foregroundStyle(WarmLedger.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(report).font(LedgerType.meta.monospaced()).textSelection(.enabled)
                        .frame(maxWidth: .infinity, alignment: .leading).ledgerPanel()
                        .accessibilityLabel("Diagnostic report").accessibilityValue(report)
                    if copySucceeded == false {
                        Text("Couldn’t copy. Select the report and press Command-C, or try again.")
                            .font(LedgerType.meta).foregroundStyle(WarmLedger.critical)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }.padding(LedgerLayout.detailInset).frame(maxWidth: .infinity, alignment: .leading)
            }.scrollBounceBehavior(.basedOnSize)
            LedgerRule()
            HStack {
                Button {
                    NSPasteboard.general.clearContents()
                    copySucceeded = NSPasteboard.general.setString(report, forType: .string)
                } label: {
                    Label(copySucceeded == true ? "Copied" : "Copy diagnostics",
                          systemImage: copySucceeded == true ? "checkmark" : "doc.on.doc")
                }
                .buttonStyle(LedgerButtonStyle(minWidth: 164)).ledgerFocusRing()
                Spacer()
                Button("Done", action: close).buttonStyle(LedgerButtonStyle(minWidth: 100)).ledgerFocusRing()
                    .keyboardShortcut(.defaultAction)
            }.padding(.horizontal, LedgerLayout.detailInset).padding(.vertical, 16)
        }
        .frame(width: 560, height: 620).background(WarmLedger.window).foregroundStyle(WarmLedger.ink)
    }
}
