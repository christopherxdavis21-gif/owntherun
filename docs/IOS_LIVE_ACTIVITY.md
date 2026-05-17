# iOS Live Activity + Lock-Screen Setup (Own The Run)

This guide is the **Xcode-side** work you need to do once, after running
`npx cap sync ios`, so the app can:

1. Keep recording GPS in the background when the screen is locked.
2. Show a sticky **lock-screen notification** with Pause / Resume / Stop
   buttons (already wired in JS — just needs the iOS permission keys).
3. (Optional, advanced) Show a real **Live Activity / Dynamic Island**
   widget like Strava does.

JS side is already done: `src/lib/tracking.ts` calls
`registerLockScreenControls()` + `updateLockScreenStats()` on every run.
You just need iOS to know it has permission to do these things in the
background.

---

## 1. Required Info.plist keys

Open `ios/App/App/Info.plist` and add these entries inside the top-level
`<dict>`:

```xml
<!-- Background GPS while the screen is locked -->
<key>UIBackgroundModes</key>
<array>
  <string>location</string>
  <string>fetch</string>
  <string>processing</string>
</array>

<!-- Location permission strings (shown in the iOS system prompt) -->
<key>NSLocationWhenInUseUsageDescription</key>
<string>Own The Run uses your location to record your runs and show you on the map.</string>

<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
<string>Own The Run needs background location so your run keeps recording with the screen off and in your pocket.</string>

<key>NSLocationAlwaysUsageDescription</key>
<string>Own The Run needs background location so your run keeps recording with the screen off.</string>

<!-- Lock-screen notification permission strings -->
<key>NSUserNotificationsUsageDescription</key>
<string>Own The Run shows your live stats and Pause/Resume/Stop controls on the lock screen.</string>
```

Without `UIBackgroundModes → location`, iOS suspends the app the moment
the screen locks and GPS recording dies — that's the "stops tracking when
I lock my phone" bug.

Without `NSLocationAlwaysAndWhenInUseUsageDescription`, the user can't
choose **Always Allow** and you only get foreground GPS.

---

## 2. Capabilities

In Xcode → **Signing & Capabilities** tab on the `App` target, click
**+ Capability** and add:

- **Background Modes** → check **Location updates** and
  **Background fetch**.
- **Push Notifications** (only required if you later add server-pushed
  Live Activity updates; harmless to leave off for now).

---

## 3. First-run permission flow

After installing the new build to your phone:

1. First time you tap **Start** in the app, iOS will ask
   _"Allow Own The Run to use your location?"_ — choose **Allow While
   Using App**.
2. iOS then quietly downgrades to background-allowed after you keep
   running with the screen off a few times, OR you can go to **Settings
   → Own The Run → Location → Always**. Pick **Always**.
3. Notifications prompt will appear once on the first run — tap
   **Allow**. This is what powers the lock-screen Pause/Resume/Stop
   buttons.

If you ever see the run distance / map freeze when the phone locks,
99% of the time it's because location was left on "While Using" instead
of "Always". Re-check **Settings → Own The Run → Location**.

---

## 4. (Optional) True Live Activity / Dynamic Island

The sticky lock-screen notification above already gives you stats + the
3 control buttons. If you want the **richer** Strava-style widget that
floats on the lock screen and lives in the Dynamic Island, you need a
native Widget Extension. That can _only_ be added in Xcode — Lovable
cannot generate Swift code.

### Steps (do this once, after the steps above)

1. In Xcode: **File → New → Target… → Widget Extension**.
   - Product Name: `OwnTheRunActivity`
   - **Include Live Activity**: ✅
   - **Include Configuration Intent**: ❌
2. In `Info.plist` of your **main App target**, add:
   ```xml
   <key>NSSupportsLiveActivities</key>
   <true/>
   ```
3. Open the generated `OwnTheRunActivityLiveActivity.swift` and define
   the content state:
   ```swift
   import ActivityKit
   import WidgetKit
   import SwiftUI

   struct OwnTheRunAttributes: ActivityAttributes {
     public struct ContentState: Codable, Hashable {
       var distanceMiles: Double
       var elapsedSeconds: Int
       var paceSecPerMile: Int
       var status: String   // "running" | "paused"
     }
   }
   ```
4. Bridge it to JS. The simplest path is the community plugin
   [`capacitor-live-activities`](https://github.com/wwwtyro/capacitor-live-activities)
   — install with `npm i capacitor-live-activities`, then in
   `src/lib/tracking.ts` add an `updateLiveActivity()` call right
   alongside `updateLockScreenStats()`. (Currently commented out / not
   wired so the build keeps working with no native extension.)
5. Rebuild + redeploy to TestFlight.

Until step 4 is done, the **lock-screen notification** version (which
ships in this build) is the equivalent UX — stats + Pause/Resume/Stop
right on the lock screen, just without the Dynamic Island pill.

---

## TL;DR

For the immediate user complaint ("can't see/control my run from the
lock screen, GPS deviates when locked"):

- Add the **Info.plist** keys in step 1.
- Add the **Background Modes** capability in step 2.
- Rebuild + push to TestFlight.

That's it — no Swift required, no Live Activity extension required.
The Dynamic Island version is a nice-to-have you can add later.
