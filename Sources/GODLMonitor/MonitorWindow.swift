import AppKit
import Charts
import SwiftUI
import GODLCore

enum Destination: String, CaseIterable, Identifiable {
    case overview = "Overview", activity = "Activity", goals = "Goals", strategy = "Strategy", settings = "Settings"
    var id: String { rawValue }
    var shortcut: KeyEquivalent {
        switch self { case .overview: "1"; case .activity: "2"; case .strategy: "3"; case .settings: "4"; case .goals: "5" }
    }
    var symbol: String {
        switch self {
        case .overview: "house.fill"
        case .activity: "list.bullet"
        case .goals: "target"
        case .strategy: "chart.bar.fill"
        case .settings: "gearshape.fill"
        }
    }
}

@MainActor
final class MonitorNavigation: ObservableObject {
    @Published var destination: Destination = .overview
}

struct MonitorWindow: View {
    @ObservedObject var controller: MonitorController
    @ObservedObject var navigation: MonitorNavigation
    private var destination: Destination {
        get { navigation.destination }
        nonmutating set { navigation.destination = newValue }
    }
    @State private var activeSheet: MonitorDetail?
    @State private var showingTechnicalDetails = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Namespace private var sidebarSelection

    private enum MonitorDetail: Identifiable {
        case observation(BalancePoint), acquisition(AcquisitionPeriod), reward(RewardKind), earnings, notifications, goal(MonitorGoal)
        var id: String {
            switch self { case .observation(let point): "observation-\(point.id)"; case .acquisition: "acquisition"; case .reward(let kind): "reward-\(kind.id)"; case .earnings: "earnings"; case .notifications: "notifications"; case .goal(let goal): "goal-\(goal.id)" }
        }
    }

    var body: some View {
        if controller.needsSetup {
            WalletSetupView(controller: controller)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(WarmLedger.window).frame(minWidth: 900, minHeight: 680)
        } else { monitorBody }
    }

    private var monitorBody: some View {
        HStack(spacing: 0) {
            sidebar
            GeometryReader { pane in
                VStack(spacing: 0) {
                    WarmLedger.chrome.opacity(0.55).frame(height: 46)
                        .overlay(alignment: .bottom) { LedgerRule().opacity(0.6) }
                    ScrollView {
                        VStack(alignment: .leading, spacing: 0) {
                            header
                            if let error = controller.errorMessage {
                                ObservationFailureNotice(message: error, hasObservation: controller.monitor != nil)
                                    .padding(.top, 14)
                            }
                            switch destination {
                            case .overview: overview(contentWidth: pane.size.width - LedgerLayout.pageInset * 2).padding(.top, LedgerLayout.sectionGap)
                            case .activity: activity(contentWidth: pane.size.width - LedgerLayout.pageInset * 2).padding(.top, LedgerLayout.sectionGap)
                            case .goals: GoalsPage(goals: controller.goals, monitor: controller.monitor).padding(.top, LedgerLayout.sectionGap)
                            case .strategy: strategy.padding(.top, LedgerLayout.sectionGap)
                            case .settings: settings.padding(.top, LedgerLayout.sectionGap)
                            }
                        }.padding(.horizontal, LedgerLayout.pageInset).padding(.top, 20).padding(.bottom, 24)
                    }.id(destination).transition(.opacity)
                }
                .background(LinearGradient(colors: [WarmLedger.paperTop, WarmLedger.paperBottom], startPoint: .top, endPoint: .bottom))
            }
        }
        .ignoresSafeArea(edges: .top)
        .foregroundStyle(WarmLedger.ink)
        .frame(minWidth: 900, minHeight: 680)
        .disclosureGroupStyle(LedgerDisclosureStyle())
        .animation(reduceMotion ? nil : LedgerMotion.navigation, value: destination)
        .sheet(item: $activeSheet) { detail in
            switch detail {
            case .observation(let point): observationDetail(point)
            case .acquisition(let period): AcquisitionPeriodDetail(period: controller.monitor?.acquisitionPeriod ?? period, accounting: controller.monitor?.accounting)
            case .reward(let kind): RewardDetailSheet(kind: kind, monitor: controller.monitor)
            case .earnings: EarningsDetailSheet(earnings: controller.monitor?.earnings)
            case .goal(let goal):
                GoalEditorView(goals: controller.goals, original: goal, compact: false) { activeSheet = nil }
                    .frame(width: 560, height: 620)
            case .notifications:
                NotificationInbox(notifications: controller.notifications, compact: false) { activeSheet = nil }
                    .frame(width: 560, height: 620).background(WarmLedger.window)
            }
        }
    }

