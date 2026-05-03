# Catch Up — Mobile build (background tracking + lock-screen controls)

The web app records GPS only while the browser tab is in the foreground —
that's a browser sandbox limitation that no amount of code can fix. To get
the Strava-style experience where you lock your phone, drop it in your
pocket, and the run keeps recording (with Pause / Resume / Stop on the
lock screen and a Live Activity on iOS), wrap the same web app in a
Capacitor native shell.

Everything below happens **on your local machine** — the Lovable preview
will continue to use the web fallback.

## 1. One-time setup

```bash
bun install
bun add @capacitor/core @capacitor/cli @capacitor/local-notifications \
        @capacitor-community/background-geolocation \
        capacitor-live-activities

# Generate native projects
bun run build
npx cap add ios
npx cap add android
npx cap sync
```

The repo already includes `capacitor.config.ts` at the root.

## 2. iOS configuration

Open `ios/App/App/Info.plist` and add:

```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>Catch Up uses your location to record your run path on the map.</string>
<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
<string>Catch Up keeps recording your run when your phone is locked or the app is in the background. Background location is only requested after you tap Start, never at launch.</string>
<key>UIBackgroundModes</key>
<array>
  <string>location</string>
</array>
```

> **App Review note:** The "Always Allow" prompt is intentionally only shown
> the first time the user taps **Start** on a run — never at app launch.
> See `RunTracker.tsx` → `beginWatch()` for where the native
> `BackgroundGeolocation.addWatcher({ requestPermissions: true })` call lives.

For the Live Activity on the lock screen + Dynamic Island, scaffold a
SwiftUI Widget Extension in Xcode (File → New → Target → Widget Extension)
and wire it to `capacitor-live-activities`. The plugin's README has the
canonical Swift snippet.

Then:

```bash
npx cap open ios
# Build & run on a real device from Xcode (Live Activities don't run in the simulator)
```

## 3. Android configuration

Open `android/app/src/main/AndroidManifest.xml` and add inside `<manifest>`:

```xml
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```

Inside `<application>`:

```xml
<service
  android:name="com.equimaps.capacitor_background_geolocation.BackgroundGeolocationService"
  android:foregroundServiceType="location" />
```

Then:

```bash
npx cap open android
# Build & run on a device
```

## 4. How it works in code

`src/lib/tracking.ts` is a platform-aware abstraction. It tries to import
`@capacitor-community/background-geolocation` at runtime; if that import
fails (web), it falls back to `navigator.geolocation.watchPosition` +
Screen Wake Lock. Same code path either way — your run-tracking UI in
`src/components/RunTracker.tsx` doesn't have to know.

Lock-screen Pause/Resume/Stop buttons come from
`@capacitor/local-notifications`; the actions tap back into
`tracking.ts`'s `emitControl()` which the React UI listens to via
`onLockScreenControl()`.

iOS Live Activities need a tiny SwiftUI widget. The JS side just calls
`updateLockScreenStats()` every few seconds while a run is active and the
plugin pushes the new state to the widget.

## 5. Day-to-day workflow

```bash
# Make changes in the Lovable preview as usual.
# When ready to test on device:
bun run build
npx cap sync
npx cap open ios   # or android
```
