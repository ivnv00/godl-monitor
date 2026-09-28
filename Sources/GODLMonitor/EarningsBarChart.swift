import SwiftUI
import Charts
import GODLCore

// Hallmark · pre-emit critique: P5 H5 E4 S5 R5 V4
// Warm Ledger · daily bars, real zero baseline, explicit gaps, exact strings on selection.
struct EarningsBarChart: View {
    let earnings: Earnings
    var compact = false
    @State private var metric: EarningsMetric = .net
    @State private var selectedDay: String?
    @State private var hoveredDay: String?

    private var activeID: String? { hoveredDay ?? selectedDay ?? earnings.days.first?.id }

    var body: some View {
        let plot = EarningsPlot(earnings: earnings, metric: metric)
        let active = plot.points.first { $0.id == activeID } ?? plot.points.last
        VStack(alignment: .leading, spacing: compact ? 2 : 12) {
            HStack(alignment: .center) {
                Menu {
                    Picker("Earnings metric", selection: $metric) {
                        ForEach(EarningsMetric.allCases, id: \.self) { option in
                            Text(title(option)).tag(option)
                        }
                    }
                } label: {
                    HStack(spacing: 5) {
                        Text(title(metric))
                        Image(systemName: "chevron.down").font(.system(size: 9, weight: .semibold))
                    }.font(LedgerType.meta).frame(minHeight: 40)
                }.menuStyle(.borderlessButton).menuIndicator(.hidden).fixedSize()
                    .foregroundStyle(WarmLedger.secondary).ledgerFocusRing()
                    .accessibilityLabel("Earnings metric: \(title(metric))")
                Spacer(minLength: 4)
                VStack(alignment: .trailing, spacing: 2) {
                    Text(active.map { label($0.day) + ($0.day.coverage == "partial" ? "*" : "") } ?? "—")
                        .font(.system(size: 10.5)).foregroundStyle(WarmLedger.tertiary)
                    LedgerAmount(value: active.map { display($0) } ?? "—",
                                 asset: metric == .net ? nil : metric == .gold ? .gold : .godl,
                                 iconSize: compact ? 14 : 20, minimumScale: 0.7)
                        .font(.system(size: compact ? 20 : 28, design: .serif)).monospacedDigit()
                        .foregroundStyle(active.map { color($0.value) } ?? WarmLedger.ink)
                }.help(active.map { detail($0) } ?? "No earnings history")
            }
            Chart {
                RuleMark(y: .value("Zero", 0.0))
                    .foregroundStyle(WarmLedger.divider).lineStyle(StrokeStyle(lineWidth: 1))
                    .accessibilityHidden(true)
                ForEach(plot.points) { point in
                    if let value = point.value, value != 0 {
                        BarMark(x: .value("Day", point.id), y: .value(title(metric), value), width: .ratio(0.55))
                            .foregroundStyle(color(value).opacity(point.id == active?.id ? 1 : 0.55))
                            .cornerRadius(3)
                            .accessibilityLabel(point.day.day)
                            .accessibilityValue(detail(point))
                    } else {
                        PointMark(x: .value("Day", point.id), y: .value(title(metric), 0.0))
                            .symbol {
                                if point.value == nil {
                                    Text("—").font(.system(size: 11)).foregroundStyle(WarmLedger.tertiary)
                                        .padding(.bottom, 6)
                                } else {
                                    Circle().fill(WarmLedger.brass).frame(width: 5, height: 5)
                                }
                            }
                            .accessibilityLabel(point.day.day)
                            .accessibilityValue(detail(point))
                    }
                }
            }
            .chartXScale(domain: plot.points.map(\.id))
            .chartYScale(domain: plot.domain)
            .chartXAxis {
                AxisMarks(values: plot.points.map(\.id)) { axis in
                    AxisValueLabel {
                        if let id = axis.as(String.self), let point = plot.points.first(where: { $0.id == id }) {
                            Text(shortLabel(point.day)).font(.system(size: compact ? 9.5 : 11.5, weight: id == active?.id ? .semibold : .regular))
                                .foregroundStyle(id == active?.id ? WarmLedger.ink : WarmLedger.tertiary)
                        }
                    }
                }
            }
            .chartYAxis {
                if !compact {
                    AxisMarks(position: .leading, values: .automatic(desiredCount: 3)) { axis in
                        AxisGridLine(stroke: StrokeStyle(lineWidth: 0.5)).foregroundStyle(WarmLedger.grid)
                        AxisValueLabel {
                            if let value = axis.as(Double.self) {
                                Text(axisLabel(value)).font(.system(size: 10.5)).foregroundStyle(WarmLedger.tertiary)
                            }
                        }
                    }
                }
            }
            .chartOverlay { proxy in
                GeometryReader { geometry in
                    if let anchor = proxy.plotFrame, !plot.points.isEmpty {
                        let frame = geometry[anchor]
                        HStack(spacing: 0) {
                            ForEach(plot.points) { point in
                                Button { selectedDay = point.id } label: {
                                    Rectangle().fill(.clear).contentShape(Rectangle())
                                }.buttonStyle(.plain).ledgerFocusRing()
                                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                                    .onHover { hovering in hoveredDay = hovering ? point.id : nil }
                                    .help(detail(point))
                                    .accessibilityLabel("\(point.day.day). \(detail(point))")
                                    .accessibilityAddTraits(point.id == active?.id ? .isSelected : [])
                            }
                        }.frame(width: frame.width, height: frame.height)
                            .position(x: frame.midX, y: frame.midY)
                    }
                }
            }
            .frame(height: compact ? 52 : 190)
            if !compact, let active {
                HStack {
                    Text(coverage(active.day).replacingOccurrences(of: " · partial day", with: ""))
                        .foregroundStyle(WarmLedger.tertiary)
                    Spacer()
                    if metric != .net {
                        Text(marketUSD(usd(active.day), market: earnings.market)).foregroundStyle(WarmLedger.secondary)
                    }
                }.font(LedgerType.caption).monospacedDigit()
            }
        }.onChange(of: metric) { _, _ in hoveredDay = nil }
    }

