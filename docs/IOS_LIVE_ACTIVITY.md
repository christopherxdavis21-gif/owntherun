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
<!-- Do NOT add "processing": Apple rejects the upload unless you also
     declare BGTaskSchedulerPermittedIdentifiers. We don't use BGTaskScheduler. -->
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

## 4. Live Activity / Dynamic Island (Strava-style pill)

The JS side is **already wired**: `src/lib/liveActivity.ts` calls the native
plugin `OwnTheRunLiveActivity`, and `RunTracker.tsx` pushes distance / time /
pace every 3 seconds. If the native piece below isn't installed, every call
silently no-ops, so the app keeps working.

Three Swift files ship in the repo folder **`ios-live-activity/`**:

| File | Goes in target |
| --- | --- |
| `OwnTheRunAttributes.swift` | **both** App + widget extension |
| `OwnTheRunLiveActivityPlugin.swift` | App target only |
| `OwnTheRunLiveActivityWidget.swift` | widget extension only |

### Steps (once, on your Mac)

1. `git pull` then `bunx cap sync ios`, and open `ios/App/App.xcworkspace`.
2. **File → New → Target… → Widget Extension**
   - Product Name: `OwnTheRunActivity`
   - **Include Live Activity**: checked
   - **Include Configuration App Intent**: unchecked
   - Click **Activate** when Xcode asks about the new scheme.
   - Delete the placeholder `OwnTheRunActivity.swift` body Xcode generates for
     the timeline widget if you don't want a home-screen widget (keep the
     `@main` bundle file).
3. Drag the three files from `ios-live-activity/` into Xcode's project
   navigator (check **Copy items if needed**):
   - `OwnTheRunAttributes.swift` → tick **App** *and* **OwnTheRunActivityExtension**
   - `OwnTheRunLiveActivityPlugin.swift` → tick **App** only
   - `OwnTheRunLiveActivityWidget.swift` → tick **OwnTheRunActivityExtension** only
4. In the extension's `@main` widget bundle, make sure it lists our widget:
   ```swift
   @main
   struct OwnTheRunActivityBundle: WidgetBundle {
       var body: some Widget {
           OwnTheRunLiveActivity()
       }
   }
   ```
5. **Info.plist of the main App target** — add:
   ```xml
   <key>NSSupportsLiveActivities</key>
   <true/>
   ```
6. **App icon in the pill:** in the extension's `Assets.xcassets`, add a new
   **Image Set** named `AppLogo` and drop your 1024pt icon (or the OTR mark)
   into it. That's what shows in the Dynamic Island and lock-screen banner.
7. **Product → Clean Build Folder** (Shift+Cmd+K) → **Product → Archive** →
   Distribute to TestFlight.

### On the phone

- Settings → **Own The Run** → **Live Activities** must be ON
  (also Settings → Face ID & Passcode → **Live Activities on lock screen** ON).
- Start a run: the OTR pill appears in the Dynamic Island with distance, and
  expands to distance / pace / elapsed. It disappears when you stop the run.

### Troubleshooting

- **No pill at all:** `NSSupportsLiveActivities` missing, or Live Activities
  disabled in Settings.
- **Build error "cannot find OwnTheRunAttributes":** the attributes file isn't
  a member of both targets (step 3).
- **Pill shows but never updates:** the widget extension and app must share the
  same team/bundle prefix — extension bundle id must be
  `com.yourid.owntherun.OwnTheRunActivity`.

---

## TL;DR

1. Info.plist keys (step 1) + Background Modes capability (step 2) → background GPS.
2. Widget Extension + the three Swift files in `ios-live-activity/` (step 4) → Dynamic Island pill.
3. Clean, archive, upload to TestFlight.

---

## Lock-screen controls (Pause / Resume / Finish)

The Live Activity now shows **distance, time, pace** plus interactive
**Pause / Resume / Finish** buttons (iOS 17+). Tapping them drives the same
state machine as the in-app buttons — no unlock required.

### 1. Add the new file
Drag `ios-live-activity/OwnTheRunControlIntents.swift` into Xcode.
Target membership: **App _and_ OwnTheRunActivity** (both ticked).

### 2. Enable an App Group (required — this is how the button reaches the app)
For **each** target (App, then OwnTheRunActivity):
Signing & Capabilities → **+ Capability** → **App Groups** → **+** →
`group.com.owntherun.app`

The identifier must match `OTRControlStore.appGroup` in
`OwnTheRunControlIntents.swift` exactly, and must be ticked on both targets.

### 3. Replace the widget file
Delete the old `OwnTheRunLiveActivityWidget.swift` reference in Xcode
("Remove Reference"), then drag in the updated one from
`ios-live-activity/`. Target membership: **OwnTheRunActivity only**.

### 4. Confirm Info.plist
The main app's `Info.plist` needs:
```xml
<key>NSSupportsLiveActivities</key>
<true/>
```

### 5. Build
`bunx cap sync ios`, then Product → Clean Build Folder → Cmd + B.

On iOS 16.x the buttons are hidden automatically and the banner still shows
distance/time/pace.
