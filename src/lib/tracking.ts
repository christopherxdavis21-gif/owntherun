/**
 * Platform-aware GPS tracking abstraction.
 *
 * - On the web: uses `navigator.geolocation.watchPosition` + Wake Lock.
 *   Tracking pauses when the tab is backgrounded by the OS — that's a browser
 *   limitation, not something we can fix with code.
 *
 * - On native (Capacitor iOS/Android): when the app is installed as a native
 *   binary and `@capacitor-community/background-geolocation` is present, we
 *   use it to keep recording in the background with a foreground-service
 *   notification (Android) and Always-Allow location permission (iOS).
 *
 * Lock-screen Pause/Resume/Stop controls + Live Activity updates are wired
 * through a small event bus so the UI and the OS notification stay in sync.
 *
 * IMPORTANT: This file is web-safe. It only dynamically imports Capacitor
 * modules at runtime, so the web bundle never tries to resolve them.
 */

export type Coord = [number, number];

export type LocationFix = {
  coord: Coord;
  altitude: number | null;
  altitudeAccuracy: number | null;
  accuracy: number | null;
  timestamp: number;
};

export type TrackingControlEvent = "pause" | "resume" | "stop";

type Listener = (fix: LocationFix) => void;
type ControlListener = (event: TrackingControlEvent) => void;

let watcherHandle: { id?: string; webId?: number } | null = null;
const fixListeners = new Set<Listener>();
const controlListeners = new Set<ControlListener>();

function isNative(): boolean {
  // @ts-expect-error - Capacitor sets this global when running on native
  const cap = typeof window !== "undefined" ? window.Capacitor : undefined;
  return !!cap?.isNativePlatform?.();
}

export function onLocationFix(fn: Listener) {
  fixListeners.add(fn);
  return () => fixListeners.delete(fn);
}

export function onLockScreenControl(fn: ControlListener) {
  controlListeners.add(fn);
  return () => controlListeners.delete(fn);
}

function emitFix(fix: LocationFix) {
  fixListeners.forEach((l) => l(fix));
}

export function emitControl(event: TrackingControlEvent) {
  controlListeners.forEach((l) => l(event));
}

/**
 * Start tracking. Returns true if a tracker was successfully started.
 */
export async function startTracking(): Promise<boolean> {
  if (watcherHandle) await stopTracking();

  if (isNative()) {
    try {
      const { BackgroundGeolocation } = await import(/* @vite-ignore */ "@capacitor-community/background-geolocation");
      const id = await BackgroundGeolocation.addWatcher(
        {
          backgroundMessage: "Recording your run",
          backgroundTitle: "Catch Up",
          requestPermissions: true,
          stale: false,
          distanceFilter: 3,
        },
        (location: {
          latitude: number;
          longitude: number;
          altitude: number | null;
          altitudeAccuracy: number | null;
          accuracy: number | null;
          time: number;
        }) => {
          emitFix({
            coord: [location.longitude, location.latitude],
            altitude: location.altitude,
            altitudeAccuracy: location.altitudeAccuracy,
            accuracy: location.accuracy,
            timestamp: location.time,
          });
        },
      );
      watcherHandle = { id };
      return true;
    } catch {
      // Fall through to web fallback
    }
  }

  // Web fallback
  if (typeof navigator === "undefined" || !navigator.geolocation) return false;
  const webId = navigator.geolocation.watchPosition(
    (pos) => {
      emitFix({
        coord: [pos.coords.longitude, pos.coords.latitude],
        altitude: pos.coords.altitude,
        altitudeAccuracy: pos.coords.altitudeAccuracy,
        accuracy: pos.coords.accuracy,
        timestamp: pos.timestamp,
      });
    },
    () => {},
    { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 },
  );
  watcherHandle = { webId };
  return true;
}

export async function stopTracking(): Promise<void> {
  if (!watcherHandle) return;

  if (watcherHandle.id && isNative()) {
    try {
      const { BackgroundGeolocation } = await import(/* @vite-ignore */ "@capacitor-community/background-geolocation");
      await BackgroundGeolocation.removeWatcher({ id: watcherHandle.id });
    } catch {
      /* ignore */
    }
  }
  if (watcherHandle.webId != null && typeof navigator !== "undefined") {
    navigator.geolocation.clearWatch(watcherHandle.webId);
  }
  watcherHandle = null;
}

/**
 * Update the lock-screen / Live Activity surface with current run stats.
 * No-op on the web. On native, posts a sticky notification (Android) and
 * updates the Live Activity (iOS).
 */
export async function updateLockScreenStats(stats: {
  distanceMeters: number;
  elapsedSeconds: number;
  paceSecondsPerMile: number;
  elevationMeters: number;
  status: "running" | "paused";
}): Promise<void> {
  if (!isNative()) return;
  try {
    const { LocalNotifications } = await import(/* @vite-ignore */ "@capacitor/local-notifications");
    const miles = (stats.distanceMeters / 1609.344).toFixed(2);
    const m = Math.floor(stats.elapsedSeconds / 60);
    const s = String(stats.elapsedSeconds % 60).padStart(2, "0");
    const pm = Math.floor(stats.paceSecondsPerMile / 60);
    const ps = String(Math.round(stats.paceSecondsPerMile % 60)).padStart(2, "0");
    await LocalNotifications.schedule({
      notifications: [
        {
          id: 1001,
          title: stats.status === "running" ? "Recording run" : "Run paused",
          body: `${miles} mi · ${m}:${s} · ${pm}:${ps} /mi`,
          ongoing: true,
          autoCancel: false,
          actionTypeId: "RUN_CONTROLS",
        },
      ],
    });
  } catch {
    /* ignore */
  }

  // Live Activity (iOS) — only if plugin is installed
  try {
    const liveActivities = await import(/* @vite-ignore */ "capacitor-live-activities");
    await liveActivities.LiveActivities?.update?.({
      activityId: "current-run",
      contentState: stats,
    });
  } catch {
    /* ignore */
  }
}

/**
 * Register the lock-screen action buttons and route their taps back through
 * `emitControl`. Call once during app startup on native.
 */
export async function registerLockScreenControls(): Promise<void> {
  if (!isNative()) return;
  try {
    const { LocalNotifications } = await import(/* @vite-ignore */ "@capacitor/local-notifications");
    await LocalNotifications.registerActionTypes({
      types: [
        {
          id: "RUN_CONTROLS",
          actions: [
            { id: "pause", title: "Pause" },
            { id: "resume", title: "Resume" },
            { id: "stop", title: "Stop", destructive: true },
          ],
        },
      ],
    });
    await LocalNotifications.addListener(
      "localNotificationActionPerformed",
      (event: { actionId: string }) => {
        if (event.actionId === "pause" || event.actionId === "resume" || event.actionId === "stop") {
          emitControl(event.actionId);
        }
      },
    );
  } catch {
    /* ignore */
  }
}
