/**
 * Live Activity / Dynamic Island bridge (iOS 16.1+).
 *
 * Talks to the native `OwnTheRunLiveActivity` Capacitor plugin whose Swift
 * source ships in `ios-live-activity/`. If the native side isn't installed
 * (web preview, Android, older iOS) every call is a silent no-op so the app
 * keeps working exactly as before.
 */
import { registerPlugin } from "@capacitor/core";
import { isNativePlatform } from "./tracking";

export type LiveActivityState = {
  distanceMeters: number;
  elapsedSeconds: number;
  paceSecondsPerMile: number;
  status: "running" | "paused";
};

type LiveActivityPlugin = {
  isSupported: () => Promise<{ supported: boolean }>;
  start: (options: LiveActivityState) => Promise<void>;
  update: (options: LiveActivityState) => Promise<void>;
  end: () => Promise<void>;
};

const LiveActivity = registerPlugin<LiveActivityPlugin>("OwnTheRunLiveActivity");

let active = false;
let unavailable = false;

function available(): boolean {
  return isNativePlatform() && !unavailable;
}

export async function startLiveActivity(state: LiveActivityState): Promise<void> {
  if (!available() || active) return;
  try {
    const { supported } = await LiveActivity.isSupported();
    if (!supported) {
      unavailable = true;
      return;
    }
    await LiveActivity.start(state);
    active = true;
  } catch {
    // Plugin not present in this build — fall back to the lock-screen notification.
    unavailable = true;
  }
}

export async function updateLiveActivity(state: LiveActivityState): Promise<void> {
  if (!available()) return;
  if (!active) {
    await startLiveActivity(state);
    return;
  }
  try {
    await LiveActivity.update(state);
  } catch {
    /* ignore transient update failures */
  }
}

export async function endLiveActivity(): Promise<void> {
  if (!available() || !active) return;
  try {
    await LiveActivity.end();
  } catch {
    /* ignore */
  }
  active = false;
}
