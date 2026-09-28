import AppKit
import SwiftUI
import GODLCore

// Matched directly to the owner-selected original C image on 24 September 2026.
enum WarmLedger {
    static let window = Color(hex: 0xF4F0E9)
    static let paperTop = Color(hex: 0xF7F2EC)
    static let paperBottom = Color(hex: 0xF0ECE4)
    static let chrome = Color(hex: 0xF0EAE1)
    static let popover = Color(hex: 0xF6F2EA)
    static let sidebar = Color(hex: 0xE3DCD3)
    static let sidebarBottom = Color(hex: 0xDCD5CA)
    static let ink = Color(hex: 0x2B241C)
    static let secondary = Color(hex: 0x4A4035)
    static let tertiary = Color(hex: 0x62584B)
    static let brass = Color(hex: 0x9F8045)
    static let strongBrass = Color(hex: 0x7A5F2C)
    static let goldTop = Color(hex: 0xD9B65E)
    static let goldFace = Color(hex: 0xAE8436)
    static let goldEdge = Color(hex: 0x86612B)
    static let icon = Color(hex: 0x6E5A3D)
    static let chart = Color(hex: 0x8F6F35)
    static let divider = Color(hex: 0xD8D0C4)
    static let grid = Color(hex: 0xE1DAD0)
    static let selection = Color(hex: 0xD2C9BC)
    static let track = Color(hex: 0xDCD4C9)
    static let control = Color(hex: 0xE7E0D5)
    static let controlBorder = Color(hex: 0xCFC5B6)
    static let positive = Color(hex: 0x3D6A43)
    static let caution = Color(hex: 0x8A5A17)
    static let critical = Color(hex: 0x983A2C)
    static let highContrastDivider = Color(hex: 0xB9AE9C)
}

// Native type roles keep compact surfaces readable without shrinking labels.
enum LedgerType {
    static let caption = Font.system(size: 11.5)
    static let meta = Font.system(size: 12.5)
    static let body = Font.system(size: 13.5)
    static let section = Font.system(size: 15, weight: .medium)
    static let value = Font.system(size: 19, weight: .medium)
    static let title = Font.system(size: 28, design: .serif)
    static let balance = Font.system(size: 48, design: .serif)
    static let cost = Font.system(size: 34, design: .serif)
}

enum LedgerMotion {
    static let feedback = Animation.easeOut(duration: 0.12)
    static let navigation = Animation.easeOut(duration: 0.18)
    static let value = Animation.easeOut(duration: 0.28)
}

private struct LedgerNumberMotion: ViewModifier {
    let value: String
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    func body(content: Content) -> some View {
        content.monospacedDigit()
            .contentTransition(reduceMotion ? .identity : .numericText())
            .animation(reduceMotion ? nil : LedgerMotion.value, value: value)
    }
}

private struct LedgerFocusRing: ViewModifier {
    @FocusState private var focused: Bool
    func body(content: Content) -> some View {
        content.focused($focused)
            .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(focused ? WarmLedger.strongBrass : .clear, lineWidth: 2))
            .focusEffectDisabled()
    }
}

extension View {
    func ledgerNumber(_ value: String) -> some View { modifier(LedgerNumberMotion(value: value)) }
    func ledgerFocusRing() -> some View { modifier(LedgerFocusRing()) }
    func ledgerMenuControl() -> some View { modifier(LedgerMenuControl()) }
}

private struct LedgerMenuControl: ViewModifier {
    @State private var hovering = false
    @Environment(\.isEnabled) private var enabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.colorSchemeContrast) private var contrast

    func body(content: Content) -> some View {
        content.menuStyle(.borderlessButton).menuIndicator(.hidden).fixedSize()
            .background(hovering && enabled ? WarmLedger.track : .clear, in: RoundedRectangle(cornerRadius: 8))
            .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(
                contrast == .increased ? WarmLedger.highContrastDivider : .clear, lineWidth: 1))
            .onHover { hovering = $0 }.ledgerFocusRing()
            .animation(reduceMotion ? nil : LedgerMotion.feedback, value: hovering)
    }
}

