import SwiftUI
import GODLCore

// Hallmark · component / Warm Ledger · pre-emit critique: P5 H5 E4 S5 R5 V4
struct NotificationBell: View {
    @ObservedObject var notifications: RewardNotifications
    let open: () -> Void

    var body: some View {
        Button(action: open) {
            Image(systemName: notifications.unreadCount > 0 ? "bell.badge" : "bell")
                .overlay(alignment: .topTrailing) {
                    if notifications.inboxError != nil {
                        Circle().fill(WarmLedger.caution).frame(width: 6, height: 6).offset(x: 2, y: -2)
                    }
                }
        }
        .buttonStyle(LedgerIconButtonStyle()).ledgerFocusRing()
        .accessibilityLabel("Notifications, \(notifications.unreadCount) unread")
        .help(notifications.inboxError ?? "Reward history · \(notifications.unreadCount) unread")
    }
}

struct NotificationInbox: View {
    @ObservedObject var notifications: RewardNotifications
    var compact = true
    let back: () -> Void
    @State private var visibleCount = 40

    private var entries: [RewardInboxEntry] { Array(notifications.entries.prefix(visibleCount)) }
    private var days: [Date] {
        var seen = Set<Date>()
        return entries.map { Calendar.current.startOfDay(for: $0.throughAt) }.filter { seen.insert($0).inserted }
    }

    var body: some View {
        VStack(spacing: 0) {
            LedgerDetailHeader("Notifications", compact: compact, back: compact, close: back) {
                if notifications.unreadCount > 0 {
                    Text("\(notifications.unreadCount)").font(LedgerType.caption).monospacedDigit()
                        .padding(.horizontal, 7).padding(.vertical, 3)
                        .background(WarmLedger.control, in: Capsule())
                }
                Button { notifications.markAllRead() } label: { Image(systemName: "checkmark.circle") }
                    .buttonStyle(LedgerIconButtonStyle()).ledgerFocusRing()
                    .disabled(notifications.unreadCount == 0 || notifications.inboxError != nil)
                    .accessibilityLabel("Mark all notifications as read").help("Mark all as read")
            }
            LedgerRule()
            if let error = notifications.inboxError {
                Label(error, systemImage: "exclamationmark.triangle")
                    .font(LedgerType.meta).foregroundStyle(WarmLedger.caution)
                    .fixedSize(horizontal: false, vertical: true).padding(compact ? LedgerLayout.compactInset : LedgerLayout.detailInset)
            }
            if notifications.entries.isEmpty {
                VStack(spacing: 12) {
                    Image(systemName: "tray").font(.system(size: 28, weight: .light)).foregroundStyle(WarmLedger.icon)
                    Text("Your reward history starts here").font(LedgerType.section)
                    Text("New rewards and accruals will be saved here.")
                        .font(LedgerType.meta).foregroundStyle(WarmLedger.tertiary)
                        .multilineTextAlignment(.center)
                }.padding(26).frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 18) {
                        ForEach(days, id: \.self) { day in
                            VStack(alignment: .leading, spacing: 8) {
                                Text(dayTitle(day)).font(LedgerType.caption).foregroundStyle(WarmLedger.tertiary)
                                ForEach(entries.filter { Calendar.current.isDate($0.throughAt, inSameDayAs: day) }) { entry in
                                    InboxEntryRow(entry: entry)
                                }
                            }
                        }
                        if notifications.entries.count > visibleCount {
                            Button("Show earlier") { visibleCount += 40 }
                                .buttonStyle(LedgerRowButtonStyle()).ledgerFocusRing()
                                .frame(maxWidth: .infinity, minHeight: 40)
                        }
                    }.padding(compact ? LedgerLayout.compactInset : LedgerLayout.detailInset)
                }
            }
            LedgerRule()
            HStack {
                Text("Observed accruals").font(LedgerType.caption).foregroundStyle(WarmLedger.tertiary)
                Image(systemName: "info.circle").font(LedgerType.caption).foregroundStyle(WarmLedger.tertiary)
                    .help("Amounts before claim fees. Intervals show when changes were observed, not exact reward times. After quitting or sleep, changes are checked on return. GODL claims or missing observations can leave gaps. History begins with this update.")
                    .accessibilityLabel("About reward history: observed increases before claim fees. Checks resume when the app reopens. Claims or missing observations can leave gaps.")
                Spacer()
                Toggle("macOS alerts", isOn: Binding(get: { notifications.isEnabled }, set: { notifications.setEnabled($0) }))
                    .toggleStyle(.switch).controlSize(.mini).font(LedgerType.caption)
                    .help("Gold and unrefined GODL banners. History is saved even with alerts off.")
            }.padding(.horizontal, compact ? LedgerLayout.compactInset : LedgerLayout.detailInset).padding(.vertical, 14)
        }.foregroundStyle(WarmLedger.ink)
    }

    private func dayTitle(_ day: Date) -> String {
        if Calendar.current.isDateInToday(day) { return "Today" }
        if Calendar.current.isDateInYesterday(day) { return "Yesterday" }
        return ledgerDate(day, format: "d MMM yyyy")
    }
}

private struct InboxEntryRow: View {
    let entry: RewardInboxEntry
    private var timeRange: String {
        let sameDay = Calendar.current.isDate(entry.fromAt, inSameDayAs: entry.throughAt)
        return ledgerDate(entry.fromAt, format: sameDay ? "HH:mm" : "d MMM, HH:mm")
            + "–" + ledgerDate(entry.throughAt, format: "HH:mm")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                if !entry.isRead {
                    Circle().fill(WarmLedger.strongBrass).frame(width: 5, height: 5).accessibilityLabel("Unread")
                }
                Text(entry.isCatchUp ? "Since last check" : "Accrued").font(LedgerType.meta.weight(.medium))
                Spacer(minLength: 4)
                Text(timeRange).font(LedgerType.caption).monospacedDigit().foregroundStyle(WarmLedger.tertiary)
            }
            if let amount = entry.unrefinedUnits { amountRow("Unrefined GODL", units: amount, decimals: 11, places: 4) }
            if let amount = entry.refinedUnits { amountRow("Refined GODL", units: amount, decimals: 11, places: 4) }
            if let amount = entry.goldUnits { amountRow("Gold · XAUt0", units: amount, decimals: 6, places: 6) }
        }
        .padding(12).background(entry.isRead ? WarmLedger.chrome.opacity(0.45) : WarmLedger.control.opacity(0.6),
                                in: RoundedRectangle(cornerRadius: 10))
        .accessibilityElement(children: .combine)
    }

    private func amountRow(_ title: String, units: UInt64, decimals: Int, places: Int) -> some View {
        let exact = RewardTracker.format(units: units, decimals: decimals)
        let threshold = (0..<(decimals - places)).reduce(UInt64(1)) { value, _ in value * 10 }
        let display = units < threshold ? "<" + RewardTracker.format(units: 1, decimals: places) : amountText(exact, places: places)
        return HStack(alignment: .firstTextBaseline) {
            Text(title).font(LedgerType.meta).foregroundStyle(WarmLedger.secondary)
            Spacer(minLength: 8)
            Text("+" + display).font(LedgerType.body.weight(.medium)).monospacedDigit().foregroundStyle(WarmLedger.positive)
        }.help("+\(exact) \(title)").accessibilityLabel("\(title), plus \(exact)")
    }
}
