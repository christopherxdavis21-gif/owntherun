## Overview

Two big things bundled into one pass:

1. **Reimagine the Routes tab as "Run"** — a map-first hub centered on the user where they can start a free run, pick a nearby community route, search a destination ("nearest Starbucks") and get a route mapped for them, jump into route creation, or browse saved routes. Route detail pages already have leaderboards — we'll surface them more prominently.
2. **Background tracking + lock-screen controls** (the previously-discussed Capacitor work) so runs keep recording when the phone is locked or in your pocket, with Pause/Resume/Stop on the lock screen and Live Activities on iOS.

---

## Part 1 — Rename + Map-First "Run" Hub

### 1a. Rename "Routes" → "Run" everywhere user-facing
- `src/components/AppShell.tsx`: change the nav item label from "Routes" to "Run" (icon stays `MapIcon`). URL stays `/routes` to avoid breaking saved/shared links — only the label changes.
- Update page titles/copy in `src/routes/routes.index.tsx`, `routes.new.tsx`, `routes.$routeId.tsx` from "Routes" / "Your running library" to "Run" / "Where to today?" style copy.
- Top nav "New Route" button stays — still useful as a shortcut.

### 1b. Restructure `src/routes/routes.index.tsx` as a map-first hub
Replace the current tabs-of-cards layout with a single unified screen:

**Top section — full-width map (`h-[60vh]` desktop, `h-[55vh]` mobile)**
- Centers on user's current location on mount (existing `navigator.geolocation.getCurrentPosition` pattern).
- Renders pins for nearby **public routes** (queried within ~25km of user via a bounding-box filter on the route's first coordinate — done client-side after fetching public routes since we don't have PostGIS).
- Each pin is color-coded: green = community public routes, gold = your saved routes, blue = your own routes.
- Clicking a pin opens a small popup: route name, distance, best leaderboard time, "Open route" + "Start run on this route" buttons.
- A floating **search bar** overlay (top of map): "Search a place to run to…" — uses Mapbox Geocoding API (new server fn, see 1c).
- A floating **action stack** (bottom-right of map):
  - 🟢 **Start free run** (primary, big) — opens the existing `RunTracker` in a sheet/dialog or routes to a new `/routes/track` view.
  - ➕ **Create route** — links to existing `/routes/new`.
  - 📍 **Recenter** — re-centers map on user.

**Below the map — three horizontally-scrolling rails**
- **Nearby routes** — public routes within ~25km, sorted by distance from user.
- **Saved routes** — pulled from `saved_routes` table (existing).
- **Your routes** — pulled by `user_id` (existing).

Each rail item is a compact card showing name, distance, best time on it (1 query per rail using the existing `routes` + `runs` tables), and an "open" link. If a rail has nothing, it's hidden (no empty-state cards eating space).

**Remove the "Track a run" tab** — it's now the floating Start button on the map. The existing `RunTracker` component is reused unchanged (it already handles GPS, save-as-route, leaderboard submission).

### 1c. Location search → "route me there" (the Starbucks use case)
Add two new server functions to `src/lib/mapbox.functions.ts`:

```ts
// Forward geocoding — convert a search query to a place
export const geocodePlace = createServerFn({ method: "POST" })
  .inputValidator(...) // { query: string, proximity?: [lng, lat] }
  .handler(...) // calls https://api.mapbox.com/geocoding/v5/mapbox/places/{query}.json

// Already exists: snapToRoads — reused as-is
```

When the user searches "nearest Starbucks":
1. Call `geocodePlace` with their current location as `proximity` bias.
2. Show top 3-5 results in a dropdown beneath the search bar.
3. On selection, call the existing `snapToRoads` with `[userLocation, destinationCoords]` to generate a walking-route polyline.
4. Render the suggested route on the map in dashed orange. Show distance + estimated walking time.
5. Two buttons appear: **"Start run with this route"** (opens `RunTracker` pre-loaded with the polyline as the planned path) and **"Save as route"** (opens `/routes/new` pre-populated with the waypoints).

The `RunTracker` component gets a new optional `plannedPath?: Coord[]` prop — when provided, the map shows the planned polyline as a faint guide line beneath the live-traced run, so the runner can follow it.

### 1d. Surface route leaderboards on the map cards
The leaderboard already exists on `routes.$routeId.tsx`. We'll just:
- Show **best time + best runner's display name** on every nearby-route map popup and rail card.
- Add a small `<Trophy>` chip badge on the rail card if the route has 5+ leaderboard submissions ("hot route").

