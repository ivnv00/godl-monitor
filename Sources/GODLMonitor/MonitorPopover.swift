import AppKit
import SwiftUI
import GODLCore

// Hallmark · component: menu-bar monitor · theme: original C / Warm Ledger
// Native states: idle, hover, focus, pressed, disabled, refreshing, unavailable, failed.
struct MonitorPopover: View {
    @ObservedObject var controller: MonitorController
    let openOverview: () -> Void
    let close: () -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var showingNotifications = false
    @State private var showingCost = false
    @State private var showingEarnings = false
    @State private var showingReward: RewardKind?
    @State private var showingGoals = false
    @State private var goalDraft: GoalDraft?

    var body: some View {
        ZStack {
            if controller.needsSetup {
                ScrollView { WalletSetupView(controller: controller, compact: true) }
            } else if showingGoals {
                if let draft = goalDraft {
                    GoalEditorView(goals: controller.goals, original: draft.goal, compact: true) { goalDraft = nil }
                        .id(draft.id)
                } else {
                    VStack(spacing: 0) {
                        LedgerDetailHeader("Goals", compact: true, back: true, close: { showingGoals = false })
                        LedgerRule()
                        ScrollView {
                            GoalListView(goals: controller.goals, monitor: controller.monitor, compact: true) {
                                goalDraft = GoalDraft(goal: $0)
                            }.padding(LedgerLayout.compactInset)
                        }
                    }
                }
            } else if showingNotifications {
                NotificationInbox(notifications: controller.notifications) { showingNotifications = false }
                    .transition(pageTransition(forward: true))
            } else if showingEarnings {
                detailPage("Daily earnings", back: { showingEarnings = false }) {
                    PopoverDailyBreakdown(monitor: controller.monitor)
                }
            } else if let kind = showingReward {
                detailPage(kind.title, back: { showingReward = nil }) {
                    RewardBreakdown(kind: kind, monitor: controller.monitor)
                }
            } else if showingCost, let period = controller.monitor?.acquisitionPeriod {
                detailPage("Cost breakdown", back: { showingCost = false }) {
                    AcquisitionCostContent(period: period, accounting: controller.monitor?.accounting)
                }
            } else {
                summary.transition(pageTransition(forward: false))
            }
        }
        .frame(width: 360, height: 600)
        .scrollBounceBehavior(.basedOnSize)
        .disclosureGroupStyle(LedgerDisclosureStyle())
        .background(WarmLedger.popover).foregroundStyle(WarmLedger.ink)
        .animation(reduceMotion ? nil : LedgerMotion.navigation, value: showingCost)
        .animation(reduceMotion ? nil : LedgerMotion.navigation, value: showingReward)
        .animation(reduceMotion ? nil : LedgerMotion.navigation, value: showingEarnings)
        .animation(reduceMotion ? nil : LedgerMotion.navigation, value: showingNotifications)
        .onAppear { showingNotifications = false; showingCost = false; showingReward = nil; showingEarnings = false; showingGoals = false; goalDraft = nil }
        .onExitCommand(perform: dismissCurrentPage)
    }

    private func dismissCurrentPage() {
        if goalDraft != nil { goalDraft = nil }
        else if showingGoals { showingGoals = false }
        else if showingNotifications { showingNotifications = false }
        else if showingEarnings { showingEarnings = false }
        else if showingReward != nil { showingReward = nil }
        else if showingCost { showingCost = false }
        else { close() }
    }

    private func detailPage<Content: View>(_ title: String, back: @escaping () -> Void,
                                          @ViewBuilder content: () -> Content) -> some View {
        VStack(spacing: 0) {
            LedgerDetailHeader(title, compact: true, back: true, close: back)
            LedgerRule()
            ScrollView { content().padding(LedgerLayout.compactInset).frame(maxWidth: .infinity, alignment: .leading) }
        }.transition(pageTransition(forward: true))
    }

