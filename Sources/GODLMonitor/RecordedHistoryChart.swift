import SwiftUI
import Charts
import GODLCore

// Warm Ledger: saved gross rewards are useful independently of verified costs.
struct RecordedHistoryChart: View {
    let entries: [RewardInboxEntry]
    let earnings: Earnings?
    var historyError: String?
    @State private var metric: Metric = .value
    @State private var endingAt: Date?
    @State private var selectedDay: String?
    @State private var hoveredDay: String?

    private enum Metric: String, CaseIterable {
        case value = "Recorded value", unrefined = "Unrefined GODL", refined = "Refined GODL", gold = "Gold · XAUt0"
    }
    private var calendar: Calendar { earnings?.calendar ?? .current }
    private var history: RecordedAccrualHistory {
        RecordedAccrualHistory(entries: entries, calendar: calendar, endingAt: endingAt)
    }

    var body: some View {
        let history = history
        let active = history.days.first { $0.id == (hoveredDay ?? selectedDay) } ?? history.days.last
        let values = history.days.compactMap { geometry($0) }
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Menu {
                    Picker("Recorded reward metric", selection: $metric) {
                        ForEach(Metric.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                    }
                } label: {
                    HStack(spacing: 6) {
                        Text(metric.rawValue)
                        Image(systemName: "chevron.down").font(LedgerType.caption)
                    }.font(LedgerType.meta).frame(minHeight: 40)
                }.menuStyle(.borderlessButton).menuIndicator(.hidden).fixedSize()
                    .foregroundStyle(WarmLedger.secondary).ledgerFocusRing()
                    .accessibilityLabel("Recorded reward metric: \(metric.rawValue)")
                Spacer(minLength: 8)
                VStack(alignment: .trailing, spacing: 3) {
                    Text(active.map { dayLabel($0.date) } ?? "—")
                        .font(LedgerType.caption).foregroundStyle(WarmLedger.tertiary)
                    LedgerAmount(value: active.map(display) ?? "—",
                                 asset: metric == .value ? nil : metric == .gold ? .gold : .godl,
                                 iconSize: 18, minimumScale: 0.7)
                        .font(.system(size: 28, design: .serif)).monospacedDigit()
                }.help(active.map(detail) ?? "No saved reward intervals")
            }
            if let historyError {
                Text(historyError).font(LedgerType.meta).foregroundStyle(WarmLedger.caution)
            } else if history.days.contains(where: { !$0.accruals.isValid }) {
                Text("Saved rewards need review. Existing history has been preserved.")
                    .font(LedgerType.meta).foregroundStyle(WarmLedger.caution)
            } else {
                Chart {
                    RuleMark(y: .value("Zero", 0.0)).foregroundStyle(WarmLedger.divider).accessibilityHidden(true)
                    ForEach(history.days) { day in
                        if let value = geometry(day) {
                            BarMark(x: .value("Day", day.id), y: .value(metric.rawValue, value), width: .ratio(0.55))
                                .foregroundStyle(WarmLedger.brass.opacity(active?.id == day.id ? 1 : 0.55)).cornerRadius(3)
                                .accessibilityLabel(day.id).accessibilityValue(detail(day))
                        } else {
                            PointMark(x: .value("Day", day.id), y: .value(metric.rawValue, 0.0))
                                .symbol { Text("—").font(LedgerType.caption).foregroundStyle(WarmLedger.tertiary).padding(.bottom, 6) }
                                .accessibilityLabel(day.id).accessibilityValue(detail(day))
                        }
                    }
                }
                .chartXScale(domain: history.days.map(\.id))
                .chartYScale(domain: 0...(values.max().map { max($0 * 1.15, Double.leastNormalMagnitude) } ?? 1))
                .chartXAxis {
                    AxisMarks(values: history.days.map(\.id)) { axis in
                        AxisValueLabel {
                            if let id = axis.as(String.self), let day = history.days.first(where: { $0.id == id }) {
                                Text(date(day.date, format: "dd/MM")).font(LedgerType.caption)
                                    .foregroundStyle(day.id == active?.id ? WarmLedger.ink : WarmLedger.tertiary)
                            }
                        }
                    }
                }
                .chartYAxis {
                    if !values.isEmpty {
                        AxisMarks(position: .leading, values: .automatic(desiredCount: 3)) { axis in
                            AxisGridLine(stroke: StrokeStyle(lineWidth: 0.5)).foregroundStyle(WarmLedger.grid)
                            AxisValueLabel {
                                if let value = axis.as(Double.self) {
                                    Text(axisLabel(value)).font(LedgerType.caption).foregroundStyle(WarmLedger.tertiary)
                                }
                            }
                        }
                    }
                }
                .chartOverlay { proxy in
                    GeometryReader { geometry in
                        if let anchor = proxy.plotFrame {
                            let frame = geometry[anchor]
                            HStack(spacing: 0) {
                                ForEach(history.days) { day in
                                    Button { selectedDay = day.id } label: {
                                        Rectangle().fill(.clear).contentShape(Rectangle())
                                    }.buttonStyle(.plain).ledgerFocusRing()
                                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                                        .onHover { hoveredDay = $0 ? day.id : nil }
                                        .help(detail(day)).accessibilityLabel(detail(day))
                                        .accessibilityAddTraits(day.id == active?.id ? .isSelected : [])
                                }
                            }.frame(width: frame.width, height: frame.height).position(x: frame.midX, y: frame.midY)
                        }
                    }
                }.frame(height: 170)
            }
            HStack(spacing: 8) {
                Button { move(-7, history: history) } label: {
                    Image(systemName: "chevron.left").frame(width: 40, height: 40)
                }.buttonStyle(LedgerIconButtonStyle()).ledgerFocusRing().disabled(!history.hasEarlier)
                    .help("Previous seven days").accessibilityLabel("Previous seven days")
                Text(rangeLabel(history)).font(LedgerType.caption).monospacedDigit().foregroundStyle(WarmLedger.secondary)
                Spacer(minLength: 0)
                if history.hasLater {
                    Button("Today") { endingAt = nil; selectedDay = nil; hoveredDay = nil }
                        .buttonStyle(LedgerButtonStyle()).ledgerFocusRing()
                }
                Button { move(7, history: history) } label: {
                    Image(systemName: "chevron.right").frame(width: 40, height: 40)
                }.buttonStyle(LedgerIconButtonStyle()).ledgerFocusRing().disabled(!history.hasLater)
                    .help("Next seven days").accessibilityLabel("Next seven days")
            }
            Text("Recorded increases · before fees & costs")
                .font(LedgerType.caption).foregroundStyle(WarmLedger.tertiary)
                .help("\(calendar.timeZone.identifier). Only saved intervals wholly inside each day are added. Gaps are not zero. USD uses current prices; these amounts are not complete daily income or net profit.")
            if let active {
                DisclosureGroup("Exact recorded amounts · \(dayLabel(active.date))") {
                    VStack(alignment: .leading, spacing: 10) {
                        exactRow("Unrefined", units: active.accruals.unrefinedUnits, decimals: 11, symbol: "GODL")
                        exactRow("Refined", units: active.accruals.refinedUnits, decimals: 11, symbol: "GODL")
                        exactRow("Gold", units: active.accruals.goldUnits, decimals: 6, symbol: "XAUt0")
                        Text("\(calendar.timeZone.identifier) · USD at current prices. Missing observations and overnight intervals are not included.")
                            .font(LedgerType.caption).foregroundStyle(WarmLedger.tertiary)
                    }.padding(.top, 10)
                }.font(LedgerType.meta).tint(WarmLedger.icon)
                if active.accruals.excludedCrossDayCount > 0 {
                    Text("\(active.accruals.excludedCrossDayCount) overnight interval(s) excluded. Exact amounts remain in Activity.")
                        .font(LedgerType.caption).foregroundStyle(WarmLedger.tertiary)
                }
            }
        }
    }

    private func raw(_ day: RecordedAccrualHistory.Day) -> String? {
        guard historyError == nil, day.accruals.isValid else { return nil }
        switch metric {
        case .value: return day.accruals.valueUsd(market: earnings?.market)
        case .unrefined: return day.accruals.unrefinedUnits.map { RewardTracker.format(units: $0, decimals: 11) }
        case .refined: return day.accruals.refinedUnits.map { RewardTracker.format(units: $0, decimals: 11) }
        case .gold: return day.accruals.goldUnits.map { RewardTracker.format(units: $0, decimals: 6) }
        }
    }
    private func geometry(_ day: RecordedAccrualHistory.Day) -> Double? {
        raw(day).flatMap(Double.init).flatMap { $0.isFinite ? $0 : nil }
    }
    private func display(_ day: RecordedAccrualHistory.Day) -> String {
        guard let raw = raw(day) else {
            if historyError != nil || !day.accruals.isValid { return "Unavailable" }
            return metric == .value && day.accruals.hasAccruals ? "No price" : "—"
        }
        return metric == .value ? approximateUSDText(raw) : activityAmount(raw, places: metric == .gold ? 6 : 4)
    }
    private func detail(_ day: RecordedAccrualHistory.Day) -> String {
        let amount = raw(day).map { metric == .value ? "≈$\($0) at current prices" : $0 } ?? (day.accruals.hasAccruals && metric == .value ? "Prices unavailable" : "No increase recorded for this metric; not a verified zero")
        return "\(day.id) · \(metric.rawValue): \(amount). Recorded increases before fees and costs."
    }
    private func exactRow(_ name: String, units: UInt64?, decimals: Int, symbol: String) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(name).foregroundStyle(WarmLedger.secondary)
            Spacer(minLength: 12)
            Text(units.map { RewardTracker.format(units: $0, decimals: decimals) + " " + symbol } ?? "—")
                .monospacedDigit().textSelection(.enabled).multilineTextAlignment(.trailing)
        }.font(LedgerType.meta)
    }
    private func move(_ days: Int, history: RecordedAccrualHistory) {
        endingAt = calendar.date(byAdding: .day, value: days, to: history.days.last?.date ?? Date())
        if let endingAt, calendar.isDateInToday(endingAt) || endingAt > Date() { self.endingAt = nil }
        selectedDay = nil; hoveredDay = nil
    }
    private func rangeLabel(_ history: RecordedAccrualHistory) -> String {
        guard let first = history.days.first, let last = history.days.last else { return "—" }
        return date(first.date, format: "d MMM") + "–" + date(last.date, format: "d MMM yyyy")
    }
    private func dayLabel(_ value: Date) -> String {
        calendar.isDateInToday(value) ? "Today" : date(value, format: "d MMM yyyy")
    }
    private func date(_ value: Date, format: String) -> String {
        let formatter = DateFormatter(); formatter.timeZone = calendar.timeZone; formatter.dateFormat = format
        return formatter.string(from: value)
    }
    private func axisLabel(_ value: Double) -> String {
        let formatter = NumberFormatter(); formatter.numberStyle = .decimal
        formatter.locale = Locale(identifier: "en_US")
        formatter.usesSignificantDigits = true; formatter.maximumSignificantDigits = 3
        return (metric == .value ? "$" : "") + (formatter.string(from: NSNumber(value: value)) ?? "—")
    }
}
