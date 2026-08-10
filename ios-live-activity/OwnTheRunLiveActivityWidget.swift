import ActivityKit
import WidgetKit
import SwiftUI

/**
 * Live Activity UI: lock screen banner + Dynamic Island.
 * Add this file to the `OwnTheRunActivity` widget extension target only.
 */

private struct OTRLockScreenView: View {
    let state: OwnTheRunAttributes.ContentState

    var body: some View {
        HStack(spacing: 16) {
            Image("AppLogo")
                .resizable()
                .frame(width: 36, height: 36)
                .clipShape(RoundedRectangle(cornerRadius: 9))

            VStack(alignment: .leading, spacing: 2) {
                Text(state.status == "paused" ? "Paused" : "Own The Run")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text(OTRFormat.miles(state.distanceMeters))
                    .font(.title2.bold())
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 2) {
                Text(OTRFormat.duration(state.elapsedSeconds))
                    .font(.headline)
                Text(OTRFormat.pace(state.paceSecondsPerMile))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding()
    }
}

private struct OTRStatView: View {
    let label: String
    let value: String
    let alignment: HorizontalAlignment

    var body: some View {
        VStack(alignment: alignment, spacing: 2) {
            Text(label)
                .font(.caption2)
                .foregroundStyle(.secondary)
            Text(value)
                .font(.headline)
        }
    }
}

struct OwnTheRunLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: OwnTheRunAttributes.self) { context in
            OTRLockScreenView(state: context.state)
                .activityBackgroundTint(Color.black.opacity(0.85))
                .activitySystemActionForegroundColor(Color.white)
        } dynamicIsland: { context in
            let state = context.state

            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    OTRStatView(
                        label: "Distance",
                        value: OTRFormat.miles(state.distanceMeters),
                        alignment: .leading
                    )
                }
                DynamicIslandExpandedRegion(.trailing) {
                    OTRStatView(
                        label: "Pace",
                        value: OTRFormat.pace(state.paceSecondsPerMile),
                        alignment: .trailing
                    )
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text(OTRFormat.duration(state.elapsedSeconds))
                        .font(.title.bold())
                }
            } compactLeading: {
                Image("AppLogo")
                    .resizable()
                    .frame(width: 18, height: 18)
                    .clipShape(RoundedRectangle(cornerRadius: 4))
            } compactTrailing: {
                Text(OTRFormat.miles(state.distanceMeters))
                    .font(.caption2)
            } minimal: {
                Image("AppLogo")
                    .resizable()
                    .frame(width: 18, height: 18)
                    .clipShape(RoundedRectangle(cornerRadius: 4))
            }
        }
    }
}
