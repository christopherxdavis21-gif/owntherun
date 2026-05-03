/**
 * Audio guidance for a run that is following a planned route.
 *
 * Responsibilities:
 *  - Announce upcoming turns at ~50m and at the maneuver point.
 *  - Announce distance milestones (1mi, 2mi, ...).
 *  - Warn when the runner has drifted off route, and when they're back on.
 *  - Announce finish proximity ("500m to finish") and arrival.
 *
 * Designed to be cheap on every GPS fix — all O(1) checks against the
 * pre-computed step list and planned path.
 */

import { useEffect, useRef } from "react";
import type { DirectionStep } from "@/lib/directions.functions";
import { speak } from "@/lib/voice";
import { haversineMeters } from "@/lib/format";

type Coord = [number, number];

const TURN_PREALERT_METERS = 50; // first announce ~50m before maneuver
const TURN_TRIGGER_METERS = 15; // mark step as completed when this close
const OFF_ROUTE_METERS = 35; // > this from planned path = off route
const OFF_ROUTE_BACK_METERS = 20; // <= this = back on route
const OFF_ROUTE_DEBOUNCE_MS = 8000; // don't spam off-route warnings
const FINISH_PROXIMITY_METERS = 500; // announce "500m to finish"
const FINISH_ARRIVE_METERS = 25;

interface Args {
  active: boolean;
  plannedPath: Coord[] | undefined;
  steps: DirectionStep[] | undefined;
  /** Latest GPS coord (lng, lat). */
  currentCoord: Coord | null;
  /** Total distance covered so far, meters. */
  distanceMeters: number;
}

/** Distance from point P to segment AB, in meters (approx via equirectangular). */
function distanceToSegment(p: Coord, a: Coord, b: Coord): number {
  // Convert to a local flat plane around p for cheap math.
  const toMeters = (lng: number, lat: number, refLat: number) => {
    const mPerDegLat = 111_320;
    const mPerDegLng = 111_320 * Math.cos((refLat * Math.PI) / 180);
    return [lng * mPerDegLng, lat * mPerDegLat] as const;
  };
  const ref = p[1];
  const [px, py] = toMeters(p[0], p[1], ref);
  const [ax, ay] = toMeters(a[0], a[1], ref);
  const [bx, by] = toMeters(b[0], b[1], ref);
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function distanceToPath(p: Coord, path: Coord[]): number {
  if (path.length === 0) return Infinity;
  if (path.length === 1) return haversineMeters(p, path[0]);
  let min = Infinity;
  for (let i = 1; i < path.length; i++) {
    const d = distanceToSegment(p, path[i - 1], path[i]);
    if (d < min) min = d;
  }
  return min;
}

export function useRunGuidance({
  active,
  plannedPath,
  steps,
  currentCoord,
  distanceMeters,
}: Args) {
  // Track which step indices we've already pre-alerted / triggered.
  const prealerted = useRef<Set<number>>(new Set());
  const triggered = useRef<Set<number>>(new Set());
  const offRoute = useRef(false);
  const lastOffRouteAt = useRef(0);
  const announcedMiles = useRef(0);
  const announcedFinishProx = useRef(false);
  const announcedFinish = useRef(false);

  // Reset state whenever guidance becomes inactive (new run starts fresh).
  useEffect(() => {
    if (!active) {
      prealerted.current.clear();
      triggered.current.clear();
      offRoute.current = false;
      lastOffRouteAt.current = 0;
      announcedMiles.current = 0;
      announcedFinishProx.current = false;
      announcedFinish.current = false;
    }
  }, [active]);

  // Distance milestones — fire as the runner crosses each whole mile.
  useEffect(() => {
    if (!active) return;
    const miles = Math.floor(distanceMeters / 1609.344);
    if (miles > announcedMiles.current && miles > 0) {
      announcedMiles.current = miles;
      speak(miles === 1 ? "1 mile complete" : `${miles} miles complete`);
    }
  }, [active, distanceMeters]);

  // Per-fix processing: turns, off-route, finish.
  useEffect(() => {
    if (!active || !currentCoord) return;

    // ---- Turn-by-turn ----
    if (steps && steps.length > 0) {
      for (let i = 0; i < steps.length; i++) {
        if (triggered.current.has(i)) continue;
        const step = steps[i];
        const d = haversineMeters(currentCoord, step.location);

        // Skip "depart" — no useful spoken cue at the start.
        if (step.type === "depart") {
          triggered.current.add(i);
          continue;
        }

        // Pre-alert ~50m out
        if (
          d <= TURN_PREALERT_METERS &&
          d > TURN_TRIGGER_METERS &&
          !prealerted.current.has(i)
        ) {
          prealerted.current.add(i);
          speak(`In ${Math.round(d)} meters, ${step.instruction}`);
        }

        // Trigger when very close to the maneuver
        if (d <= TURN_TRIGGER_METERS) {
          triggered.current.add(i);
          if (step.type !== "arrive") {
            speak(step.instruction, { priority: "high" });
          }
        }
      }
    }

    // ---- Off-route warnings ----
    if (plannedPath && plannedPath.length > 1) {
      const dPath = distanceToPath(currentCoord, plannedPath);
      const now = Date.now();
      if (!offRoute.current && dPath > OFF_ROUTE_METERS) {
        if (now - lastOffRouteAt.current > OFF_ROUTE_DEBOUNCE_MS) {
          offRoute.current = true;
          lastOffRouteAt.current = now;
          speak("You've left the route", { priority: "high" });
        }
      } else if (offRoute.current && dPath <= OFF_ROUTE_BACK_METERS) {
        offRoute.current = false;
        lastOffRouteAt.current = now;
        speak("Back on route");
      }

      // ---- Finish proximity ----
      if (!announcedFinish.current) {
        const finish = plannedPath[plannedPath.length - 1];
        const dFinish = haversineMeters(currentCoord, finish);
        if (!announcedFinishProx.current && dFinish <= FINISH_PROXIMITY_METERS && dFinish > FINISH_ARRIVE_METERS) {
          announcedFinishProx.current = true;
          speak(`${Math.round(dFinish)} meters to finish`);
        }
        if (dFinish <= FINISH_ARRIVE_METERS) {
          announcedFinish.current = true;
          speak("You've reached the finish. Nice run!", { priority: "high" });
        }
      }
    }
  }, [active, currentCoord, plannedPath, steps]);
}