private extension Color {
    init(hex: UInt32) {
        self.init(.sRGB, red: Double((hex >> 16) & 255) / 255,
                  green: Double((hex >> 8) & 255) / 255, blue: Double(hex & 255) / 255, opacity: 1)
    }
}

func amountText(_ value: String, places: Int = 2) -> String {
    guard let decimal = Decimal(string: value, locale: Locale(identifier: "en_US_POSIX")) else { return "—" }
    let formatter = NumberFormatter()
    formatter.locale = Locale(identifier: "en_US")
    formatter.numberStyle = .decimal
    formatter.minimumFractionDigits = places
    formatter.maximumFractionDigits = places
    return formatter.string(from: NSDecimalNumber(decimal: decimal)) ?? "—"
}

func approximateUSDText(_ value: String, places: Int = 2) -> String {
    if value.hasPrefix("-") {
        return "≈−$\(amountText(String(value.dropFirst()), places: places))"
    }
    return "≈$\(amountText(value, places: places))"
}

extension MonitorView {
    var refinedText: String {
        if case .observed(let value) = balances.refinedGodl { return amountText(value.display, places: 4) }
        return "—"
    }
    var goldText: String {
        if case .observed(let value) = balances.claimableGold { return amountText(value.display, places: 6) }
        return "—"
    }

    var unrefinedText: String {
        if case .observed(let value) = balances.unrefinedGodl { return amountText(value.display) }
        return "—"
    }
    var exactUnrefinedText: String {
        if case .observed(let value) = balances.unrefinedGodl { return value.display }
        return "Miner account not found"
    }
    var progressText: String {
        if case .observed(let value) = goal { return amountText(value.progressPercent) + "%" }
        return "—"
    }
    var targetText: String {
        switch goal {
        case .observed(let value): amountText(value.targetGodl, places: 0)
        case .unavailable(let value): amountText(value.targetGodl, places: 0)
        }
    }
}

extension AcquisitionPeriod {
    private var startedDate: Date? { Self.parseDate(startedAt) }
    private var throughDate: Date? { Self.parseDate(throughAt) }

    var compactPeriodText: String {
        guard let startedDate, let throughDate else { return "Closed period" }
        let started = ledgerDate(startedDate, format: "MMM d, HH:mm")
        let throughFormat = Calendar.current.isDate(startedDate, inSameDayAs: throughDate) ? "HH:mm" : "MMM d, HH:mm"
        return "\(started)–\(ledgerDate(throughDate, format: throughFormat))"
    }

    var fullPeriodText: String {
        guard let startedDate, let throughDate else { return "\(startedAt) through \(throughAt)" }
        let endFormat = Calendar.current.isDate(startedDate, inSameDayAs: throughDate) ? "HH:mm:ss zzz" : "d MMM yyyy, HH:mm:ss zzz"
        return "\(ledgerDate(startedDate, format: "d MMM yyyy, HH:mm:ss"))–\(ledgerDate(throughDate, format: endFormat))"
    }

    var dateRangeText: String {
        guard let startedDate, let throughDate else { return "Closed period" }
        if Calendar.current.isDate(startedDate, inSameDayAs: throughDate) {
            return ledgerDate(startedDate, format: "MMM d")
        }
        return "\(ledgerDate(startedDate, format: "MMM d"))–\(ledgerDate(throughDate, format: "MMM d"))"
    }

    var netSolText: String { "\(amountText(netSpendSol, places: 6)) SOL" }
    var approximateCostText: String { approximateUSDText(netCostPerGodlUsd) }
    var approximateSpendText: String { approximateUSDText(netSpendUsd) }

    private static func parseDate(_ value: String) -> Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.date(from: value)
    }
}

