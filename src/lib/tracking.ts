/**
 * Platform-aware GPS tracking abstraction.
 *
 * - On the web: uses `navigator.geolocation.watchPosition` + Wake Lock.
 *   Tracking pauses when the tab is backgrounded by the OS — that's a
 *   browser limitation, not something we can fix with code.
 *
 * - On native (Capacitor iOS/Android): uses
 *   `@capacitor-community/background-geolocation` to keep recording with the
 *   screen off, plus `@capacitor/local-notifications` for lock-screen
 *   Pause/Resume/Stop controls and live stats.
 *
 * Native plugins are registered through Capacitor's bridge. The background
 * geolocation package intentionally has no browser JavaScript entry point, so
 * trying to dynamically import its package name silently fails in a WebView.
 */

import { registerPlugin } from "@capacitor/core";

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
type ErrorListener = (message: string) => void;

let watcherHandle: { id?: string; webId?: number } | null = null;
const fixListeners = new Set<Listener>();
const controlListeners = new Set<ControlListener>();
const errorListeners = new Set<ErrorListener>();

type CapacitorGlobal = {
  isNativePlatform?: () => boolean;
};

type NativeLocation = {
  latitude: number;
  longitude: number;
  altitude: number | null;
  altitudeAccuracy: number | null;
  accuracy: number | null;
  time: number | null;
};

type NativeLocationError = {
  code?: string;
  message?: string;
};

type BackgroundGeolocationModule = {
  BackgroundGeolocation: {
    addWatcher: (
      options: {
        backgroundMessage: string;
        backgroundTitle: string;
        requestPermissions: boolean;
        stale: boolean;
        distanceFilter: number;
      },
      callback: (location?: NativeLocation, error?: NativeLocationError) => void,
    ) => Promise<string>;
    removeWatcher: (options: { id: string }) => Promise<void>;
    openSettings: () => Promise<void>;
  };
};

type LocalNotificationsModule = {
  LocalNotifications: {
    schedule: (options: {
      notifications: Array<{
        id: number;
        title: string;
        body: string;
        ongoing: boolean;
        autoCancel: boolean;
        actionTypeId: string;
        channelId?: string;
        smallIcon?: string;
      }>;
    }) => Promise<void>;
    cancel: (options: { notifications: Array<{ id: number }> }) => Promise<void>;
    registerActionTypes: (options: {
      types: Array<{
        id: string;
        actions: Array<{ id: string; title: string; destructive?: boolean }>;
      }>;
    }) => Promise<void>;
    addListener: (
      eventName: "localNotificationActionPerformed",
      listenerFunc: (event: { actionId: string }) => void,
    ) => Promise<unknown>;
    requestPermissions: () => Promise<{ display: string }>;
  };
};

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationModule["BackgroundGeolocation"]>(
  "BackgroundGeolocation",
);
const LocalNotifications = registerPlugin<LocalNotificationsModule["LocalNotifications"]>(
  "LocalNotifications",
);

const NOTIFICATION_ID = 1001;

export function isNativePlatform(): boolean {
  const cap = typeof window !== "undefined"
    ? (window as Window & { Capacitor?: CapacitorGlobal }).Capacitor
    : undefined;
  return !!cap?.isNativePlatform?.();
}

export function onLocationFix(fn: Listener) {
  fixListeners.add(fn);
  return () => fixListeners.delete(fn);
}

export function onTrackingError(fn: ErrorListener) {
  errorListeners.add(fn);
  return () => errorListeners.delete(fn);
}

export function onLockScreenControl(fn: ControlListener) {
  controlListeners.add(fn);
  return () => controlListeners.delete(fn);
}

function emitFix(fix: LocationFix) {
  if (!Number.isFinite(fix.coord[0]) || !Number.isFinite(fix.coord[1])) return;
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

  if (isNativePlatform()) {
    try {
      const id = await BackgroundGeolocation.addWatcher(
        {
          backgroundMessage: "Recording your run",
          backgroundTitle: "Own The Run",
          requestPermissions: true,
          stale: false,
          // Receive every OS location update. Distance smoothing belongs in
          // the run calculator; filtering here can suppress an entire run.
          distanceFilter: 0,
        },
        (location, error) => {
          if (error) {
            const message = error.code === "NOT_AUTHORIZED"
              ? "Location access is not set to Always. Open iPhone Settings → Own The Run → Location → Always."
              : error.message || "Native GPS stopped unexpectedly.";
            errorListeners.forEach((listener) => listener(message));
            return;
          }
          if (!location) return;
          emitFix({
            coord: [location.longitude, location.latitude],
            altitude: location.altitude,
            altitudeAccuracy: location.altitudeAccuracy,
            accuracy: location.accuracy,
            timestamp: location.time ?? Date.now(),
          });
        },
      );
      watcherHandle = { id };
      return true;
    } catch {
      errorListeners.forEach((listener) =>
        listener(
          "Background GPS is unavailable in this app build. Keep Own The Run open, or install the next TestFlight build before your next run.",
        ),
      );
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

  if (watcherHandle.id && isNativePlatform()) {
    try {
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
 * Update the lock-screen surface with current run stats. No-op on web.
 * On native this posts/updates a sticky notification with Pause/Resume/Stop
 * action buttons that route taps back through `emitControl`.
 */
export async function updateLockScreenStats(stats: {
  distanceMeters: number;
  elapsedSeconds: number;
  paceSecondsPerMile: number;
  elevationMeters: number;
  status: "running" | "paused";
}): Promise<void> {
  if (!isNativePlatform()) return;
  try {
    const miles = (stats.distanceMeters / 1609.344).toFixed(2);
    const m = Math.floor(stats.elapsedSeconds / 60);
    const s = String(stats.elapsedSeconds % 60).padStart(2, "0");
    const paceTxt = stats.paceSecondsPerMile > 0 && Number.isFinite(stats.paceSecondsPerMile)
      ? `${Math.floor(stats.paceSecondsPerMile / 60)}:${String(Math.round(stats.paceSecondsPerMile % 60)).padStart(2, "0")} /mi`
      : "—:— /mi";
    await LocalNotifications.schedule({
      notifications: [
        {
          id: NOTIFICATION_ID,
          title: stats.status === "running" ? "Recording run · Own The Run" : "Run paused · Own The Run",
          body: `${miles} mi · ${m}:${s} · ${paceTxt}`,
          ongoing: true,
          autoCancel: false,
          actionTypeId: "RUN_CONTROLS",
        },
      ],
    });
  } catch {
    /* ignore */
  }
}

export async function clearLockScreenStats(): Promise<void> {
  if (!isNativePlatform()) return;
  try {
    await LocalNotifications.cancel({
      notifications: [{ id: NOTIFICATION_ID }],
    });
  } catch {
    /* ignore */
  }
}

/**
 * Register the lock-screen action buttons and route their taps back through
 * `emitControl`. Idempotent — safe to call multiple times.
 */
let controlsRegistered = false;
export async function registerLockScreenControls(): Promise<void> {
  if (!isNativePlatform() || controlsRegistered) return;
  try {
    await LocalNotifications.requestPermissions().catch(() => undefined);
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
    controlsRegistered = true;
  } catch {
    /* ignore */
  }
}