    private var sidebar: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 5) {
                GODLWordmark(width: 132).frame(height: 53, alignment: .leading)
                ReadOnlyBadge()
            }.padding(.horizontal, 9).padding(.top, 62)
            VStack(spacing: 4) {
                ForEach(Destination.allCases) { page in
                    Button { destination = page } label: {
                        HStack(spacing: 14) {
                            Image(systemName: page.symbol)
                                .font(.system(size: 18, weight: .semibold))
                                .foregroundStyle(WarmLedger.icon).frame(width: 22)
                            Text(page.rawValue).font(.system(size: 14))
                            Spacer(minLength: 0)
                        }.padding(.horizontal, 13).frame(height: 42)
                            .background {
                                if destination == page {
                                    RoundedRectangle(cornerRadius: 8).fill(WarmLedger.selection)
                                        .matchedGeometryEffect(id: "sidebar-selection", in: sidebarSelection)
                                }
                            }
                            .contentShape(Rectangle())
                    }.buttonStyle(LedgerRowButtonStyle()).ledgerFocusRing()
                        .help("\(page.rawValue) · ⌘\(String(page.shortcut.character))")
                        .accessibilityAddTraits(destination == page ? .isSelected : [])
                }
            }.padding(.top, LedgerLayout.sectionGap)
            Spacer(minLength: 24)
            VStack(alignment: .leading, spacing: 10) {
                if let monitor = controller.monitor, case .observed(let refined) = monitor.balances.refinedGodl {
                    HStack(alignment: .firstTextBaseline, spacing: 5) {
                        Text("Refined ·")
                        GODLAmount(value: amountText(refined.display, places: 4), iconSize: 10)
                    }.accessibilityElement(children: .combine)
                        .help("Refined GODL is separate from your unrefined accumulation goal.")
                }
            }.font(.system(size: 11.5)).lineSpacing(2).foregroundStyle(WarmLedger.tertiary)
                .padding(.horizontal, 9).padding(.bottom, 30)
        }
        .padding(.horizontal, 15).frame(width: 188)
        .background(LinearGradient(colors: [WarmLedger.sidebar, WarmLedger.sidebarBottom], startPoint: .top, endPoint: .bottom))
        .overlay(alignment: .trailing) { Rectangle().fill(WarmLedger.divider.opacity(0.65)).frame(width: 1) }
    }

    private var header: some View {
        HStack(spacing: 16) {
            Text(destination.rawValue).font(LedgerType.title)
                .frame(maxWidth: .infinity, alignment: .leading)
            ObservationStatus(controller: controller, compact: true).fixedSize()
            NotificationBell(notifications: controller.notifications) { activeSheet = .notifications }
            Button { controller.refresh() } label: {
                HStack(spacing: 8) {
                    RefreshSymbol(refreshing: controller.isRefreshing)
                    Text(controller.isRefreshing ? "Refreshing…" : "Refresh")
                }
            }.buttonStyle(LedgerButtonStyle(minWidth: 136)).ledgerFocusRing()
                .disabled(controller.isRefreshing).help("Read finalized accounts from Solana RPC")
        }.frame(minHeight: 40)
    }

    private func overview(contentWidth: CGFloat) -> some View {
        VStack(alignment: .leading, spacing: LedgerLayout.sectionGap) {
            EarningsSection(earnings: controller.monitor?.earnings) { activeSheet = .earnings }
                .ledgerPanel()
            HStack(spacing: LedgerLayout.cardGap) {
                RewardSummaryButton(kind: .refined, monitor: controller.monitor) { activeSheet = .reward(.refined) }
                RewardSummaryButton(kind: .gold, monitor: controller.monitor) { activeSheet = .reward(.gold) }
            }
            HStack(alignment: .top, spacing: LedgerLayout.cardGap) {
                GoalsSummary(goals: controller.goals, monitor: controller.monitor,
                             manage: { destination = .goals }, edit: { activeSheet = .goal($0) })
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading).ledgerPanel()
                acquisitionSummary
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading).ledgerPanel()
            }.fixedSize(horizontal: false, vertical: true)
            DisclosureGroup {
                BalanceChart(points: controller.balancePoints, observedAt: controller.monitor?.provenance.observedAt)
                    .padding(.top, 12)
            } label: {
                Text("Balance history").font(LedgerType.section).frame(minHeight: 40)
            }.tint(WarmLedger.strongBrass)
            LedgerRule()
            VStack(spacing: 12) {
                HStack {
                    Text("Recent observations").font(LedgerType.section)
                    Spacer()
                    Button("View all") { destination = .activity }
                        .font(LedgerType.meta).padding(.horizontal, 10).frame(minHeight: 40)
                        .buttonStyle(LedgerRowButtonStyle()).ledgerFocusRing()
                }
                observationRows(Array(controller.balancePoints.suffix(4).reversed()), compact: contentWidth < 760)
            }
        }
    }

    private var acquisitionSummary: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Mining cost").font(LedgerType.section)
                Spacer()
                if let period = controller.monitor?.acquisitionPeriod {
                    Button { activeSheet = .acquisition(period) } label: { Image(systemName: "chevron.right") }
                        .buttonStyle(LedgerIconButtonStyle()).ledgerFocusRing()
                        .accessibilityLabel("Open cost breakdown")
                }
            }.frame(height: 32)
            Text(controller.monitor?.acquisitionPeriod?.approximateCostText ?? "—")
                .font(LedgerType.cost).monospacedDigit()
            Text("Net cost / GODL").font(LedgerType.meta).foregroundStyle(WarmLedger.secondary)
            if let period = controller.monitor?.acquisitionPeriod {
                Text(period.dateRangeText).font(LedgerType.caption).foregroundStyle(WarmLedger.tertiary)
                LedgerRule()
                HStack {
                    Text("Net spend").foregroundStyle(WarmLedger.secondary)
                    Spacer()
                    Text(period.netSolText).monospacedDigit()
                }.font(LedgerType.meta).help(period.approximateSpendText + " · historical estimate")
            } else {
                Text("Cost history incomplete").font(LedgerType.caption).foregroundStyle(WarmLedger.tertiary)
            }
            Text(controller.accountingSummary).font(LedgerType.caption).foregroundStyle(WarmLedger.tertiary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func activity(contentWidth: CGFloat) -> some View {
        VStack(alignment: .leading, spacing: LedgerLayout.sectionGap) {
            Text("Observed balances · every 30 seconds")
                .help("Balance changes can include rewards or claims; they are not automatically mining income. Open a row for its exact amount and source.")
                .font(LedgerType.meta).foregroundStyle(WarmLedger.tertiary)
            LedgerRule()
            observationRows(Array(controller.balancePoints.reversed()), compact: contentWidth < 760)
        }
    }

    private func observationRows(_ rows: [BalancePoint], compact: Bool) -> some View {
        LazyVStack(spacing: 0) {
            HStack {
                Text("Observed at")
                Spacer()
                if !compact { Text("Source").frame(width: 180, alignment: .leading) }
                Text("Unrefined GODL").frame(width: 158, alignment: .trailing).padding(.trailing, 24)
            }.font(LedgerType.meta).foregroundStyle(WarmLedger.secondary)
                .padding(.horizontal, 10).padding(.bottom, 10)
            LedgerRule()
            if rows.isEmpty {
                Text("The first observation will appear here after a successful refresh.")
                    .font(.system(size: 13)).foregroundStyle(WarmLedger.tertiary)
                    .frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 26)
            }
            ForEach(rows) { point in
                Button { activeSheet = .observation(point) } label: {
                    if compact {
                        HStack(spacing: 14) {
                            VStack(alignment: .leading, spacing: 6) {
                                Text(ledgerDate(point.date, format: "MMM d, yyyy · HH:mm:ss"))
                                    .font(LedgerType.body)
                                Text("Finalized · \(point.slot)").foregroundStyle(WarmLedger.tertiary)
                                    .font(LedgerType.caption)
                            }
                            Spacer(minLength: 0)
                            GODLAmount(value: amountText(point.raw), iconSize: 11)
                                .font(LedgerType.body).fontWeight(.medium)
                            Image(systemName: "chevron.right").font(LedgerType.caption)
                                .foregroundStyle(WarmLedger.icon).accessibilityHidden(true)
                        }.padding(.horizontal, 10).padding(.vertical, 11).contentShape(Rectangle())
                    } else {
                    HStack(spacing: 16) {
                        Text(ledgerDate(point.date, format: "MMM d, yyyy · HH:mm:ss"))
                            .foregroundStyle(WarmLedger.secondary).monospacedDigit()
                            .frame(maxWidth: .infinity, alignment: .leading)
                        Text("Finalized · \(point.slot)").foregroundStyle(WarmLedger.tertiary)
                            .frame(width: 180, alignment: .leading).lineLimit(1)
                        GODLAmount(value: amountText(point.raw, places: 4), iconSize: 11, minimumScale: 0.6)
                            .fontWeight(.medium).frame(width: 158, alignment: .trailing)
                        Image(systemName: "chevron.right").font(LedgerType.caption)
                            .foregroundStyle(WarmLedger.icon).accessibilityHidden(true).frame(width: 8)
                    }.font(LedgerType.meta).padding(.horizontal, 10).frame(height: 46).contentShape(Rectangle())
                    }
                }.buttonStyle(LedgerRowButtonStyle()).ledgerFocusRing()
                    .help("Observed unrefined balance, not earned GODL. Open for exact precision and provenance.")
                LedgerRule()
            }
        }
    }

    private var strategy: some View {
        VStack(alignment: .leading, spacing: LedgerLayout.sectionGap) {
            HStack {
                Text("Mining controls").font(LedgerType.section)
                Spacer()
                ReadOnlyBadge(compact: true)
            }
            Text("Your external miner runs independently.")
                .font(LedgerType.meta).foregroundStyle(WarmLedger.tertiary)
            LedgerRule()
            detailRow("Execution", "Not connected")
            detailRow("Selection model", "Deterministic payoff comparison")
            detailRow("Decision history", "Not connected")
            detailRow("Spending limits", "Not configured")
            LedgerRule()
            DisclosureGroup {
                Text("Current deposits, reward rules and transaction costs can inform a candidate. Later deposits and timing can change the result; previous winning squares do not predict the next winner. This monitor does not submit, pause or change mining transactions.")
                    .font(LedgerType.meta).foregroundStyle(WarmLedger.secondary)
                    .fixedSize(horizontal: false, vertical: true).padding(.top, 12)
            } label: {
                Text("Strategy assumptions").font(LedgerType.body).frame(minHeight: 40)
            }.tint(WarmLedger.strongBrass)
        }
    }

    private var settings: some View {
        VStack(alignment: .leading, spacing: 24) {
            WalletSetupView(controller: controller, settings: true)
            LedgerRule()
            RewardNotificationSettings(notifications: controller.notifications)
            LedgerRule()
            VStack(alignment: .leading, spacing: 18) {
                Text("Updates").font(LedgerType.section)
                detailRow("Balances & rewards", "Every 30 seconds")
                HStack(alignment: .center, spacing: 16) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Mining costs").font(LedgerType.body)
                        Text(controller.accountingSummary).font(LedgerType.meta).foregroundStyle(WarmLedger.secondary)
                        Text(controller.canReconcileCosts
                            ? "Every 5 minutes · after settlement"
                            : "Balances and goals work immediately. Net accounting needs a separately verified history anchor.")
                            .font(LedgerType.caption).foregroundStyle(WarmLedger.tertiary)
                    }
                    Spacer()
                    Button { controller.reconcileCosts() } label: {
                        HStack(spacing: 8) {
                            if controller.isReconciling { RefreshSymbol(refreshing: true) }
                            Text(controller.isReconciling ? "Checking…" : "Check costs")
                        }
                    }.buttonStyle(LedgerButtonStyle(minWidth: 136)).ledgerFocusRing()
                        .disabled(controller.isReconciling || !controller.canReconcileCosts)
                }
                Text("Updates continue with this window closed. Sleep pauses them until your Mac wakes.")
                    .font(LedgerType.meta).foregroundStyle(WarmLedger.tertiary).fixedSize(horizontal: false, vertical: true)
            }
            LedgerRule()
            VStack(alignment: .leading, spacing: 18) {
                Text("Observation source").font(LedgerType.section)
                detailRow("Provider", "\(controller.rpcProvider) · finalized")
                detailRow("Public wallet", controller.monitor?.wallet ?? controller.connection?.wallet ?? "Not configured")
                Button("Manage goals") { destination = .goals }
                    .buttonStyle(LedgerButtonStyle()).ledgerFocusRing()
            }
            DisclosureGroup(isExpanded: $showingTechnicalDetails) {
                VStack(alignment: .leading, spacing: 18) {
                    if let monitor = controller.monitor {
                        detailRow("Finalized slot", monitor.provenance.slot)
                        detailRow("Program", monitor.provenance.programAddress)
                        detailRow("Decoder source", monitor.provenance.sourceCommit)
                    }
                    Text("This monitor observes public accounts. Your external miner runs independently; transaction controls and hosting are not connected here.")
                        .font(LedgerType.meta).foregroundStyle(WarmLedger.tertiary)
                    Button("Show local observations") { NSWorkspace.shared.activateFileViewerSelecting([controller.databaseURL]) }
                        .buttonStyle(LedgerButtonStyle()).ledgerFocusRing()
                }.padding(.top, 12)
            } label: {
                Text("Technical details").font(LedgerType.body).frame(maxWidth: .infinity, minHeight: 40, alignment: .leading)
            }.tint(WarmLedger.strongBrass)
                .animation(reduceMotion ? nil : LedgerMotion.navigation, value: showingTechnicalDetails)
            LedgerRule()
            HStack {
                Text("Quitting stops local updates and notifications.")
                    .font(LedgerType.caption).foregroundStyle(WarmLedger.tertiary)
                Spacer()
                Button { controller.stop(); NSApplication.shared.terminate(nil) } label: {
                    Text("Quit monitor").font(LedgerType.body).padding(.horizontal, 14).frame(minHeight: 40)
                }.buttonStyle(LedgerRowButtonStyle()).ledgerFocusRing()
            }
        }
    }

    private func detailRow(_ label: String, _ value: String, godl: Bool = false) -> some View {
        HStack(alignment: .top, spacing: 24) {
            Text(label).frame(width: 160, alignment: .leading).foregroundStyle(WarmLedger.tertiary)
            Group {
                if godl { GODLAmount(value: value, iconSize: 12) }
                else { Text(value) }
            }.textSelection(.enabled).frame(maxWidth: .infinity, alignment: .leading)
        }.font(LedgerType.body)
    }
    private func observationDetail(_ point: BalancePoint) -> some View {
        LedgerDetailSheet(title: "Balance observation", note: "Finalized account data", height: 380, close: { activeSheet = nil }) {
            VStack(alignment: .leading, spacing: LedgerLayout.sectionGap) {
                detailRow("Observed", point.date.formatted(date: .complete, time: .standard))
                detailRow("Finalized slot", point.slot)
                detailRow("Unrefined GODL", point.raw, godl: true)
                Text("Balance changes can include rewards or claims; they are not automatically mining income.")
                    .font(LedgerType.meta).foregroundStyle(WarmLedger.tertiary)
            }
        }
    }

}

