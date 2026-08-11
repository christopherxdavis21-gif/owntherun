import Foundation
import AppIntents

/**
 * Interactive Live Activity buttons (iOS 17+).
 *
 * Tapping Pause / Resume / Finish on the lock screen writes a command into the
 * shared App Group. The main app polls it through the
 * `OwnTheRunLiveActivity.consumeControl()` bridge method and drives the exact
 * same state machine as the in-app buttons.
 *
 * TARGET MEMBERSHIP: this file must belong to BOTH the main `App` target and
 * the `OwnTheRunActivity` widget extension.
 */

public enum OTRControlStore {
    /// Must match the App Group enabled on BOTH targets in Signing & Capabilities.
    public static let appGroup = "group.com.owntherun.app"
    public static let key = "otr.liveactivity.control"

    public static func write(_ command: String) {
        guard let defaults = UserDefaults(suiteName: appGroup) else { return }
        defaults.set(command, forKey: key)
        defaults.set(Date().timeIntervalSince1970, forKey: key + ".at")
    }

    /// Reads and clears the pending command.
    public static func consume() -> String? {
        guard let defaults = UserDefaults(suiteName: appGroup) else { return nil }
        guard let command = defaults.string(forKey: key) else { return nil }
        defaults.removeObject(forKey: key)
        return command
    }
}

@available(iOS 17.0, *)
public struct OTRPauseIntent: LiveActivityIntent {
    public static var title: LocalizedStringResource = "Pause Run"
    public init() {}
    public func perform() async throws -> some IntentResult {
        OTRControlStore.write("pause")
        return .result()
    }
}

@available(iOS 17.0, *)
public struct OTRResumeIntent: LiveActivityIntent {
    public static var title: LocalizedStringResource = "Resume Run"
    public init() {}
    public func perform() async throws -> some IntentResult {
        OTRControlStore.write("resume")
        return .result()
    }
}

@available(iOS 17.0, *)
public struct OTRFinishIntent: LiveActivityIntent {
    public static var title: LocalizedStringResource = "Finish Run"
    public init() {}
    public func perform() async throws -> some IntentResult {
        OTRControlStore.write("stop")
        return .result()
    }
}
