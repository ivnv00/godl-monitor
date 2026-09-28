import SwiftUI
import GODLCore

// Hallmark · Warm Ledger goals · P5 H5 E4 S5 R5 V4
// Native controls retain hover, focus, pressed and disabled feedback; forms expose errors.
struct GoalDraft: Identifiable {
    let id = UUID()
    let goal: MonitorGoal?
}

struct GoalsSummary: View {
    @ObservedObject var goals: GoalsController
    let monitor: MonitorView?
    var compact = false
    let manage: () -> Void
    let edit: (MonitorGoal) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(compact && goals.pinned.count == 1 ? goals.pinned[0].title : "Goals").font(LedgerType.section).lineLimit(1)
                    .help(compact && goals.pinned.count == 1 ? goals.pinned[0].title : "Goals")
                Spacer()
                Button(action: manage) {
                    Text("Manage").font(LedgerType.meta).padding(.horizontal, 8).frame(height: 40)
                }
                    .buttonStyle(LedgerRowButtonStyle()).ledgerFocusRing()
            }
            if let error = goals.error {
                Text(error).font(LedgerType.caption).foregroundStyle(WarmLedger.caution)
                    .fixedSize(horizontal: false, vertical: true)
            } else if goals.pinned.isEmpty {
                Button(action: manage) {
                    Label(goals.active.isEmpty ? "Add a goal" : "Choose widget goals", systemImage: "plus")
                        .font(LedgerType.body).frame(maxWidth: .infinity, minHeight: 68)
                }.buttonStyle(LedgerRowButtonStyle()).ledgerFocusRing().disabled(!goals.canEdit)
            } else {
                TimelineView(.periodic(from: .now, by: 30)) { clock in
                    // The window already owns page scrolling. Only multiple widget
                    // goals need a bounded viewport; a single goal is ordinary content.
                    if compact && goals.pinned.count > 1 {
                        ScrollView { pinnedGoals(at: clock.date) }
                            .frame(maxHeight: 190)
                    } else {
                        pinnedGoals(at: clock.date).fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
        }
    }

    private func pinnedGoals(at date: Date) -> some View {
        VStack(spacing: 10) {
            ForEach(goals.pinned) { goal in
                let progress = goal.progress(in: monitor, now: date)
                Button { edit(goal) } label: {
                    GoalVisualization(goal: goal, progress: progress, showsTitle: !compact || goals.pinned.count > 1)
                        .padding(compact ? 0 : 10).frame(maxWidth: .infinity, alignment: .leading).contentShape(Rectangle())
                }.buttonStyle(LedgerRowButtonStyle()).ledgerFocusRing()
                    .help(progress.note + " · Edit goal")
                    .accessibilityLabel("\(goal.title), current \(progress.current ?? "unavailable") \(goal.metric.symbol), \(progress.percent.map { amountText($0) } ?? "unavailable") percent. Edit goal")
            }
        }.padding(3)
    }
}

struct GoalsPage: View {
    @ObservedObject var goals: GoalsController
    let monitor: MonitorView?
    @State private var draft: GoalDraft?
    var body: some View {
        GoalListView(goals: goals, monitor: monitor) { draft = GoalDraft(goal: $0) }
            .sheet(item: $draft) { item in
                GoalEditorView(goals: goals, original: item.goal, compact: false) { draft = nil }
                    .frame(width: 560, height: 620)
            }
    }
}

