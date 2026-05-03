# Catch Up — Mobile (iOS / Android via Capacitor)

The iOS/Android apps are **native shells** that load the live deployed
web app (`https://owntherun.lovable.app`) inside a WebView. The native
shell exists so we can use iOS/Android-only capabilities the browser
sandbox blocks: background GPS, lock-screen controls, Live Activities,
push notifications.

This means web updates ship instantly (no App Review re-submit) while
native capabilities still work.

## One-time setup on your Mac

```bash
cd ~/owntherun
bun install
bun add -d @capacitor/core @capacitor/cli
bun add @capacitor/ios @capacitor/local-notifications

# Sync the latest config + shim into the iOS project
bunx cap sync ios

# Open in Xcode
bunx cap open ios
```

If the `ios/` folder doesn't exist yet (first time only):

```bash
bunx cap add ios
bunx cap sync ios
bunx cap open ios
```

## In Xcode

1. Click the **App** project at the top of the left sidebar
2. Open the **Signing & Capabilities** tab
3. Pick your **Team** (sign in with your Apple ID if needed)
4. If you see a bundle-id error, change `app.catchup.run` to something
   unique like `com.yourname.catchup`
5. Plug in your iPhone, select it from the device dropdown at the top
6. Press the ▶️ Play button

First run on your phone: **Settings → General → VPN & Device Management
→ trust your developer profile**, then tap the Catch Up icon.

## iOS permissions (paste into Info.plist)

In Xcode left sidebar, open `App/App/Info.plist` (right-click → Open As
→ Source Code) and add inside the top-level `<dict>`:

```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>Catch Up uses your location to record your run path on the map.</string>
<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
<string>Catch Up keeps recording your run when your phone is locked or the app is in the background.</string>
<key>UIBackgroundModes</key>
<array>
  <string>location</string>
</array>
```

## Background GPS plugin (optional, for lock-screen recording)

```bash
bun add @capacitor-community/background-geolocation
bunx cap sync ios
```

Then re-open Xcode and rebuild. The web app's `src/lib/tracking.ts`
detects the plugin at runtime and uses it when present.

## TestFlight

1. In Xcode: **Product → Archive**
2. When the Organizer window opens: **Distribute App → App Store Connect**
3. Go to <https://appstoreconnect.apple.com> → My Apps → your app →
   TestFlight tab
4. Add yourself / friends as Internal Testers
5. They install the **TestFlight** app from the App Store, accept your
   invite, and your build appears

## Day-to-day workflow

- **Web/UI changes**: edit in Lovable → published instantly to
  `owntherun.lovable.app` → users see them on next app open
- **Native plugin / config changes**: pull latest, `bunx cap sync ios`,
  rebuild in Xcode, push a new TestFlight build
