import AppKit
import SwiftUI
import GODLCore

struct GODLMonitorApp: App {
    @MainActor static var instanceLease: MonitorInstanceLease?
    @NSApplicationDelegateAdaptor(MonitorAppDelegate.self) private var delegate
    @StateObject private var controller = MonitorController(instanceLease: Self.instanceLease)
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
                    delegate.overview.resetSize()
                }.keyboardShortcut("0", modifiers: [.command, .shift])
            }
        }

    }
}

@MainActor
final class MonitorAppDelegate: NSObject, NSApplicationDelegate {
    let overview = OverviewWindow()
    weak var controller: MonitorController?
    private(set) var menuBar: MenuBarController?
    private var windowAction: (@MainActor () -> Void)?
    func configure(controller: MonitorController, navigation: MonitorNavigation, revealWindow: @escaping @MainActor () -> Void) {
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
        guard let windowAction else { return }
        if let menuBar { menuBar.closeThen(windowAction) }
        else { windowAction() }
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
            .background(OverviewWindowAttachment(overview: delegate.overview).frame(width: 0, height: 0))
            .preferredColorScheme(.light)
            .tint(WarmLedger.strongBrass)
            .onAppear {
                delegate.configure(controller: controller, navigation: navigation) {
                    delegate.overview.reveal { openWindow(id: "overview") }
                }
            }
    }
}