struct GoalListView: View {
    @ObservedObject var goals: GoalsController
    let monitor: MonitorView?
    var compact = false
    let edit: (MonitorGoal?) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Text("\(goals.active.count) active · \(goals.pinned.count) in widget")
                    .font(LedgerType.meta).foregroundStyle(WarmLedger.tertiary)
                Spacer(minLength: 8)
                Button { edit(nil) } label: { Label("Add goal", systemImage: "plus") }
                    .buttonStyle(LedgerButtonStyle()).ledgerFocusRing().disabled(!goals.canEdit)
            }
            if let error = goals.error {
                Text(error).font(LedgerType.meta).foregroundStyle(WarmLedger.caution)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if !goals.canEdit && goals.error == nil {
                Text("Waiting for your wallet observation").font(LedgerType.body).foregroundStyle(WarmLedger.tertiary)
            } else if goals.active.isEmpty {
                VStack(spacing: 12) {
                    Image(systemName: "target").font(.system(size: 32)).foregroundStyle(WarmLedger.brass)
                    Text("What’s your next target?").font(LedgerType.section)
                    Text("Choose a balance, USD value or daily earnings goal.")
                        .font(LedgerType.meta).foregroundStyle(WarmLedger.tertiary).multilineTextAlignment(.center)
                }.frame(maxWidth: .infinity).padding(.vertical, 24)
            }
            TimelineView(.periodic(from: .now, by: 30)) { clock in
                VStack(spacing: 12) {
                    ForEach(goals.active) { goal in
                        tile(goal, now: clock.date)
                    }
                }
            }
            if !goals.archived.isEmpty {
                DisclosureGroup("Archived · \(goals.archived.count)") {
                    VStack(spacing: 10) {
                        ForEach(goals.archived) { goal in
                            HStack {
                                Text(goal.title).font(LedgerType.meta)
                                Spacer()
                                Button("Restore") { goals.archive(goal) }
                                    .buttonStyle(LedgerButtonStyle()).ledgerFocusRing().disabled(!goals.canEdit)
                            }
                        }
                    }.padding(.top, 8)
                }.font(LedgerType.body)
            }
        }.disclosureGroupStyle(LedgerDisclosureStyle())
    }

    private func tile(_ goal: MonitorGoal, now: Date) -> some View {
        let progress = goal.progress(in: monitor, now: now)
        return VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Button { edit(goal) } label: {
                    HStack(spacing: 8) {
                        VStack(alignment: .leading, spacing: 3) {
                            Text(goal.title).font(LedgerType.section).lineLimit(2)
                            if goal.title.localizedCaseInsensitiveCompare(goal.metric.title) != .orderedSame {
                                Text(goal.metric.title).font(LedgerType.caption).foregroundStyle(WarmLedger.tertiary)
                            }
                        }
                        Spacer(minLength: 0)
                    }.frame(maxWidth: .infinity, minHeight: 48, alignment: .leading).contentShape(Rectangle())
                }.buttonStyle(LedgerRowButtonStyle()).ledgerFocusRing().disabled(!goals.canEdit)
                    .accessibilityLabel("Edit \(goal.title)").help("Edit \(goal.title)")
                Button { goals.pin(goal) } label: {
                    Image(systemName: goal.showsInWidget ? "pin.fill" : "pin")
                        .foregroundStyle(goal.showsInWidget ? WarmLedger.strongBrass : WarmLedger.tertiary)
                }.buttonStyle(LedgerIconButtonStyle()).ledgerFocusRing().disabled(!goals.canEdit)
                    .help(goal.showsInWidget ? "Remove from widget" : "Show in widget")
                    .accessibilityLabel(goal.showsInWidget ? "Remove \(goal.title) from widget" : "Show \(goal.title) in widget")
                Menu {
                    Button("Edit") { edit(goal) }
                    Button("Move up") { goals.move(goal, by: -1) }.disabled(goals.active.first?.id == goal.id)
                    Button("Move down") { goals.move(goal, by: 1) }.disabled(goals.active.last?.id == goal.id)
                    Divider()
                    Button("Archive") { goals.archive(goal) }
                } label: { Image(systemName: "ellipsis").frame(width: 40, height: 40) }
                    .ledgerMenuControl()
                    .disabled(!goals.canEdit).accessibilityLabel("Actions for \(goal.title)")
            }
            GoalVisualization(goal: goal, progress: progress, showsTitle: false)
        }.ledgerPanel()
    }
}

struct GoalEditorView: View {
    @ObservedObject var goals: GoalsController
    let original: MonitorGoal?
    let compact: Bool
    let close: () -> Void
    @State private var title: String
    @State private var metric: GoalMetric
    @State private var target: String
    @State private var pinned: Bool
    @State private var visualStyle: GoalVisualStyle
    @State private var validationError: String?
    @State private var invalidField: Field?
    @FocusState private var focusedField: Field?
    private enum Field { case title, target }

    init(goals: GoalsController, original: MonitorGoal?, compact: Bool, close: @escaping () -> Void) {
        self.goals = goals; self.original = original; self.compact = compact; self.close = close
        _title = State(initialValue: original?.title ?? "")
        _metric = State(initialValue: original?.metric ?? .unrefined)
        _target = State(initialValue: original?.target ?? "")
        _pinned = State(initialValue: original?.showsInWidget ?? true)
        _visualStyle = State(initialValue: original?.visualStyle ?? .roadmap)
    }

