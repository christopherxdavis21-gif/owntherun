# Proper Fix: Bundle the App for Offline-Capable iOS

## The problem

TanStack Start is server-rendered — the build outputs a **server bundle** (in `dist/server/`) plus client assets (in `dist/client/`), but no static `index.html`. Capacitor needs a self-contained folder with `index.html` it can load directly on the phone — there's no Node server running inside iOS.

We also have several `createServerFn` handlers (Mapbox, directions, account deletion) that need a backend to live on. Inside a Capacitor app there's no server, so those calls have to go somewhere — they'll be pointed at your deployed Lovable URL (`https://owntherun.lovable.app`).

## What I'll build

### 1. Add a separate Capacitor build target

Create a new Vite config (`vite.config.mobile.ts`) that produces a **pure static SPA** — no SSR, just `index.html` + JS/CSS — written to `dist-mobile/`. Trigger via a new script: `bun run build:mobile`.

This leaves your existing web build (`bun run build` → server-rendered, deployed to Lovable) completely untouched.

### 2. Add a static SPA entry point

Create `src/main.mobile.tsx` and `index.html` (at project root) that bootstrap TanStack Router in **client-only mode** (no SSR shell). The router loads, hydrates instantly, and the app runs entirely in the browser.

### 3. Route server functions to the live API

Add a `VITE_API_BASE_URL` env var. When set (mobile build only), all `createServerFn` calls go to `https://owntherun.lovable.app/_serverFn/...` instead of relative URLs. Web build leaves it unset → calls stay relative as today.

This means:
- Mobile app needs internet to log in, save runs, fetch routes, etc. (same as Strava)
- GPS tracking still works fully offline (it's all native + local state)
- Run gets uploaded next time you have signal

### 4. Update `capacitor.config.ts`

Change `webDir` from `dist/client` → `dist-mobile`.

### 5. Add iOS permission strings

Create `ios-info-additions.plist` snippet (already documented in `README-mobile.md`) — you'll paste these into Xcode's Info tab. Covers: location-when-in-use, location-always, background modes for GPS recording.

### 6. Update README-mobile.md

Replace the current commands with the actual working sequence:

```text
bun install
bun run build:mobile        # NEW — static SPA into dist-mobile/
bunx cap sync ios
bunx cap open ios
```

## Technical details (skip if not interested)

- `vite.config.mobile.ts` strips the `@cloudflare/vite-plugin` and `tanstack-start` server plugins, keeps `tanstack-router` in SPA mode
- New `index.html` shell with `<div id="root">` and `<script type="module" src="/src/main.mobile.tsx">`
- `main.mobile.tsx` does `createRouter()` + `<RouterProvider />` — no `StartClient`
- Server functions: TanStack Start lets you set a base URL for RPC calls via the runtime config. We'll wire `VITE_API_BASE_URL` into that.
- CORS: your deployed `owntherun.lovable.app` needs to allow requests from the Capacitor origin (`capacitor://localhost` on iOS). We'll add CORS headers to the server function handler config.
- Auth: Supabase JS persists tokens in localStorage which Capacitor's WebView supports. Session survives app restarts.

## What you do after I'm done

On your Mac, in `~/owntherun`:

```bash
git pull                      # get my changes from GitHub
bun install
bun run build:mobile
bunx cap sync ios
bunx cap open ios
```

Then in Xcode: Signing & Capabilities → pick your team → plug in iPhone → press ▶️.

## Estimated time

- My side: ~30 min of build config + testing
- Your side: ~5 min to re-run commands + sign in Xcode

## Out of scope (later)

- App icons & splash screens (separate pass)
- Background GPS native plugin wiring (already documented in README-mobile.md, requires a real device to test)
- Live Activities (Swift widget, also separate)

Approve and I'll build it.