    private func pageTransition(forward: Bool) -> AnyTransition {
        reduceMotion ? .identity : .opacity.combined(with: .offset(x: forward ? 8 : -8))
    }

    private var summary: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                GODLWordmark(width: 78)
                Spacer()
                NotificationBell(notifications: controller.notifications) { showingNotifications = true }
                Menu {
                    Button("Open overview", action: openOverview).keyboardShortcut("o", modifiers: .command)
                    Button("Notifications") { showingNotifications = true }
                    Button("Daily earnings") { showingEarnings = true }
                    Button("Goals") { showingGoals = true }
                    if controller.monitor?.acquisitionPeriod != nil {
                        Button("Cost breakdown") { showingCost = true }
                    }
                    Button("Refresh now") { controller.refresh() }.disabled(controller.isRefreshing)
                    Divider()
                    Button("Quit GODL") { controller.stop(); NSApplication.shared.terminate(nil) }
                } label: {
                    Image(systemName: "ellipsis").font(.system(size: 15, weight: .medium))
                        .frame(width: 40, height: 40)
                }
                .ledgerMenuControl()
                .accessibilityLabel("Monitor actions").help("Monitor actions")
            }.frame(height: 40)

            PopoverEarningsSummary(monitor: controller.monitor,
                                settling: controller.monitor?.accounting?.state == "waiting", notifications: controller.notifications) { showingEarnings = true }
                .padding(.top, 12)
            HStack(spacing: 10) {
                PopoverRewardCard(kind: .refined, monitor: controller.monitor) { showingReward = .refined }
                PopoverRewardCard(kind: .gold, monitor: controller.monitor) { showingReward = .gold }
            }.padding(.top, 12)
            GoalsSummary(goals: controller.goals, monitor: controller.monitor, compact: true,
                         manage: { showingGoals = true }, edit: { goal in
                             goalDraft = GoalDraft(goal: goal); showingGoals = true
                         }).padding(.top, 8)
            Spacer(minLength: 10)
            LedgerRule()
            HStack(spacing: 8) {
                Circle().fill(controller.errorMessage != nil || controller.isStale ? WarmLedger.caution : WarmLedger.positive)
                    .frame(width: 6, height: 6).accessibilityHidden(true)
                Text(footerStatus).font(LedgerType.caption).foregroundStyle(WarmLedger.tertiary)
                    .lineLimit(1).help(controller.status + ". " + footnote + " " + controller.accountingSummary)
                Spacer(minLength: 0)
                Button { controller.refresh() } label: { RefreshSymbol(refreshing: controller.isRefreshing) }
                    .buttonStyle(LedgerIconButtonStyle()).ledgerFocusRing().disabled(controller.isRefreshing)
                    .accessibilityLabel(controller.isRefreshing ? "Refreshing observation" : "Refresh observation")
                Button(action: openOverview) {
                    HStack(spacing: 6) { Text("Overview"); Image(systemName: "arrow.up.right") }
                        .font(LedgerType.meta).padding(.horizontal, 8).frame(height: 40)
                }.buttonStyle(LedgerRowButtonStyle()).ledgerFocusRing().help("Open the full ledger")
            }.padding(.top, 8)
        }.padding(.horizontal, LedgerLayout.compactInset).padding(.top, 14).padding(.bottom, 12)
    }

    private var footerStatus: String {
        if controller.errorMessage != nil { return "Refresh failed" }
        if controller.monitor == nil { return controller.isRefreshing ? "Connecting…" : "No observation" }
        if controller.isStale { return "Observation stale" }
        return controller.monitor.map { "Updated " + ledgerDate($0.provenance.observedAt, format: "HH:mm") } ?? "Waiting…"
    }

    private var footnote: String {
        if controller.errorMessage != nil { return controller.monitor == nil ? "Try refreshing again." : "Showing the last observed balance." }
        guard let monitor = controller.monitor else { return "Waiting for finalized account data." }
        return "Updated \(ledgerDate(monitor.provenance.observedAt, format: "HH:mm:ss")) · finalized"
    }

}
