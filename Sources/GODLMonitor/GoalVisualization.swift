import SwiftUI
import GODLCore

struct GoalVisualization: View {
    let goal: MonitorGoal
    let progress: GoalProgress
    var showsTitle = true

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if showsTitle {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(goal.title).font(LedgerType.meta).lineLimit(1)
                    Spacer(minLength: 4)
                    Text(goal.metric.symbol).font(LedgerType.caption).foregroundStyle(WarmLedger.tertiary)
                }
            }

            switch goal.visualStyle {
            case .roadmap:
                roadmap
            case .ring:
                ring
            case .bar:
                bar
            }

            if showsCaveat {
                Text(progress.note).font(.system(size: 10.5)).foregroundStyle(WarmLedger.tertiary)
                    .lineLimit(1).help(progress.note)
            }
        }
        .accessibilityElement(children: .contain)
    }

    private var roadmap: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 16) {
                GoalProgressRing(progress: progress, size: 68, lineWidth: 7)
                currentValue
            }
            HStack(spacing: 0) {
                ForEach(Array(milestones.enumerated()), id: \.offset) { index, item in
                    VStack(spacing: 5) {
                        ZStack {
                            HStack(spacing: 0) {
                                Rectangle().fill(index == 0 ? .clear : WarmLedger.divider).frame(height: 1)
                                Rectangle().fill(index == milestones.count - 1 ? .clear : WarmLedger.divider).frame(height: 1)
                            }
                            Circle().fill(item.reached ? WarmLedger.brass : WarmLedger.popover).frame(width: 16, height: 16)
                            Circle().stroke(item.reached || item.next ? WarmLedger.brass : WarmLedger.controlBorder,
                                            lineWidth: item.next ? 2 : 1).frame(width: 16, height: 16)
                            if item.reached {
                                Image(systemName: "checkmark").font(.system(size: 8, weight: .bold)).foregroundStyle(WarmLedger.popover)
                            } else if item.next {
                                Circle().fill(WarmLedger.brass).frame(width: 5, height: 5)
                            }
                        }.frame(height: 18)
                        Text(item.label).font(.system(size: 10.5, weight: item.next ? .semibold : .regular))
                            .foregroundStyle(item.next ? WarmLedger.ink : WarmLedger.tertiary)
                            .lineLimit(1).minimumScaleFactor(0.65)
                    }
                    .frame(maxWidth: .infinity)
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("\(item.percent) percent milestone, \(item.label), \(item.state)")
                }
            }
        }
    }

    private var ring: some View {
        HStack(spacing: 16) {
            GoalProgressRing(progress: progress, size: 68, lineWidth: 7)
            currentValue
        }
    }

    private var bar: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                LedgerAmount(value: currentDisplay, asset: tokenAsset, iconSize: 20, spacing: 7, minimumScale: 0.55)
                    .font(.system(size: 28, design: .serif))
                    .help(exactCurrentHelp).accessibilityLabel(exactCurrentHelp)
                Spacer(minLength: 4)
                Text("of \(targetLabel)").font(LedgerType.caption).foregroundStyle(WarmLedger.tertiary)
                    .lineLimit(1).minimumScaleFactor(0.65)
            }
            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    Capsule().fill(WarmLedger.track)
                    Capsule().fill(progress.isReached ? WarmLedger.positive : WarmLedger.brass)
                        .frame(width: geometry.size.width * (progress.fraction ?? 0))
                }
            }.frame(height: 7).accessibilityHidden(true)
            HStack {
                Text(goal.metric.symbol).font(LedgerType.caption).foregroundStyle(WarmLedger.tertiary)
                Spacer()
                Text(percentLabel).font(LedgerType.caption).monospacedDigit().foregroundStyle(WarmLedger.secondary)
            }
        }
    }

    private var currentValue: some View {
        VStack(alignment: .leading, spacing: 3) {
            LedgerAmount(value: currentDisplay, asset: tokenAsset, iconSize: 20, spacing: 7, minimumScale: 0.55)
                .font(.system(size: 28, design: .serif))
                .help(exactCurrentHelp).accessibilityLabel(exactCurrentHelp)
            Text("of \(targetLabel)").font(LedgerType.caption).foregroundStyle(WarmLedger.tertiary)
                .lineLimit(1).minimumScaleFactor(0.7)
        }.frame(maxWidth: .infinity, alignment: .leading)
    }

    private var tokenAsset: LedgerAsset? { goal.metric.isUSD ? nil : goal.metric == .gold ? .gold : .godl }

    private var targetLabel: String { "\(display(goal.target)) \(goal.metric.symbol)" }

    private var currentDisplay: String {
        guard let raw = progress.current else { return "—" }
        if goal.metric.isUSD { return approximateUSDText(raw) }
        let places = goal.metric == .gold ? 6 : goal.metric == .refined ? 4 : 2
        let text = amountText(raw, places: places)
        let rounded = Decimal(string: text.replacingOccurrences(of: ",", with: ""),
                              locale: Locale(identifier: "en_US_POSIX"))
        let exact = Decimal(string: raw, locale: Locale(identifier: "en_US_POSIX"))
        return rounded == exact ? text : "≈" + text
    }

    private var exactCurrentHelp: String {
        guard let current = progress.current else { return progress.note }
        return "Exact current value: \(current) \(goal.metric.symbol)"
    }

    private func display(_ raw: String?) -> String {
        guard let raw, let number = Decimal(string: raw, locale: Locale(identifier: "en_US_POSIX")) else { return "—" }
        let formatter = NumberFormatter()
        formatter.locale = Locale(identifier: "en_US")
        formatter.numberStyle = .decimal
        formatter.minimumFractionDigits = goal.metric.isUSD ? 2 : 0
        formatter.maximumFractionDigits = goal.metric.decimalPlaces
        return formatter.string(from: NSDecimalNumber(decimal: number)) ?? raw
    }

    private var percentLabel: String {
        guard let raw = progress.percent, let number = Decimal(string: raw) else { return "Unavailable" }
        if number > 0 && number < 1 { return "<1%" }
        if number > 99 && number < 100 { return ">99%" }
        return "\(displayPercent(number))%"
    }

    private func displayPercent(_ value: Decimal) -> String {
        let formatter = NumberFormatter()
        formatter.locale = Locale(identifier: "en_US")
        formatter.numberStyle = .decimal
        formatter.maximumFractionDigits = 1
        return formatter.string(from: NSDecimalNumber(decimal: value)) ?? "—"
    }

    private var showsCaveat: Bool {
        progress.current == nil || goal.metric.isUSD || progress.note.localizedCaseInsensitiveContains("stale")
    }

    private struct Milestone {
        let percent: Int
        let label: String
        let reached: Bool
        let next: Bool
        let state: String
    }

    private var milestones: [Milestone] {
        let points = [10, 25, 50, 100]
        let fraction = progress.fraction
        let nextPoint = fraction.flatMap { current in points.first { Double($0) / 100 > current } }
        return points.map { point in
            let reached = fraction.map { $0 >= Double(point) / 100 } ?? false
            let next = nextPoint == point
            return Milestone(percent: point, label: milestoneLabel(point), reached: reached, next: next,
                             state: fraction == nil ? "progress unavailable" : reached ? "reached" : next ? "next" : "ahead")
        }
    }

    private func milestoneLabel(_ percent: Int) -> String {
        guard let target = Decimal(string: goal.target, locale: Locale(identifier: "en_US_POSIX")) else { return "—" }
        let value = target * Decimal(percent) / 100
        let minimumText = "0." + String(repeating: "0", count: max(0, goal.metric.decimalPlaces - 1)) + "1"
        if let minimum = Decimal(string: minimumText), value > 0, value < minimum {
            return goal.metric.isUSD ? "<$\(minimumText)" : "<\(minimumText)"
        }
        var copy = value
        let raw = NSDecimalString(&copy, Locale(identifier: "en_US_POSIX"))
        if value >= 1_000 {
            var thousands = value / 1_000
            let compact = NSDecimalString(&thousands, Locale(identifier: "en_US_POSIX"))
            let fractionDigits = compact.split(separator: ".", omittingEmptySubsequences: false).dropFirst().first?.count ?? 0
            if fractionDigits <= 3 {
                return goal.metric.isUSD ? "$\(compact)k" : "\(compact)k"
            }
        }
        return goal.metric.isUSD ? "$\(display(raw))" : display(raw)
    }
}