struct AcquisitionPeriodDetail: View {
    let period: AcquisitionPeriod
    var accounting: AccountingStatus? = nil
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        LedgerDetailSheet(title: "Cost breakdown", note: "Historical estimate · USD", close: { dismiss() }) {
            AcquisitionCostContent(period: period, accounting: accounting)
        }
    }

}

/// Shared calculation body: a compact scrollable drill-in and the overview sheet.
struct AcquisitionCostContent: View {
    let period: AcquisitionPeriod
    var accounting: AccountingStatus? = nil
    @State private var showingNotes = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            VStack(alignment: .leading, spacing: 7) {
                Text(approximateUSDText(period.netCostPerGodlUsd, places: 5))
                    .font(LedgerType.balance).monospacedDigit()
                    .lineLimit(1).minimumScaleFactor(0.45)
                Text("Net cost per unrefined GODL").font(LedgerType.body).foregroundStyle(WarmLedger.secondary)
                Text(period.fullPeriodText).font(LedgerType.meta).foregroundStyle(WarmLedger.tertiary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            LedgerRule()
            VStack(spacing: 13) {
                HStack(alignment: .firstTextBaseline, spacing: 12) {
                    Text("Period earned").foregroundStyle(WarmLedger.secondary)
                    Spacer(minLength: 0)
                    GODLAmount(value: amountText(period.earnedGodl, places: 4), iconSize: 11, minimumScale: 0.55)
                }.font(LedgerType.meta).accessibilityElement(children: .combine)
                row("Net spend", "\(period.approximateSpendText) USD", emphasis: true)
            }
            LedgerRule()
            VStack(alignment: .leading, spacing: 14) {
                Text("How it adds up").font(LedgerType.section)
                row("Wallet outflows", "\(amountText(period.grossOutSol, places: 9)) SOL")
                row("SOL returned", "−\(amountText(period.returnedSol, places: 9)) SOL")
                LedgerRule()
                row("Net cash cost", "\(amountText(period.netSpendSol, places: 9)) SOL", emphasis: true)
                Text("Includes \(amountText(period.ownerNetworkFeesSol, places: 9)) SOL in network fees and \(amountText(period.newRentSol, places: 9)) SOL in new account rent.")
                    .font(LedgerType.meta).foregroundStyle(WarmLedger.tertiary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            DisclosureGroup(isExpanded: $showingNotes) {
                VStack(alignment: .leading, spacing: 14) {
                    note("Starting balance", period.baselineBasis)
                    note("Historical USD prices", period.priceBasis)
                    ForEach(period.caveats, id: \.self) { Text($0).fixedSize(horizontal: false, vertical: true) }
                }.font(LedgerType.meta).foregroundStyle(WarmLedger.secondary).padding(.top, 12)
            } label: {
                Text("Calculation notes").frame(maxWidth: .infinity, minHeight: 40, alignment: .leading)
            }.font(LedgerType.body).tint(WarmLedger.strongBrass)
                .animation(reduceMotion ? nil : LedgerMotion.navigation, value: showingNotes)
            if let accounting {
                VStack(alignment: .leading, spacing: 6) {
                    Text(accounting.state == "current" ? "History checked" : "Last reconciled period shown")
                        .fontWeight(.medium)
                    Text(accounting.reason)
                    Text("Checked \(accounting.checkedAt.formatted(date: .abbreviated, time: .shortened))")
                        .foregroundStyle(WarmLedger.tertiary)
                }.font(LedgerType.meta).fixedSize(horizontal: false, vertical: true)
            }
            Text(accounting == nil
                ? "This report ends at the time shown. Later mining needs another reconciliation."
                : "New mining is included automatically once its funds and rewards have settled and its history has been reconciled.")
                .font(LedgerType.meta).foregroundStyle(WarmLedger.tertiary)
                .fixedSize(horizontal: false, vertical: true)
        }.textSelection(.enabled)
    }

    private func row(_ label: String, _ value: String, emphasis: Bool = false) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Text(label).foregroundStyle(WarmLedger.secondary)
            Spacer(minLength: 0)
            Text(value).fontWeight(emphasis ? .semibold : .regular).monospacedDigit()
                .lineLimit(1).minimumScaleFactor(0.6).multilineTextAlignment(.trailing)
        }.font(LedgerType.meta).accessibilityElement(children: .combine)
    }
    private func note(_ title: String, _ body: String) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(title).fontWeight(.medium)
            Text(body).fixedSize(horizontal: false, vertical: true)
        }
    }
}

