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
 * Accuracy hardening:
 *   - The background-geolocation watcher is configured with a small
 *     `distanceFilter` (5m) so the OS fuses GPS + motion data before
 *     handing us a fix — fewer "phantom turn" spikes when the phone is in
 *     a pocket and the GPS signal goes wobbly.
 *   - We hard-drop any fix with `accuracy > 60m`. Those are almost always
 *     cell-tower fallbacks that cause big lateral jumps.
 *   - A speed sanity check rejects fixes that would imply > 12 m/s (~27 mph)
 *     of travel from the previous fix — i.e. impossible for a runner.
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

// Last accepted fix — used by the accuracy / speed gates below.
let lastAccepted: LocationFix | null = null;

const MAX_ACCURACY_METERS = 60;
const MAX_SPEED_MPS = 12; // runner sanity cap — anything faster is a glitch

const NATIVE_MODULES = {
  backgroundGeolocation: "@capacitor-community/background-geolocation",
  localNotifications: "@capacitor/local-notifications",
} as const;

type CapacitorGlobal = {
  isNativePlatform?: () => boolean;
};

type NativeLocation = {
  latitude: number;
  longitude: number;
  altitude: number | null;
  altitudeAccuracy: number | null;
  accuracy: number | null;
  time: number;
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
      callback: (location: NativeLocation | null) => void,
    ) => Promise<string>;
    removeWatcher: (options: { id: string }) => Promise<void>;
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

const NOTIFICATION_ID = 1001;

export function isNativePlatform(): boolean {
  const cap = typeof window !== "undefined"
    ? (window as Window & { Capacitor?: CapacitorGlobal }).Capacitor
    : undefined;
  return !!cap?.isNativePlatform?.();
}

async function importNativeModule<T>(specifier: string): Promise<T | null> {
  if (!isNativePlatform()) return null;
  return (await import(/* @vite-ignore */ specifier)) as T;
}

export function onLocationFix(fn: Listener) {
  fixListeners.add(fn);
  return () => fixListeners.delete(fn);
}

export function onLockScreenControl(fn: ControlListener) {
  controlListeners.add(fn);
  return () => controlListeners.delete(fn);
}

function haversineMeters(a: Coord, b: Coord): number {
  const R = 6371000;
  const toRad = (n: number) => (n * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Apply accuracy + speed gates before emitting a fix. Drops:
 *   - fixes with accuracy worse than 60m
 *   - fixes implying >12 m/s of travel (impossible for a runner; almost
 *     always a coordinate jump from cell-tower fallback)
 */
function gateAndEmit(fix: LocationFix) {
  if (fix.accuracy != null && fix.accuracy > MAX_ACCURACY_METERS) return;
  if (lastAccepted) {
    const dt = Math.max(0.5, (fix.timestamp - lastAccepted.timestamp) / 1000);
    const dist = haversineMeters(lastAccepted.coord, fix.coord);
    if (dist / dt > MAX_SPEED_MPS) return;
  }
  lastAccepted = fix;
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
  lastAccepted = null;

  if (isNativePlatform()) {
    try {
      const nativeModule = await importNativeModule<BackgroundGeolocationModule>(
        NATIVE_MODULES.backgroundGeolocation,
      );
      if (!nativeModule) return false;
      const { BackgroundGeolocation } = nativeModule;
      const id = await BackgroundGeolocation.addWatcher(
        {
          backgroundMessage: "Recording your run",
          backgroundTitle: "Own The Run",
          requestPermissions: true,
          stale: false,
          // 5m distance filter lets the OS apply motion-fused smoothing so
          // we don't get jittery 1m updates while the phone is in a pocket.
          distanceFilter: 5,
        },
        (location) => {
          if (!location) return;
          gateAndEmit({
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
      gateAndEmit({
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
      const nativeModule = await importNativeModule<BackgroundGeolocationModule>(
        NATIVE_MODULES.backgroundGeolocation,
      );
      if (!nativeModule) return;
      const { BackgroundGeolocation } = nativeModule;
      await BackgroundGeolocation.removeWatcher({ id: watcherHandle.id });
    } catch {
      /* ignore */
    }
  }
  if (watcherHandle.webId != null && typeof navigator !== "undefined") {
    navigator.geolocation.clearWatch(watcherHandle.webId);
  }
  watcherHandle = null;
  lastAccepted = null;
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
    const nativeModule = await importNativeModule<LocalNotificationsModule>(
      NATIVE_MODULES.localNotifications,
    );
    if (!nativeModule) return;
    const { LocalNotifications } = nativeModule;
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
    const nativeModule = await importNativeModule<LocalNotificationsModule>(
      NATIVE_MODULES.localNotifications,
    );
    if (!nativeModule) return;
    await nativeModule.LocalNotifications.cancel({
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
    const nativeModule = await importNativeModule<LocalNotificationsModule>(
      NATIVE_MODULES.localNotifications,
    );
    if (!nativeModule) return;
    const { LocalNotifications } = nativeModule;
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
