import ActivityKit
import WidgetKit
import SwiftUI

/**
 * Live Activity UI: lock screen banner + Dynamic Island.
 * Add this file to the `OwnTheRunActivity` widget extension target only.
 */
struct OwnTheRunLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: OwnTheRunAttributes.self) { context in
            // Lock screen / banner
            HStack(spacing: 16) {
                Image("AppLogo")
                    .resizable()
                    .frame(width: 36, height: 36)
                    .clipShape(RoundedRectangle(cornerRadius: 9))

                VStack(alignment: .leading, spacing: 2) {
                    Text(context.state.status == "paused" ? "Paused" : "Own The Run")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text(OTRFormat.miles(context.state.distanceMeters))
                        .font(.title2.bold())
                }

                Spacer()

                VStack(alignment: .trailing, spacing: 2) {
                    Text(OTRFormat.duration(context.state.elapsedSeconds))
                        .font(.headline.monospacedDigit())
                    Text(OTRFormat.pace(context.state.paceSecondsPerMile))
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(.secondary)
                }
            }
            .padding()
            .activityBackgroundTint(Color.black.opacity(0.85))
            .activitySystemActionForegroundColor(Color.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    VStack(alignment: .leading) {
                        Text("Distance").font(.caption2).foregroundStyle(.secondary)
                        Text(OTRFormat.miles(context.state.distanceMeters)).font(.headline)
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    VStack(alignment: .trailing) {
                        Text("Pace").font(.caption2).foregroundStyle(.secondary)
                        Text(OTRFormat.pace(context.state.paceSecondsPerMile)).font(.headline.monospacedDigit())
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text(OTRFormat.duration(context.state.elapsedSeconds))
                        .font(.title.monospacedDigit().bold())
                }
            } compactLeading: {
                Image("AppLogo")
                    .resizable()
                    .frame(width: 18, height: 18)
                    .clipShape(RoundedRectangle(cornerRadius: 4))
            } compactTrailing: {
                Text(OTRFormat.miles(context.state.distanceMeters))
                    .font(.caption2.monospacedDigit())
            } minimal: {
                Image("AppLogo")
                    .resizable()
                    .frame(width: 18, height: 18)
                    .clipShape(RoundedRectangle(cornerRadius: 4))
            }
        }
    }
}
