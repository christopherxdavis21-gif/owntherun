/**
 * Unit preference (miles vs kilometers).
 *
 * Persisted in localStorage. Default is auto-detected from the device locale:
 *   en-US, en-LR, en-MM → miles. Everywhere else → kilometers.
 *
 * Components should subscribe via `useUnit()` so they re-render when the
 * user changes the preference from Settings.
 */

import { useEffect, useState } from "react";

const STORAGE_KEY = "catchup:units";
const EVENT = "catchup:units-changed";
const METERS_PER_MILE = 1609.344;
const METERS_PER_KM = 1000;

export type Unit = "mi" | "km";

function detectDefault(): Unit {
  if (typeof navigator === "undefined") return "mi";
  const lang = (navigator.language || "en-US").toLowerCase();
  if (lang.startsWith("en-us") || lang.startsWith("en-lr") || lang.startsWith("my")) {
    return "mi";
  }
  return "km";
}

export function getUnit(): Unit {
  if (typeof window === "undefined") return "mi";
  const stored = window.localStorage?.getItem(STORAGE_KEY);
  if (stored === "mi" || stored === "km") return stored;
  return detectDefault();
}

export function setUnit(unit: Unit) {
  if (typeof window === "undefined") return;
  window.localStorage?.setItem(STORAGE_KEY, unit);
  window.dispatchEvent(new Event(EVENT));
}

export function useUnit(): Unit {
  const [unit, setLocal] = useState<Unit>(() => getUnit());
  useEffect(() => {
    const handler = () => setLocal(getUnit());
    window.addEventListener(EVENT, handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener(EVENT, handler);
      window.removeEventListener("storage", handler);
    };
  }, []);
  return unit;
}

export function formatDistanceU(meters: number, unit: Unit = getUnit()): string {
  if (unit === "km") return `${(meters / METERS_PER_KM).toFixed(2)} km`;
  return `${(meters / METERS_PER_MILE).toFixed(2)} mi`;
}

export function formatPaceU(meters: number, seconds: number, unit: Unit = getUnit()): string {
  if (meters <= 0 || seconds <= 0) return "—";
  const denom = unit === "km" ? meters / METERS_PER_KM : meters / METERS_PER_MILE;
  const paceSec = seconds / denom;
  const m = Math.floor(paceSec / 60);
  const s = Math.round(paceSec % 60);
  return `${m}:${s.toString().padStart(2, "0")} /${unit}`;
}

export function formatElevationU(meters: number, unit: Unit = getUnit()): string {
  if (unit === "km") return `${Math.round(meters).toLocaleString()} m`;
  const ft = Math.round(meters * 3.28084);
  return `${ft.toLocaleString()} ft`;
}