struct LedgerRule: View {
    @Environment(\.colorSchemeContrast) private var contrast
    var body: some View {
        Rectangle().fill(contrast == .increased ? WarmLedger.highContrastDivider : WarmLedger.divider).frame(height: 1)
    }
}

struct ObservationFailureNotice: View {
    let message: String
    let hasObservation: Bool
    @State private var showingDetails = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Label("Couldn’t update the observation", systemImage: "exclamationmark.circle")
                .font(LedgerType.body).fontWeight(.medium).foregroundStyle(WarmLedger.caution)
            Text(hasObservation
                ? "Showing the last observation. Use Refresh to try again."
                : "No balance is available yet. Use Refresh to try again.")
                .font(LedgerType.meta).foregroundStyle(WarmLedger.secondary)
            DisclosureGroup(isExpanded: $showingDetails) {
                Text(message).font(LedgerType.meta).foregroundStyle(WarmLedger.secondary)
                    .textSelection(.enabled).fixedSize(horizontal: false, vertical: true)
            } label: {
                Text("Technical details").font(LedgerType.meta)
                    .frame(maxWidth: .infinity, minHeight: 40, alignment: .leading)
            }.tint(WarmLedger.strongBrass)
        }.padding(14).frame(maxWidth: .infinity, alignment: .leading)
            .background(WarmLedger.caution.opacity(0.06), in: RoundedRectangle(cornerRadius: 8))
            .animation(reduceMotion ? nil : LedgerMotion.navigation, value: showingDetails)
    }
}

struct ObservationStatus: View {
    @ObservedObject var controller: MonitorController
    var compact = false
    private var label: String {
        guard compact else { return controller.status }
        if controller.errorMessage != nil { return "Refresh failed" }
        if controller.monitor == nil { return controller.isRefreshing ? "Connecting…" : "No observation" }
        return controller.isStale ? "Data delayed" : "Observing"
    }
    var body: some View {
        HStack(spacing: 10) {
            Circle().fill(controller.isStale || controller.errorMessage != nil ? WarmLedger.caution : WarmLedger.positive)
                .frame(width: 11, height: 11)
            Text(label).font(.system(size: 13)).foregroundStyle(WarmLedger.secondary)
        }.accessibilityElement(children: .combine).help(controller.status)
    }
}

struct GoalTrack: View {
    let progress: Double?
    let target: String
    var height: CGFloat = 13
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    var body: some View {
        if let progress {
            ProgressView(value: min(1, max(0, progress)), total: 1)
                .progressViewStyle(LedgerProgressStyle(height: height))
                .animation(reduceMotion ? nil : LedgerMotion.value, value: progress)
                .accessibilityLabel("Progress toward \(target) unrefined GODL")
                .accessibilityValue("\(amountText(String(progress * 100))) percent")
        } else {
            Capsule().fill(WarmLedger.track).frame(height: height)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("Progress toward \(target) unrefined GODL")
                .accessibilityValue("Unavailable")
        }
    }
}

private struct LedgerProgressStyle: ProgressViewStyle {
    let height: CGFloat
    func makeBody(configuration: Configuration) -> some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule().fill(WarmLedger.track)
                Rectangle().fill(WarmLedger.brass)
                    .frame(width: proxy.size.width * (configuration.fractionCompleted ?? 0))
            }.clipShape(Capsule())
        }.frame(height: height)
    }
}

