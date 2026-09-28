import AppKit
import SwiftUI

@main
struct GODLMonitorApp: App {
    @NSApplicationDelegateAdaptor(MonitorAppDelegate.self) private var delegate
    @StateObject private var controller = MonitorController()
    @StateObject private var navigation = MonitorNavigation()

    var body: some Scene {
        Window("GODL", id: "overview") {
            MonitorScene(controller: controller, navigation: navigation, delegate: delegate)
        }
        .defaultSize(width: 1104, height: 858)
        .windowStyle(.hiddenTitleBar)
        .commands {
            MonitorNavigationCommands(navigation: navigation) { delegate.showWindow() }
            CommandGroup(after: .newItem) {
                Button("Show menu-bar monitor") { delegate.menuBar?.show() }
                    .keyboardShortcut("m", modifiers: [.command, .shift])
                Divider()
                Button("Refresh observation") { controller.refresh() }
                    .keyboardShortcut("r", modifiers: .command)
                    .disabled(controller.isRefreshing)
            }
            CommandGroup(after: .windowSize) {
                Button("Default window size") {
                    guard let window = NSApplication.shared.windows.first(where: { $0.title == "GODL" && $0.styleMask.contains(.titled) }) else { return }
                    window.setContentSize(NSSize(width: 1104, height: 858))
                    window.makeKeyAndOrderFront(nil)
                }.keyboardShortcut("0", modifiers: [.command, .shift])
            }
        }

    }
}

@MainActor
final class MonitorAppDelegate: NSObject, NSApplicationDelegate {
    weak var controller: MonitorController?
    private(set) var menuBar: MenuBarController?
    private var windowAction: (() -> Void)?
    func configure(controller: MonitorController, navigation: MonitorNavigation, revealWindow: @escaping () -> Void) {
        self.controller = controller
        windowAction = revealWindow
        if menuBar == nil {
            menuBar = MenuBarController(controller: controller) { [weak self] in
                navigation.destination = .overview
                self?.showWindow()
            }
        }
    }
    func showWindow() {
        menuBar?.close()
        windowAction?()
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }
    func applicationWillTerminate(_ notification: Notification) { controller?.stop() }
}

private struct MonitorScene: View {
    @ObservedObject var controller: MonitorController
    @ObservedObject var navigation: MonitorNavigation
    let delegate: MonitorAppDelegate
    @Environment(\.openWindow) private var openWindow
    var body: some View {
        MonitorWindow(controller: controller, navigation: navigation)
            .preferredColorScheme(.light)
            .tint(WarmLedger.strongBrass)
            .onAppear {
                delegate.configure(controller: controller, navigation: navigation) {
                    openWindow(id: "overview")
                    NSApplication.shared.activate()
                    NSApplication.shared.windows.first(where: { $0.title == "GODL" && $0.styleMask.contains(.titled) })?.makeKeyAndOrderFront(nil)
                }
            }
    }
}
