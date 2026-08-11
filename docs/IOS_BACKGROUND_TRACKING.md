# Pocket-proof background tracking — iOS setup

Everything in the JS/TS layer is done. This file covers the three things that
can only be done in Xcode, on your Mac, because the `ios/` folder is generated
locally by `cap sync` and is not part of this repo.

## Already handled for you (no action needed)

The `@capacitor-community/background-geolocation` plugin sets these on its
`CLLocationManager` the moment we pass a `backgroundMessage`, which we do
(`src/lib/tracking.ts`):

- `allowsBackgroundLocationUpdates = true`
- `showsBackgroundLocationIndicator = true`
- `pausesLocationUpdatesAutomatically = false`
- `desiredAccuracy = kCLLocationAccuracyBest` (upgrades to
  `BestForNavigation` automatically while charging)
- `distanceFilter = kCLDistanceFilterNone` — every fix is delivered

Also already in the app:

- Kalman filtering of accepted fixes (`src/lib/gpsFilter.ts`)
- Mapbox map matching (snap-to-road) when a run is saved
- Speed-based dead reckoning as a fallback

## Step 1 — Add the pedometer plugin to the Xcode project

CoreMotion keeps counting steps on the motion coprocessor even while the app is
suspended, which is what keeps mileage accruing when the phone is in a pocket
and GPS has degraded.

1. In Finder, open the `ios-native/` folder in the project.
2. Drag **both** files into the Xcode sidebar, into the `App` folder:
   - `OwnTheRunPedometerPlugin.swift`
   - `OwnTheRunPedometerPlugin.m`
3. In the dialog: tick **Copy items if needed**, and under **Add to targets**
   tick **App** only (not the widget extension).
4. If Xcode offers to create a bridging header, click **Create**.

## Step 2 — Add the motion permission string

Without this key the app crashes the first time it touches CoreMotion.

1. Xcode sidebar -> `App` -> `Info.plist`
2. Hover a row, click **+**
3. Key: `NSMotionUsageDescription`
4. Type: **String**
5. Value: `Own The Run uses motion data to keep tracking your distance when GPS
   signal is weak, such as when your phone is in a pocket.`

While you are in there, confirm these exist:

| Key | Value |
| --- | --- |
| `NSLocationWhenInUseUsageDescription` | any explanation string |
| `NSLocationAlwaysAndWhenInUseUsageDescription` | any explanation string |
| `NSSupportsLiveActivities` | Boolean **YES** |
| `UIBackgroundModes` | contains `location` (and `fetch`) |

## Step 3 — Capabilities

1. Select the **App** target -> **Signing & Capabilities**
2. Confirm **Background Modes** is present with **Location updates** checked.

## Step 4 — Build and ship

```bash
cd ~/owntherun
git pull && bun install && bunx cap sync ios
bash scripts/match-build-numbers.sh
```

Then in Xcode: **Product -> Clean Build Folder** -> **Archive** -> **Distribute App**.

## Step 5 — On the phone, before the test run

- Settings -> Own The Run -> Location -> **Always**
- Settings -> Own The Run -> **Motion & Fitness** -> ON
- Settings -> Own The Run -> **Live Activities** -> ON
- **Low Power Mode OFF** (it throttles background location hard)

## How to tell it worked

- A **blue pill** appears around the clock while tracking with the screen on.
- The Dynamic Island / Lock Screen shows the Live Activity with live stats.
- Distance keeps climbing during a stretch where the map line pauses — that is
  the pedometer bridging a GPS gap, working as designed.
