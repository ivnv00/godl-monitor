import AppKit
import SwiftUI

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
        HStack(alignment: .firstTextBaseline, spacing: spacing) {
            Image(nsImage: GODLBrand.amountMark)
                .renderingMode(.original).resizable().scaledToFit()
                .frame(width: iconSize, height: iconSize)
                .alignmentGuide(.firstTextBaseline) { $0[.bottom] - iconSize * 0.04 }
                .accessibilityHidden(true)
            if animated {
                number.ledgerNumber(value)
            } else {
                number
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(value == "—" ? "GODL amount unavailable" : "\(value) GODL")
    }

    private var number: some View {
        Text(value).monospacedDigit().lineLimit(1).minimumScaleFactor(minimumScale)
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