private struct BalanceChart: View {
    let points: [BalancePoint]
    let observedAt: Date?
    @State private var days = 7
    @State private var periodHover = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private func changeText(_ change: Decimal?) -> String {
        guard let change else { return "—" }
        return (change > 0 ? "+" : "") + amountText(NSDecimalNumber(decimal: change).stringValue)
    }

    var body: some View {
        // Derive once per render from dates parsed once per successful observation.
        let plot = BalancePlot(points: points, days: days, now: Date())
        let series = plot.renderedPoints
        let domain = plot.domain
        let markers = plot.markedIDs
        let lastID = series.last?.id
        let spanDays = (series.last?.date.timeIntervalSince(series.first?.date ?? Date()) ?? 0) / 86_400
        let dayStride = spanDays.isFinite ? Int(min(365_000, max(1, ceil(spanDays / 5)))) : 1
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Menu {
                    Picker("Observation period", selection: $days) {
                        Text("Last 7 days").tag(7); Text("Last 30 days").tag(30); Text("All observations").tag(0)
                    }
                } label: {
                    Text("Observed balance \(days == 0 ? "(all time)" : "(last \(days) days)")")
                        .font(.system(size: 15, weight: .medium))
                        .padding(.horizontal, 10).frame(minHeight: 40)
                }.menuStyle(.borderlessButton).menuIndicator(.visible)
                    .tint(WarmLedger.ink).foregroundStyle(WarmLedger.ink).fixedSize()
                    .background(periodHover ? WarmLedger.selection.opacity(0.35) : .clear, in: RoundedRectangle(cornerRadius: 8))
                    .onHover { periodHover = $0 }.ledgerFocusRing()
                    .animation(reduceMotion ? nil : LedgerMotion.feedback, value: periodHover)
                    .help("Choose the balance observation period")
                Spacer()
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text("Change")
                    GODLAmount(value: changeText(plot.change), iconSize: 11)
                }.font(.system(size: 13)).foregroundStyle(WarmLedger.secondary)
                    .accessibilityElement(children: .combine)
                    .help("Change in observed unrefined principal during the selected coverage. It may include claims or other account changes; it is not earned income.")
            }.frame(minHeight: 40)
            if series.count < 2 {
                VStack(alignment: .leading, spacing: 10) {
                    if let first = series.first {
                        HStack(spacing: 10) {
                            Circle().fill(WarmLedger.chart).frame(width: 7, height: 7)
                            GODLAmount(value: amountText(first.raw, places: 4), iconSize: 11)
                            Text("at \(ledgerDate(first.date, format: "HH:mm"))").monospacedDigit()
                        }
                        Text("The next observation will begin your balance history.").foregroundStyle(WarmLedger.tertiary)
                    } else { Text("Waiting for balance observations.").foregroundStyle(WarmLedger.tertiary) }
                }.font(.system(size: 13)).frame(maxWidth: .infinity, minHeight: 154, alignment: .leading)
                    .padding(.top, 8)
            } else {
                Chart(series) { point in
                    AreaMark(x: .value("Observed", point.date),
                             yStart: .value("Display baseline", domain.lowerBound),
                             yEnd: .value("Unrefined GODL", point.value))
                        .interpolationMethod(.stepEnd)
                        .foregroundStyle(LinearGradient(colors: [WarmLedger.brass.opacity(0.23), WarmLedger.brass.opacity(0.04)], startPoint: .top, endPoint: .bottom))
                        .accessibilityHidden(true)
                    LineMark(x: .value("Observed", point.date), y: .value("Unrefined GODL", point.value))
                        .interpolationMethod(.stepEnd).foregroundStyle(WarmLedger.chart)
                        .lineStyle(StrokeStyle(lineWidth: 1.6))
                    if markers.contains(point.id) {
                        PointMark(x: .value("Observed", point.date), y: .value("Unrefined GODL", point.value))
                            .foregroundStyle(WarmLedger.icon)
                            .symbol {
                                if point.id == lastID {
                                    Circle().fill(WarmLedger.icon).frame(width: 9, height: 9)
                                } else {
                                    Circle().fill(WarmLedger.window).overlay(Circle().strokeBorder(WarmLedger.icon, lineWidth: 1.3)).frame(width: 4, height: 4)
                                }
                            }
                            .accessibilityHidden(true)
                    }
                }
                .chartYScale(domain: domain)
                .chartXScale(range: .plotDimension(startPadding: 24, endPadding: 32))
                .chartXAxis {
                    AxisMarks(values: plot.longSpan ? .stride(by: .day, count: dayStride) : .automatic(desiredCount: 5)) { value in
                        AxisGridLine(stroke: StrokeStyle(lineWidth: 0.5)).foregroundStyle(WarmLedger.grid)
                        AxisValueLabel(collisionResolution: .greedy) {
                            if let date = value.as(Date.self) {
                                Text(ledgerDate(date, format: plot.longSpan ? "MMM d" : "HH:mm"))
                                    .font(.system(size: 11.5)).foregroundStyle(WarmLedger.tertiary)
                            }
                        }
                    }
                }
                .chartYAxis {
                    AxisMarks(position: .leading, values: .automatic(desiredCount: 4)) { value in
                        AxisGridLine(stroke: StrokeStyle(lineWidth: 0.5)).foregroundStyle(WarmLedger.grid)
                        AxisValueLabel {
                            if let amount = value.as(Double.self) {
                                GODLAmount(value: amountText(String(amount)), iconSize: 9, spacing: 3)
                                    .font(.system(size: 11.5)).foregroundStyle(WarmLedger.tertiary)
                            }
                        }
                    }
                }
                .frame(height: 154).padding(.top, 8)
                .accessibilityLabel("Observed unrefined GODL balances. Exact values are in Activity.")
            }
            if let first = series.first, let observedAt {
                Text("Coverage from \(ledgerDate(first.date, format: "MMM d, HH:mm")) · Updated \(ledgerDate(observedAt, format: "HH:mm:ss")) · finalized")
                    .font(.system(size: 11)).foregroundStyle(WarmLedger.tertiary).padding(.top, 8)
                    .help("Balance observations can include checkpoints and claims. They do not by themselves establish earned GODL.")
            }
        }
    }
}

struct MonitorNavigationCommands: Commands {
    @ObservedObject var navigation: MonitorNavigation
    let revealWindow: () -> Void
    var body: some Commands {
        CommandMenu("Navigate") {
            ForEach(Destination.allCases) { page in
                Button(page.rawValue) {
                    navigation.destination = page
                    revealWindow()
                }.keyboardShortcut(page.shortcut, modifiers: .command)
            }
        }
    }
}