    private func title(_ metric: EarningsMetric) -> String {
        switch metric {
        case .net: "Net USD"
        case .refined: "Refined GODL"
        case .gold: "Gold · XAUt0"
        case .unrefined: "Unrefined GODL"
        }
    }
    private func axisLabel(_ value: Double) -> String {
        let formatter = NumberFormatter()
        formatter.locale = Locale(identifier: "en_US")
        formatter.numberStyle = value != 0 && (abs(value) < 0.000001 || abs(value) >= 1_000_000) ? .scientific : .decimal
        formatter.usesSignificantDigits = true
        formatter.maximumSignificantDigits = 3
        let text = formatter.string(from: NSNumber(value: value)) ?? "—"
        return metric == .net ? (value < 0 ? "−$" + text.replacingOccurrences(of: "-", with: "") : "$" + text) : text
    }
    private func color(_ value: Double?) -> Color {
        guard let value else { return WarmLedger.tertiary }
        return metric == .net ? (value < 0 ? WarmLedger.critical : value > 0 ? WarmLedger.positive : WarmLedger.ink) : WarmLedger.brass
    }
    private func display(_ point: EarningsPlotPoint) -> String {
        guard let raw = point.raw else { return metric == .net ? dailyNetText(point.day, market: earnings.market) : "No history" }
        if metric == .net { return approximateUSDText(raw) }
        if point.value == 0 { return "0" }
        let places = metric == .gold ? 6 : 4
        let text = amountText(raw, places: places)
        return Decimal(string: text.replacingOccurrences(of: ",", with: "")) == 0 ? (metric == .gold ? "<0.000001" : "<0.0001") : text
    }
    private func usd(_ day: EarningsDay) -> String? {
        switch metric {
        case .net: day.netRewardUsd
        case .refined: day.refinedUsd
        case .gold: day.goldUsd
        case .unrefined: day.unrefinedUsd
        }
    }
    private func detail(_ point: EarningsPlotPoint) -> String {
        guard let raw = point.raw else {
            let reason = metric == .net && !earnings.market.isFresh() ? "Prices unavailable"
                : point.day.coverage == "partial" ? "Incomplete history for \(title(metric))" : "No covered history"
            return "\(point.day.day) · \(reason)"
        }
        let value = metric == .net ? approximateUSDText(raw, places: 6) : "\(raw) · \(marketUSD(usd(point.day), market: earnings.market)) before claim fees"
        return "\(point.day.day) · \(title(metric)): \(value). \(coverage(point.day))"
    }
    private func label(_ day: EarningsDay) -> String {
        date(Date(), format: "yyyy-MM-dd") == day.day ? "Today" : shortLabel(day)
    }
    private func shortLabel(_ day: EarningsDay) -> String {
        let parts = day.day.split(separator: "-")
        return parts.count == 3 ? "\(parts[2])/\(parts[1])" : day.day
    }
    private func coverage(_ day: EarningsDay) -> String {
        guard let from = day.fromAt, let through = day.throughAt else { return "No coverage" }
        return "\(date(from, format: "HH:mm"))–\(date(through, format: "HH:mm")) · partial day"
    }
    private func date(_ value: Date, format: String) -> String {
        let formatter = DateFormatter()
        formatter.timeZone = TimeZone(identifier: earnings.timeZone)
        formatter.dateFormat = format
        return formatter.string(from: value)
    }
}
