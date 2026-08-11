/**
 * Pedometer (CoreMotion) bridge — dead reckoning for GPS gaps.
 *
 * When the phone is in a pocket the GPS fixes degrade past the point where we
 * can trust them, but the M-series motion coprocessor keeps counting steps and
 * estimating distance on dedicated low-power silicon. We use that to keep the
 * runner moving forward through a GPS dropout instead of stalling the mileage.
 *
 * The native side is `ios-native/OwnTheRunPedometerPlugin.swift`. On web, and
 * on any build where that file has not been added to the Xcode target yet,
 * every call degrades gracefully to "unavailable" and the run simply falls back
 * to speed-based extrapolation.
 */

import { registerPlugin } from "@capacitor/core";

type PedometerPlugin = {
  start: () => Promise<{ available: boolean }>;
  /** Cumulative distance in metres since start(), plus step count. */
  getDistance: () => Promise<{
    available: boolean;
    distance: number;
    steps: number;
  }>;
  stop: () => Promise<void>;
};

const Pedometer = registerPlugin<PedometerPlugin>("OwnTheRunPedometer");

let active = false;

export async function startPedometer(): Promise<boolean> {
  try {
    const result = await Pedometer.start();
    active = !!result?.available;
    return active;
  } catch {
    // Plugin not present in this build (web, or Swift file not yet added to
    // the Xcode target). Not an error — we just lose the dead-reckoning assist.
    active = false;
    return false;
  }
}

/**
 * Cumulative metres walked/run since `startPedometer()`, or null when the
 * pedometer is unavailable. Callers diff this against their own last reading.
 */
export async function readPedometerDistance(): Promise<number | null> {
  if (!active) return null;
  try {
    const result = await Pedometer.getDistance();
    if (!result?.available || typeof result.distance !== "number") return null;
    if (!Number.isFinite(result.distance) || result.distance < 0) return null;
    return result.distance;
  } catch {
    return null;
  }
}

export async function stopPedometer(): Promise<void> {
  active = false;
  try {
    await Pedometer.stop();
  } catch {
    /* nothing to stop */
  }
}