    var body: some View {
        VStack(spacing: 0) {
            LedgerDetailHeader(original == nil ? "New goal" : "Edit goal", compact: compact, back: compact, close: close)
            LedgerRule()
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    VStack(alignment: .leading, spacing: 6) {
                        fieldLabel("Name (optional)")
                        TextField("My next milestone", text: $title).focused($focusedField, equals: .title)
                            .textFieldStyle(.plain).padding(.horizontal, 12).frame(height: 44)
                            .ledgerFieldSurface(focused: focusedField == .title, invalid: invalidField == .title).accessibilityLabel("Goal name")
                            .onSubmit { focusedField = .target }
                        if invalidField == .title { errorMessage }
                    }
                    VStack(alignment: .leading, spacing: 6) {
                        fieldLabel("Track")
                        Picker("Track", selection: $metric) {
                            ForEach(GoalMetric.allCases, id: \.self) { Text($0.title).tag($0) }
                        }.labelsHidden().frame(maxWidth: .infinity, minHeight: 40, alignment: .leading).accessibilityLabel("Goal type")
                    }
                    VStack(alignment: .leading, spacing: 6) {
                        fieldLabel("Target · \(metric.symbol)")
                        TextField(metric == .gold ? "0.01" : metric.isUSD ? "100.00" : "10000", text: $target)
                            .focused($focusedField, equals: .target)
                            .textFieldStyle(.plain).padding(.horizontal, 12).frame(height: 44)
                            .ledgerFieldSurface(focused: focusedField == .target, invalid: invalidField == .target).accessibilityLabel("Target in \(metric.symbol)")
                            .onSubmit(save)
                        if invalidField == .target { errorMessage }
                        Text(metric.explanation).font(LedgerType.caption).foregroundStyle(WarmLedger.tertiary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    VStack(alignment: .leading, spacing: 6) {
                        fieldLabel("Style")
                        HStack(spacing: 8) {
                            ForEach(GoalVisualStyle.allCases, id: \.self) { style in
                                Button { visualStyle = style } label: {
                                    GoalStylePreview(style: style, selected: visualStyle == style)
                                }
                                .buttonStyle(.plain).ledgerFocusRing()
                                .accessibilityLabel("\(style.title) goal style")
                                .accessibilityAddTraits(visualStyle == style ? .isSelected : [])
                            }
                        }
                    }
                    Toggle("Show in widget", isOn: $pinned).toggleStyle(.switch).font(LedgerType.body)
                    if invalidField == nil { errorMessage }
                }.padding(compact ? LedgerLayout.compactInset : LedgerLayout.detailInset)
            }
            LedgerRule()
            HStack(spacing: 12) {
                Button("Cancel", action: close).buttonStyle(LedgerButtonStyle(fillsWidth: true)).ledgerFocusRing()
                    .keyboardShortcut(.cancelAction)
                Button("Save goal", action: save).buttonStyle(LedgerButtonStyle(fillsWidth: true)).ledgerFocusRing()
                    .disabled(!goals.canEdit).keyboardShortcut(.defaultAction)
            }.padding(compact ? 16 : LedgerLayout.detailInset)
        }.background(WarmLedger.window).foregroundStyle(WarmLedger.ink)
            .onAppear { focusedField = .target }
            .onChange(of: title) { clearError(for: .title) }
            .onChange(of: target) { clearError(for: .target) }
            .onChange(of: metric) { clearError(for: .target) }
    }

    @ViewBuilder private var errorMessage: some View {
        if let validationError {
            Text(validationError).font(LedgerType.caption).foregroundStyle(WarmLedger.critical)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func clearError(for field: Field) {
        if invalidField == field { invalidField = nil; validationError = nil }
    }

    private func fieldLabel(_ text: String) -> some View { Text(text).font(LedgerType.meta).foregroundStyle(WarmLedger.secondary) }
    private func save() {
        guard goals.canEdit else { return }
        do {
            let value = try MonitorGoal(id: original?.id ?? UUID(),
                                       title: title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? metric.title : title,
                                       metric: metric, target: target, showsInWidget: pinned,
                                       isArchived: original?.isArchived ?? false, visualStyle: visualStyle)
            try goals.save(value)
            close()
        } catch {
            validationError = (error as? LocalizedError)?.errorDescription ?? "Couldn’t save this goal. Check the target and try again."
            switch error as? MonitorGoalError {
            case .emptyTitle, .titleTooLong: invalidField = .title
            case .invalidTarget, .tooPrecise, .targetTooLarge: invalidField = .target
            default: invalidField = nil
            }
            if let invalidField { focusedField = invalidField }
        }
    }
}