struct ReadOnlyBadge: View {
    var compact = false
    var body: some View {
        Text(compact ? "Read-only" : "Read-only monitor")
            .font(.system(size: 11)).foregroundStyle(WarmLedger.secondary)
            .padding(.horizontal, 10).padding(.vertical, 4)
            .background(WarmLedger.selection.opacity(0.65), in: Capsule())
    }
}

struct LedgerButtonStyle: ButtonStyle {
    var fillsWidth = false
    var minWidth: CGFloat? = nil

    func makeBody(configuration: Configuration) -> some View {
        LedgerControlSurface(configuration: configuration, iconOnly: false, fillsWidth: fillsWidth, minWidth: minWidth)
    }
}

struct LedgerIconButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        LedgerControlSurface(configuration: configuration, iconOnly: true)
    }
}

private struct LedgerControlSurface: View {
    let configuration: ButtonStyleConfiguration
    let iconOnly: Bool
    var fillsWidth = false
    var minWidth: CGFloat? = nil
    @Environment(\.isEnabled) private var enabled
    @Environment(\.colorSchemeContrast) private var contrast
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var hovering = false

    var body: some View {
        configuration.label
            .font(.system(size: 13, weight: .medium)).foregroundStyle(WarmLedger.ink)
            .lineLimit(1)
            .padding(.horizontal, iconOnly ? 0 : 12)
            .frame(minWidth: minWidth, maxWidth: fillsWidth ? .infinity : nil)
            .frame(width: iconOnly ? 40 : nil, height: 40)
            .contentShape(RoundedRectangle(cornerRadius: 8))
            .background(configuration.isPressed ? WarmLedger.selection : hovering && enabled ? WarmLedger.track : iconOnly ? .clear : WarmLedger.control,
                        in: RoundedRectangle(cornerRadius: 8))
            .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(
                contrast == .increased ? WarmLedger.highContrastDivider : iconOnly ? .clear : WarmLedger.controlBorder, lineWidth: 1))
            .scaleEffect(configuration.isPressed && !reduceMotion ? 0.96 : 1)
            .opacity(enabled ? 1 : 0.55)
            .onHover { hovering = $0 }
            .animation(reduceMotion ? nil : LedgerMotion.feedback, value: hovering)
            .animation(reduceMotion ? nil : LedgerMotion.feedback, value: configuration.isPressed)
    }
}

private struct LedgerFieldSurface: ViewModifier {
    let focused: Bool
    let invalid: Bool
    @Environment(\.colorSchemeContrast) private var contrast

    func body(content: Content) -> some View {
        content
            .background(WarmLedger.popover, in: RoundedRectangle(cornerRadius: 8))
            .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(
                invalid ? WarmLedger.critical : focused ? WarmLedger.strongBrass
                    : contrast == .increased ? WarmLedger.highContrastDivider : WarmLedger.controlBorder,
                lineWidth: focused || invalid ? 2 : 1))
    }
}

extension View {
    func ledgerFieldSurface(focused: Bool, invalid: Bool = false) -> some View {
        modifier(LedgerFieldSurface(focused: focused, invalid: invalid))
    }
}

struct LedgerRowButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        LedgerRowSurface(configuration: configuration)
    }
}

private struct LedgerRowSurface: View {
    let configuration: ButtonStyleConfiguration
    @State private var hovering = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.isEnabled) private var enabled
    var body: some View {
        configuration.label
            .background(configuration.isPressed && enabled ? WarmLedger.selection.opacity(0.7) : hovering && enabled ? WarmLedger.selection.opacity(0.35) : .clear,
                        in: RoundedRectangle(cornerRadius: 8))
            .opacity(enabled ? 1 : 0.5)
            .contentShape(Rectangle()).onHover { hovering = $0 }
            .animation(reduceMotion ? nil : LedgerMotion.feedback, value: hovering)
            .animation(reduceMotion ? nil : LedgerMotion.feedback, value: configuration.isPressed)
    }
}

