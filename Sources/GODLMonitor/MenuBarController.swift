import AppKit
import Combine
import SwiftUI

/// Owns the native anchor and focus lifecycle; the content remains SwiftUI.
@MainActor
final class MenuBarController: NSObject, NSPopoverDelegate {
    private let statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
    private let popover = NSPopover()
    private let openOverview: () -> Void
    private let controller: MonitorController
    private var observation: AnyCancellable?

    init(controller: MonitorController, openOverview: @escaping () -> Void) {
        self.openOverview = openOverview
        self.controller = controller
        super.init()
        if let button = statusItem.button {
            button.image = GODLBrand.menuBarIcon
            button.target = self
            button.action = #selector(toggle)
            button.setAccessibilityLabel("GODL menu-bar monitor")
        }
        popover.behavior = .transient
        popover.delegate = self
        popover.contentSize = NSSize(width: 360, height: 600)
        observation = controller.$monitor.sink { [weak self] monitor in
            let balance = monitor?.unrefinedText ?? "No observation"
            self?.statusItem.button?.toolTip = "GODL · \(balance) unrefined"
            self?.statusItem.button?.setAccessibilityValue("\(balance) unrefined GODL")
        }
    }

    @objc func toggle() {
        if popover.isShown { close() } else { show() }
    }

    func show() {
        guard let button = statusItem.button else { return }
        if popover.isShown {
            popover.contentViewController?.view.window?.makeKey()
            return
        }
        // A fresh presentation starts on the live summary, not an old drill-in.
        popover.contentViewController = NSHostingController(rootView:
            MonitorPopover(controller: controller, openOverview: { [weak self] in
                self?.close()
                self?.openOverview()
            }, close: { [weak self] in self?.close() })
                .preferredColorScheme(.light)
                .tint(WarmLedger.strongBrass)
        )
        popover.animates = !NSWorkspace.shared.accessibilityDisplayShouldReduceMotion
        NSApplication.shared.activate()
        popover.show(relativeTo: button.bounds, of: button, preferredEdge: .minY)
        popover.contentViewController?.view.window?.title = "GODL menu-bar monitor"
        popover.contentViewController?.view.window?.makeKey()
    }

    func close() { popover.performClose(nil) }
    func popoverShouldDetach(_ popover: NSPopover) -> Bool { false }
}
