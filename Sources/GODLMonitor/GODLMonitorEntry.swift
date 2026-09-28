import AppKit
import GODLCore

@main
enum GODLMonitorEntry {
    @MainActor static func main() {
        do {
            // Acquire before SwiftUI constructs controllers, reads profiles or starts helpers.
            GODLMonitorApp.instanceLease = try MonitorInstanceLease(directory: MonitorController.defaultDataDirectory)
        } catch {
            showStartupFailure(error as? MonitorInstanceLease.Failure ?? .unavailable)
            return
        }
        GODLMonitorApp.main()
    }

    @MainActor private static func showStartupFailure(_ failure: MonitorInstanceLease.Failure) {
        let app = NSApplication.shared
        app.setActivationPolicy(.regular)
        // This path never enters SwiftUI's application loop. Complete native
        // launch so the recovery dialog is accessible and receives activation.
        app.finishLaunching()
        let alert = NSAlert()
        alert.alertStyle = .informational
        if failure == .alreadyRunning {
            alert.messageText = "GODL Monitor is already running"
            alert.informativeText = "Use the GODL icon in the menu bar to open the running copy. To switch versions, quit that copy first, then open this one. If it just closed, allow its current update to finish and try again."
        } else {
            alert.messageText = "GODL Monitor couldn’t safely open local data"
            alert.informativeText = "This copy hasn’t started monitoring. Check that your account can access GODL Monitor’s Application Support folder, then reopen the app. Keep the existing files in place."
        }
        alert.addButton(withTitle: "Close this copy")
        app.activate(ignoringOtherApps: true)
        alert.runModal()
    }
}