struct RefreshSymbol: View {
    let refreshing: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    var body: some View {
        ZStack {
            if refreshing && !reduceMotion {
                ProgressView().controlSize(.mini)
            } else {
                Image(systemName: refreshing ? "clock" : "arrow.clockwise")
            }
        }.frame(width: 16, height: 16)
            .animation(nil, value: refreshing)
            .accessibilityHidden(true)
    }
}

func ledgerDate(_ date: Date, format: String) -> String {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.dateFormat = format
    return formatter.string(from: date)
}


struct RewardBalanceRow: View {
    let title: String
    let value: String
    let godl: Bool
    var showsDisclosure = false
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(title).font(LedgerType.caption).foregroundStyle(WarmLedger.secondary)
                Spacer(minLength: 2)
                if showsDisclosure {
                    Image(systemName: "chevron.right").font(.system(size: 10, weight: .medium))
                        .foregroundStyle(WarmLedger.icon).accessibilityHidden(true)
                }
            }
            HStack(alignment: .firstTextBaseline, spacing: 4) {
                if godl { GODLAmount(value: value, iconSize: 11, minimumScale: 0.7) }
                else {
                    Text(value).monospacedDigit().lineLimit(1).minimumScaleFactor(0.7)
                    Text("XAUt0").font(LedgerType.caption).foregroundStyle(WarmLedger.secondary)
                }
            }.font(.system(size: 17, weight: .medium))
            Text(value == "—" ? "Unavailable" : "Claimable").font(LedgerType.caption).foregroundStyle(WarmLedger.tertiary)
        }.frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .combine)
    }
}


struct RewardNotificationSettings: View {
    @ObservedObject var notifications: RewardNotifications
    private var statusColor: Color {
        switch notifications.status {
        case .ready: WarmLedger.positive
        case .denied, .error, .permissionNeeded: WarmLedger.caution
        default: WarmLedger.tertiary
        }
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text("macOS alerts").font(LedgerType.section)
                Spacer()
                Toggle("macOS alerts", isOn: Binding(get: { notifications.isEnabled }, set: { notifications.setEnabled($0) }))
                    .labelsHidden().toggleStyle(.switch).tint(WarmLedger.strongBrass)
            }
            Text("Gold and unrefined GODL. Reward history is saved even when alerts are off.")
                .font(LedgerType.meta).foregroundStyle(WarmLedger.secondary).fixedSize(horizontal: false, vertical: true)
            HStack(alignment: .center, spacing: 16) {
                HStack(spacing: 7) {
                    Circle().fill(statusColor).frame(width: 6, height: 6).accessibilityHidden(true)
                    Text(notifications.status.message).font(LedgerType.meta).foregroundStyle(WarmLedger.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer()
                if notifications.status == .permissionNeeded {
                    Button("Allow notifications") { notifications.requestAuthorization() }
                        .buttonStyle(LedgerButtonStyle()).ledgerFocusRing()
                } else if notifications.status == .denied {
                    Button("System Settings") { notifications.openSystemSettings() }
                        .buttonStyle(LedgerButtonStyle()).ledgerFocusRing()
                } else {
                    Button {
                        notifications.sendTest()
                    } label: {
                        Label(notifications.isSendingTest ? "Sending…" : "Send test", systemImage: "bell.badge")
                    }.buttonStyle(LedgerButtonStyle(minWidth: 124)).ledgerFocusRing()
                        .disabled(!notifications.isEnabled || notifications.isSendingTest || notifications.status == .checkingPermission)
                }
            }
            if let confirmation = notifications.testConfirmation {
                Label(confirmation, systemImage: "checkmark.circle")
                    .font(LedgerType.caption).foregroundStyle(WarmLedger.positive)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }.onAppear { notifications.refreshStatus() }
            .onReceive(NotificationCenter.default.publisher(for: NSApplication.didBecomeActiveNotification)) { _ in
                notifications.refreshStatus()
            }
    }
}
