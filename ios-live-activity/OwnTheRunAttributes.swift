import ActivityKit
import Foundation

/**
 * Shared Live Activity attributes.
 *
 * IMPORTANT: this file must be a member of BOTH targets —
 * the main `App` target and the `OwnTheRunActivity` widget extension.
 */
public struct OwnTheRunAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        public var distanceMeters: Double
        public var elapsedSeconds: Int
        public var paceSecondsPerMile: Double
        public var status: String // "running" | "paused"

        public init(distanceMeters: Double, elapsedSeconds: Int, paceSecondsPerMile: Double, status: String) {
            self.distanceMeters = distanceMeters
            self.elapsedSeconds = elapsedSeconds
            self.paceSecondsPerMile = paceSecondsPerMile
            self.status = status
        }
    }

    public var title: String

    public init(title: String) {
        self.title = title
    }
}

public enum OTRFormat {
    public static func miles(_ meters: Double) -> String {
        String(format: "%.2f mi", meters / 1609.344)
    }

    public static func duration(_ seconds: Int) -> String {
        let h = seconds / 3600, m = (seconds % 3600) / 60, s = seconds % 60
        return h > 0
            ? String(format: "%d:%02d:%02d", h, m, s)
            : String(format: "%d:%02d", m, s)
    }

    public static func pace(_ secondsPerMile: Double) -> String {
        guard secondsPerMile.isFinite, secondsPerMile > 0 else { return "--:--" }
        let total = Int(secondsPerMile.rounded())
        return String(format: "%d:%02d /mi", total / 60, total % 60)
    }
}
