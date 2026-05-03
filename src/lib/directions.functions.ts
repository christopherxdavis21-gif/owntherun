import { createServerFn } from "@tanstack/react-start";

type Coord = [number, number];

export type DirectionStep = {
  /** Where the maneuver happens (lng, lat). */
  location: Coord;
  /** Distance of THIS step (meters from previous maneuver to this one). */
  distance: number;
  /** Spoken instruction, e.g. "Turn right onto Oak Street". */
  instruction: string;
  /** Maneuver type, e.g. "turn", "arrive", "depart". */
  type: string;
  /** Maneuver modifier, e.g. "left", "right", "slight left". */
  modifier: string | null;
};

/**
 * Fetch turn-by-turn directions for a planned route from Mapbox Directions API
 * (walking profile). Used to announce upcoming maneuvers via voice during a run.
 *
 * Mapbox accepts up to 25 coordinates per Directions request. For longer routes
 * we down-sample to <= 25 anchor points so we still get a coherent set of
 * maneuvers spanning the whole path.
 */
export const getRouteDirections = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const data = input as { coordinates?: Coord[] };
    if (!data?.coordinates || !Array.isArray(data.coordinates) || data.coordinates.length < 2) {
      throw new Error("at least 2 coordinates required");
    }
    return { coordinates: data.coordinates as Coord[] };
  })
  .handler(async ({ data }): Promise<{ steps: DirectionStep[]; distance_meters: number }> => {
    const token = process.env.MAPBOX_PUBLIC_TOKEN;
    if (!token) throw new Error("Mapbox token not configured");

    const all = data.coordinates;
    const MAX = 25;
    let waypoints: Coord[];
    if (all.length <= MAX) {
      waypoints = all;
    } else {
      const step = (all.length - 1) / (MAX - 1);
      waypoints = [];
      for (let i = 0; i < MAX; i++) {
        waypoints.push(all[Math.round(i * step)]);
      }
    }

    const coordStr = waypoints.map((c) => `${c[0]},${c[1]}`).join(";");
    const url =
      `https://api.mapbox.com/directions/v5/mapbox/walking/${coordStr}` +
      `?steps=true&voice_instructions=true&voice_units=imperial` +
      `&overview=false&access_token=${token}`;

    const res = await fetch(url);
    if (!res.ok) {
      console.error("Mapbox Directions error", res.status, res.statusText);
      return { steps: [], distance_meters: 0 };
    }
    const json = (await res.json()) as {
      routes?: Array<{
        distance: number;
        legs: Array<{
          steps: Array<{
            distance: number;
            maneuver: {
              location: Coord;
              instruction: string;
              type: string;
              modifier?: string;
            };
            voiceInstructions?: Array<{ announcement: string }>;
          }>;
        }>;
      }>;
    };

    const route = json.routes?.[0];
    if (!route) return { steps: [], distance_meters: 0 };

    const steps: DirectionStep[] = [];
    for (const leg of route.legs) {
      for (const s of leg.steps) {
        const voice = s.voiceInstructions?.[0]?.announcement;
        steps.push({
          location: s.maneuver.location,
          distance: s.distance,
          instruction: voice || s.maneuver.instruction,
          type: s.maneuver.type,
          modifier: s.maneuver.modifier ?? null,
        });
      }
    }

    return { steps, distance_meters: Math.round(route.distance) };
  });