struct GoalProgressRing: View {
    let progress: GoalProgress
    let size: CGFloat
    let lineWidth: CGFloat

    var body: some View {
        ZStack {
            Circle().stroke(WarmLedger.track, lineWidth: lineWidth)
            if let fraction = progress.fraction {
                Circle().trim(from: 0, to: fraction)
                    .stroke(progress.isReached ? WarmLedger.positive : WarmLedger.brass,
                            style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                    .rotationEffect(.degrees(-90))
            }
            if progress.isReached {
                Image(systemName: "checkmark").font(.system(size: size * 0.25, weight: .semibold))
                    .foregroundStyle(WarmLedger.positive)
            } else {
                Text(ringPercent).font(.system(size: size * 0.19, weight: .semibold)).monospacedDigit()
                    .minimumScaleFactor(0.55).lineLimit(1).padding(5)
            }
        }
        .frame(width: size, height: size)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Goal progress")
        .accessibilityValue(progress.percent.map { "\($0) percent" } ?? "Unavailable")
    }

    private var ringPercent: String {
        guard let raw = progress.percent, var value = Decimal(string: raw) else { return "—" }
        if value > 0 && value < 1 { return "<1%" }
        if value > 99 && value < 100 { return ">99%" }
        var whole = Decimal()
        NSDecimalRound(&whole, &value, 0, .down)
        return NSDecimalNumber(decimal: whole).stringValue + "%"
    }
}

struct GoalStylePreview: View {
    let style: GoalVisualStyle
    let selected: Bool

    var body: some View {
        VStack(spacing: 6) {
            preview.frame(height: 24)
            Text(style.title).font(LedgerType.caption)
        }
        .frame(maxWidth: .infinity, minHeight: 52)
        .foregroundStyle(selected ? WarmLedger.ink : WarmLedger.secondary)
        .background(selected ? WarmLedger.selection.opacity(0.65) : WarmLedger.control.opacity(0.45),
                    in: RoundedRectangle(cornerRadius: 8))
        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(selected ? WarmLedger.strongBrass : WarmLedger.controlBorder,
                                                                lineWidth: selected ? 2 : 1))
    }

    @ViewBuilder private var preview: some View {
        switch style {
        case .roadmap:
            HStack(spacing: 3) {
                ForEach(0..<4) { index in
                    Circle().fill(index == 0 ? WarmLedger.brass : WarmLedger.track).frame(width: 7, height: 7)
                    if index < 3 { Rectangle().fill(WarmLedger.divider).frame(width: 8, height: 1) }
                }
            }
        case .ring:
            Circle().trim(from: 0, to: 0.7).stroke(WarmLedger.brass, style: StrokeStyle(lineWidth: 3, lineCap: .round))
                .rotationEffect(.degrees(-90)).frame(width: 22, height: 22)
        case .bar:
            ZStack(alignment: .leading) {
                Capsule().fill(WarmLedger.track).frame(width: 42, height: 6)
                Capsule().fill(WarmLedger.brass).frame(width: 28, height: 6)
            }
        }
    }
}
