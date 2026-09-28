import SwiftUI

// Hallmark · Warm Ledger shared native layout · P5 H5 E4 S5 R5 V4
// Main, detail and compact views share rhythm while retaining native sizing.
enum LedgerLayout {
    static let pageInset: CGFloat = 40
    static let detailInset: CGFloat = 24
    static let compactInset: CGFloat = 22
    static let sectionGap: CGFloat = 24
    static let cardGap: CGFloat = 16
    static let cardInset: CGFloat = 16
    static let cardRadius: CGFloat = 12
}

extension View {
    func ledgerPanel() -> some View {
        padding(LedgerLayout.cardInset)
            .background(WarmLedger.control.opacity(0.30), in: RoundedRectangle(cornerRadius: LedgerLayout.cardRadius))
    }
}

/// The complete row toggles details; no precision clicking on a disclosure arrow.
struct LedgerDisclosureStyle: DisclosureGroupStyle {
    func makeBody(configuration: Configuration) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Button { configuration.isExpanded.toggle() } label: {
                HStack(spacing: 12) {
                    configuration.label
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Text(configuration.isExpanded ? "Hide" : "Show")
                        .font(LedgerType.meta).foregroundStyle(WarmLedger.strongBrass)
                        .fixedSize().accessibilityHidden(true)
                }
                .padding(.horizontal, 12).frame(minHeight: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(LedgerRowButtonStyle()).ledgerFocusRing()
            .textSelection(.disabled)
            .background(WarmLedger.control.opacity(0.30), in: RoundedRectangle(cornerRadius: 8))
            .accessibilityValue(configuration.isExpanded ? "Expanded" : "Collapsed")
            .accessibilityHint(configuration.isExpanded ? "Hide this section" : "Show this section")
            if configuration.isExpanded { configuration.content }
        }
    }
}

struct LedgerDetailHeader<Actions: View>: View {
    let title: String
    let compact: Bool
    let back: Bool
    let close: () -> Void
    let actions: Actions

    init(_ title: String, compact: Bool = false, back: Bool = false,
         close: @escaping () -> Void, @ViewBuilder actions: () -> Actions) {
        self.title = title; self.compact = compact; self.back = back
        self.close = close; self.actions = actions()
    }

    var body: some View {
        HStack(spacing: 10) {
            if back { dismissButton }
            Text(title).font(compact ? LedgerType.section : LedgerType.title)
            Spacer(minLength: 8)
            actions
            if !back { dismissButton }
        }
        .padding(.horizontal, compact ? 12 : LedgerLayout.detailInset)
        .padding(.vertical, compact ? 10 : 16)
    }

    private var dismissButton: some View {
        Button(action: close) { Image(systemName: back ? "chevron.left" : "xmark") }
            .buttonStyle(LedgerIconButtonStyle()).ledgerFocusRing()
            .accessibilityLabel(back ? "Back to monitor" : "Close \(title.lowercased())")
            .keyboardShortcut(back ? "[" : .escape, modifiers: back ? .command : [])
    }
}

extension LedgerDetailHeader where Actions == EmptyView {
    init(_ title: String, compact: Bool = false, back: Bool = false, close: @escaping () -> Void) {
        self.init(title, compact: compact, back: back, close: close) { EmptyView() }
    }
}

struct LedgerDetailFooter: View {
    var note = ""
    let close: () -> Void
    var body: some View {
        HStack {
            Text(note).font(LedgerType.meta).foregroundStyle(WarmLedger.tertiary)
            Spacer()
            Button("Done", action: close).buttonStyle(LedgerButtonStyle()).ledgerFocusRing()
                .frame(width: 100).keyboardShortcut(.defaultAction)
        }.padding(.horizontal, LedgerLayout.detailInset).padding(.vertical, 16)
    }
}

struct LedgerDetailSheet<Content: View>: View {
    let title: String
    var note = ""
    var width: CGFloat = 560
    var height: CGFloat = 620
    let close: () -> Void
    @ViewBuilder let content: Content

    var body: some View {
        VStack(spacing: 0) {
            LedgerDetailHeader(title, close: close)
            LedgerRule()
            ScrollView { content.padding(LedgerLayout.detailInset).frame(maxWidth: .infinity, alignment: .leading) }
            LedgerRule()
            LedgerDetailFooter(note: note, close: close)
        }.frame(width: width, height: height).background(WarmLedger.window).foregroundStyle(WarmLedger.ink)
            .disclosureGroupStyle(LedgerDisclosureStyle())
    }
}