No database changes — the data is already there in `runs` filtered by `route_id` and `visibility = 'leaderboard'`.

### 1e. Files touched in Part 1
- **Modified**: `src/components/AppShell.tsx` (nav label), `src/routes/routes.index.tsx` (full rewrite to map hub), `src/components/RunTracker.tsx` (accept `plannedPath` prop), `src/components/RouteMap.tsx` (accept `markers` array prop for showing nearby-route pins + popups), `src/lib/mapbox.functions.ts` (add `geocodePlace`).
- **New**: `src/components/MapHub.tsx` (the new map-with-search-and-actions component, used inside `routes.index.tsx`).
- **No DB changes**.

---

## Part 2 — Background Tracking + Lock-Screen Controls (Capacitor)

This is the previously-discussed plan. Recap of what gets built:

### 2a. Web fallback (works immediately in the Lovable preview)
- Add Screen Wake Lock to `RunTracker.tsx` — when a run starts, request `navigator.wakeLock.request("screen")` so the phone screen doesn't auto-lock. Release on stop/pause.
- Add an in-app banner before starting on web: "On the web, keep this tab open to record. For background tracking, install the mobile app."

### 2b. Capacitor wrapper (the real fix — runs on iOS/Android)
- Install `@capacitor/core`, `@capacitor/cli`, `@capacitor-community/background-geolocation`, `@capacitor/local-notifications`, `capacitor-live-activities`.
- Create `capacitor.config.ts` with app id, name, web dir.
- Create `src/lib/tracking.ts` — a platform-aware abstraction:
  ```ts
  export function startTracking(opts) {
    if (Capacitor.isNativePlatform()) {
      // BackgroundGeolocation.addWatcher with foreground service notification
    } else {
      // navigator.geolocation.watchPosition + Wake Lock
    }
  }
  ```
- Refactor `RunTracker.tsx` to call `startTracking` / `stopTracking` / `pauseTracking` instead of touching `navigator.geolocation` directly.

### 2c. Lock-screen controls
- **Android**: The background-geolocation plugin already creates a foreground-service notification. We extend it via `@capacitor/local-notifications` to add Pause/Resume/Stop action buttons + live stat updates (distance, time, pace, elevation refreshed every 3 seconds while running). The notification renders on the lock screen automatically.
- **iOS Live Activity**: Scaffold a SwiftUI widget file (`ios/App/RunActivity/RunActivity.swift`) that displays distance/time/pace/elevation + Pause/Resume/Stop buttons. Integrate via `capacitor-live-activities` plugin so it appears on the lock screen + Dynamic Island. Updates pushed from JS via the plugin's `update()` API.
- Tapping notification actions calls `pauseTracking()`/`resumeTracking()`/`stopTracking()` in the same `tracking.ts` abstraction, which broadcasts state back to React via a custom event so the in-app UI stays in sync.

### 2d. Mobile build instructions
Create `README-mobile.md` covering:
- `bun install` then `npx cap add ios` / `npx cap add android`
- iOS: `Info.plist` entries (`NSLocationAlwaysAndWhenInUseUsageDescription`, `UIBackgroundModes: location`)
- Android: `AndroidManifest.xml` entries (`ACCESS_BACKGROUND_LOCATION`, foreground-service declaration)
- `npx cap open ios` / `npx cap open android` to build with Xcode/Android Studio
- Note: Lovable's preview will continue to use the web fallback — the lock-screen experience only activates after building the native app on a Mac (iOS) or any machine (Android).

### 2e. Files touched in Part 2
- **Modified**: `src/components/RunTracker.tsx` (use `tracking.ts` abstraction + Wake Lock fallback), `package.json` (new deps).
- **New**: `src/lib/tracking.ts`, `capacitor.config.ts`, `ios/App/RunActivity/RunActivity.swift` (scaffold), `README-mobile.md`.

---

## Build order

1. Part 1a–1e first (the visible UX win — works immediately in the Lovable preview).
2. Part 2a (web Wake Lock) — small, ships immediately.
3. Part 2b–2e (Capacitor + native lock-screen) — bundled second since the native build itself happens on your machine, not in Lovable.

Everything is one continuous pass — no waiting between parts.

## What stays unchanged
- All database tables, RLS, edge functions, auth, profiles, groups, leaderboards page, feed page.
- The `/routes`, `/routes/new`, `/routes/$routeId` URLs (only labels change).
- Existing route-detail leaderboard logic (just gets surfaced earlier in the journey).