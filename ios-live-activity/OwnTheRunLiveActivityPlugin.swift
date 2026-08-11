import Foundation
import Capacitor
import ActivityKit

/**
 * Capacitor bridge for the Own The Run Live Activity / Dynamic Island.
 *
 * Add this file to the MAIN app target in Xcode (App/App/).
 */
@objc(OwnTheRunLiveActivityPlugin)
public class OwnTheRunLiveActivityPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "OwnTheRunLiveActivityPlugin"
    public let jsName = "OwnTheRunLiveActivity"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isSupported", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "end", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "consumeControl", returnType: CAPPluginReturnPromise)
    ]

    private var activity: Any?

    @objc func isSupported(_ call: CAPPluginCall) {
        if #available(iOS 16.2, *) {
            call.resolve(["supported": ActivityAuthorizationInfo().areActivitiesEnabled])
        } else {
            call.resolve(["supported": false])
        }
    }

    @available(iOS 16.2, *)
    private func state(from call: CAPPluginCall) -> OwnTheRunAttributes.ContentState {
        OwnTheRunAttributes.ContentState(
            distanceMeters: call.getDouble("distanceMeters") ?? 0,
            elapsedSeconds: call.getInt("elapsedSeconds") ?? 0,
            paceSecondsPerMile: call.getDouble("paceSecondsPerMile") ?? 0,
            status: call.getString("status") ?? "running"
        )
    }

    @objc func start(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else { return call.resolve() }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            return call.reject("Live Activities are disabled in Settings")
        }
        do {
            let content = ActivityContent(state: state(from: call), staleDate: nil)
            activity = try Activity.request(
                attributes: OwnTheRunAttributes(title: "Own The Run"),
                content: content,
                pushType: nil
            )
            call.resolve()
        } catch {
            call.reject("Failed to start Live Activity: \(error.localizedDescription)")
        }
    }

    @objc func update(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *), let activity = activity as? Activity<OwnTheRunAttributes> else {
            return call.resolve()
        }
        let content = ActivityContent(state: state(from: call), staleDate: nil)
        Task { await activity.update(content); call.resolve() }
    }

    @objc func end(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *), let activity = activity as? Activity<OwnTheRunAttributes> else {
            return call.resolve()
        }
        Task {
            await activity.end(nil, dismissalPolicy: .immediate)
            self.activity = nil
            call.resolve()
        }
    }

    /// Returns (and clears) any Pause/Resume/Finish command tapped on the
    /// lock-screen Live Activity buttons.
    @objc func consumeControl(_ call: CAPPluginCall) {
        call.resolve(["command": OTRControlStore.consume() ?? ""])
    }
}
