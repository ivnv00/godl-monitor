import AppKit
import Combine
import OSLog
import SwiftUI

/// Track the actual SwiftUI window; a title search can select a stale window.
@MainActor
final class OverviewWindow {
    private weak var window: NSWindow?
    private var revealPending = false
    private var observations: [AnyCancellable] = []
    private let logger = Logger(subsystem: "dev.godl.monitor", category: "overview-window")

    func attach(_ window: NSWindow) {
        guard self.window !== window else { return }
        self.window = window
        window.hidesOnDeactivate = false
        observations = [NSWindow.willCloseNotification, NSWindow.didMiniaturizeNotification,
                        NSWindow.didDeminiaturizeNotification, NSWindow.didBecomeKeyNotification,
                        NSWindow.didResignKeyNotification, NSWindow.didEndLiveResizeNotification].map { name in
            NotificationCenter.default.publisher(for: name, object: window).sink { [weak self] _ in
                self?.record(name.rawValue)
            }
        }
        record("attached")
        if revealPending { present() }
    }

    func reveal(create: () -> Void) {
        revealPending = true
        create()
        // SwiftUI may attach a newly created window on the next main-loop turn.
        DispatchQueue.main.async { [weak self] in self?.present() }
    }

    func resetSize() {
        window?.setContentSize(NSSize(width: 1104, height: 858))
        present()
    }

    private func present() {
        guard let window else { return }
        revealPending = false
        if window.isMiniaturized { window.deminiaturize(nil) }
        // AppKit can leave a sliver visible after a display/layout change. Check
        // the reachable title-bar controls, not just intersection with any pixel.
        let titleBar = NSRect(x: window.frame.minX, y: window.frame.maxY - 28,
                              width: min(160, window.frame.width), height: 28)
        if !NSScreen.screens.contains(where: { $0.visibleFrame.contains(titleBar) }) {
            window.center()
        }
        NSApplication.shared.activate()
        window.makeKeyAndOrderFront(nil)
        record("revealed")
    }

    private func record(_ event: String) {
        guard let window else { return }
        // Lifecycle flags only: no balances, addresses, endpoints or screen contents.
        logger.info("\(event, privacy: .public) visible=\(window.isVisible) minimized=\(window.isMiniaturized) key=\(window.isKeyWindow) width=\(window.frame.width) height=\(window.frame.height)")
    }
}

struct OverviewWindowAttachment: NSViewRepresentable {
    let overview: OverviewWindow

    func makeNSView(context: Context) -> Probe {
        let view = Probe()
        view.overview = overview
        return view
    }
    func updateNSView(_ nsView: Probe, context: Context) {}

    final class Probe: NSView {
        weak var overview: OverviewWindow?
        override func viewDidMoveToWindow() {
            super.viewDidMoveToWindow()
            if let window { overview?.attach(window) }
        }
    }
}
