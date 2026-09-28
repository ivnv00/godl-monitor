import AppKit
import SwiftUI

enum LedgerAsset {
    case godl, gold
    var symbol: String { self == .godl ? "GODL" : "XAUt0" }
}

/// Shared visual denominations; the gold bar is original UI artwork, not a token issuer's logo.
struct LedgerAssetMark: View {
    let asset: LedgerAsset
    var size: CGFloat = 12

    var body: some View {
        Group {
            if asset == .godl {
                Image(nsImage: GODLBrand.amountMark)
                    .renderingMode(.original).resizable().scaledToFit()
            } else {
                GoldMark()
            }
        }
        .frame(width: size, height: size)
        .alignmentGuide(.firstTextBaseline) { $0[.bottom] - size * (asset == .gold ? 0.18 : 0.04) }
        .accessibilityHidden(true)
    }
}

// Hallmark · Warm Ledger denomination · pre-emit critique: P5 H5 E4 S5 R5 V4
// Three simple planes remain legible at ledger size and scale without raster blur.
private struct GoldMark: View {
    var body: some View {
        ZStack {
            GoldPlane(points: [[0.22, 0.20], [0.76, 0.20], [0.92, 0.52], [0.08, 0.52]])
                .fill(WarmLedger.goldTop)
            GoldPlane(points: [[0.08, 0.52], [0.92, 0.52], [0.98, 0.82], [0.02, 0.82]])
                .fill(WarmLedger.goldFace)
            GoldPlane(points: [[0.76, 0.20], [0.92, 0.52], [0.98, 0.82], [0.79, 0.56]])
                .fill(WarmLedger.goldEdge)
            GoldPlane(points: [[0.22, 0.20], [0.76, 0.20], [0.92, 0.52], [0.98, 0.82], [0.02, 0.82], [0.08, 0.52]])
                .stroke(WarmLedger.strongBrass, style: StrokeStyle(lineWidth: 0.6, lineJoin: .round))
        }
    }
}

private struct GoldPlane: Shape {
    let points: [[CGFloat]]
    func path(in rect: CGRect) -> Path {
        Path { path in
            path.addLines(points.map { CGPoint(x: rect.minX + $0[0] * rect.width, y: rect.minY + $0[1] * rect.height) })
            path.closeSubpath()
        }
    }
}

/// A display-only wrapper: supplied signs, precision and unavailable text are unchanged.
/// Use wrapping for selectable exact values; compact ledgers may scale a single line.
struct LedgerAmount: View {
    let value: String
    var asset: LedgerAsset?
    var iconSize: CGFloat = 12
    var spacing: CGFloat = 5
    var animated = false
    var minimumScale: CGFloat = 0.75
    var wraps = false

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: spacing) {
            if let asset { LedgerAssetMark(asset: asset, size: iconSize) }
            if animated { number.ledgerNumber(value) }
            else { number }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(value == "—" ? "\(asset?.symbol ?? "Value") unavailable" : value + (asset.map { " \($0.symbol)" } ?? ""))
    }

    @ViewBuilder private var number: some View {
        if wraps {
            Text(value).monospacedDigit().fixedSize(horizontal: false, vertical: true)
        } else {
            Text(value).monospacedDigit().lineLimit(1).minimumScaleFactor(minimumScale)
        }
    }
}

struct GODLWordmark: View {
    let width: CGFloat

    var body: some View {
        Image(nsImage: GODLBrand.wordmark)
            .renderingMode(.original)
            .resizable()
            .scaledToFit()
            .frame(width: width, height: width / 3)
            .accessibilityLabel("GODL")
    }
}

/// A denomination, not a separate logo or accessibility stop.
struct GODLAmount: View {
    let value: String
    var iconSize: CGFloat = 12
    var spacing: CGFloat = 5
    var animated = false
    var minimumScale: CGFloat = 0.75

    var body: some View {
        LedgerAmount(value: value, asset: .godl, iconSize: iconSize, spacing: spacing,
                     animated: animated, minimumScale: minimumScale)
    }
}

@MainActor
enum GODLBrand {
    static let resources: Bundle = {
        // SwiftPM's generated accessor searches beside its executable. A macOS
        // app must instead use the sealed resources inside Contents/Resources.
        guard Bundle.main.bundleURL.pathExtension == "app" else { return .module }
        guard let url = Bundle.main.resourceURL?.appendingPathComponent("GODLMacOS_GODLMonitor.bundle"),
              let bundle = Bundle(url: url) else {
            preconditionFailure("The GODL brand resource bundle is missing from the app.")
        }
        return bundle
    }()

    static let wordmark = loadImage("godl-wordmark")
    // Keep currency artwork separate from the template-tinted status item.
    static let amountMark = loadImage("godl-mark")
    static let inlineAmountMark: NSImage = {
        let image = loadImage("godl-mark")
        image.size = NSSize(width: 12, height: 12)
        return image
    }()

    static let menuBarIcon: NSImage = {
        let image = loadImage("godl-mark")
        image.size = NSSize(width: 18, height: 18)
        // Preserve the official silhouette while allowing macOS to provide
        // appropriate contrast on light, dark and tinted menu bars.
        image.isTemplate = true
        return image
    }()

    private static func loadImage(_ name: String) -> NSImage {
        guard let url = resources.url(forResource: name, withExtension: "png"),
              let image = NSImage(contentsOf: url) else {
            preconditionFailure("The official GODL artwork must be included in the app resources.")
        }
        return image
    }
}
