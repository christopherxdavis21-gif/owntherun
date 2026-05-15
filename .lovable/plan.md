# Own The Run — feature + fix pass

Five things bundled here. I'll do them in this order so we can test each one.

## 1. Rebrand to Own The Run (OTR)

- Replace "Catch Up" everywhere in the UI: header (`AppShell.tsx`), page titles, meta tags in `__root.tsx` and per-route `head()`, auth screen copy, share text, lock-screen notification ("Recording run" stays, but title becomes "Own The Run").
- Update `package.json` `name`, `capacitor.config.ts` `appName` → "Own The Run" (the iOS bundle id stays the same so TestFlight keeps working).
- Use "OTR" as the short form in tight spaces (e.g. lock-screen, tab title fallback).
- App icon already uses your logo — no change needed there.

## 2. Cleaner route rendering on the map

Today every GPS fix is drawn as a yellow dot on top of the line, which is what makes it look noisy. Fix:

- Remove the per-point circle layer in `RouteMap.tsx`.
- Render the route as a single smooth line: 4px neon-green stroke, rounded line-join/line-cap, subtle outer glow (wider semi-transparent stroke underneath for the "Strava-ish" look).
- Keep only two markers: a green **Start** pin and a checkered **Finish** pin.
- Same treatment on the route detail page and the post-run summary.

## 3. Fix the "ran a 5k, only tracked 0.01 mi" bug

This is the important one. Most likely causes given the current `tracking.ts`:

1. On the web (Mobile Safari / Chrome), `watchPosition` pauses when the screen locks or the tab is backgrounded — so a phone in your pocket records nothing. The app already has a Capacitor background-geolocation path, but it only kicks in when running as the installed native app. Confirm you were testing in TestFlight (native) vs. Safari (web).
2. Even on native, we currently drop fixes silently and never persist a partial track if the app is killed.

Plan:

- Add a visible "tracking source" indicator on the run screen (Native GPS / Browser GPS) so we can tell at a glance which path is active.
- Lower `distanceFilter` from 3m → 1m, and stop filtering out fixes whose accuracy is poor — instead, weight them but still record (raw track + a smoothed/displayed track).
- Persist every fix to `localStorage` as it comes in, so a crash/kill doesn't lose the run. On app open, if an in-progress run exists, offer to resume/save it.
- Add a server-side sanity check: if `recorded distance < 0.1 mi` but `elapsed > 5 min`, surface a clear "GPS didn't record — were you in Safari with the screen off?" message instead of silently saving a 0.01 mi run.
- Document the iOS Always-Allow location requirement in the permission primer.

## 4. Submitted routes save to the map + per-route leaderboard

Schema changes (one migration):

- `routes` table already exists. Add `is_public boolean default true`, `created_by uuid`, `geometry jsonb` (the cleaned line), `distance_meters`, `start_point geography(point)` for nearby lookup.
- New `route_runs` table: `id`, `route_id`, `user_id`, `duration_seconds`, `distance_meters`, `pace_seconds_per_mile`, `completed_at`. RLS: anyone can read public route runs; users can only insert their own.
- When you finish a run that was started from a saved route, write a row to `route_runs`.

UI:

- The main map (`MapHub.tsx`) gets a "Public routes near you" layer — each saved public route renders as a thin line; tap → route detail.
- Route detail page (`routes.$routeId.tsx`) gets a **Leaderboard** section (already shown in your screenshot as a placeholder) wired to `route_runs`, sorted by `duration_seconds` ascending, with user display name + pace + date. Top 3 get medal icons.

## 5. Post-run summary + shareable card

After tapping Finish:

- New `RunSummary` screen with: hero map of the route (clean line, start/finish pins), big stats grid (distance, time, avg pace, elevation, calories estimate), splits per mile, and a small elevation chart.
- "Share" button generates a 1080x1920 PNG (Instagram story aspect) on a canvas: dark background, route line, your stats, OTR logo + watermark. Uses the browser `Canvas` API so it works on web and native.
- On native, hand the PNG to Capacitor Share so it opens the iOS share sheet (Instagram, Messages, etc.). On web, trigger a download.
- Save the run regardless of whether the user shares.

## Order of work

1. Rebrand (fast, low risk).
2. Clean map rendering (visible win immediately).
3. Tracking fix + persistence + indicator.
4. Schema migration → public routes on map → leaderboard.
5. Post-run summary + share card.

I'll pause for your approval before the schema migration in step 4, since that one's the only irreversible piece.

## Technical notes

- Capacitor Share plugin (`@capacitor/share`) needs to be added; on web it falls back to Web Share API or download.
- Canvas-based share image renders client-side — no server round-trip, no extra cost.
- Keeping the iOS bundle id unchanged means your existing TestFlight build + your friend's invite keep working through the rename.
