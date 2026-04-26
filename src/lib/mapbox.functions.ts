import { createServerFn } from "@tanstack/react-start";

export const getMapboxToken = createServerFn({ method: "GET" }).handler(async () => {
  const token = process.env.MAPBOX_PUBLIC_TOKEN;
  if (!token) throw new Error("Mapbox token not configured");
  return { token };
});

type Coord = [number, number];

/**
 * Snap a sequence of waypoints to the road network using Mapbox Directions API
 * (walking profile). Returns the snapped polyline geometry and total distance.
 *
 * Mapbox Directions accepts up to 25 coordinates per request. For longer routes,
 * we batch into overlapping windows and stitch the geometries together.
 */
export const snapToRoads = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const data = input as { waypoints?: Coord[] };
    if (!data?.waypoints || !Array.isArray(data.waypoints)) {
      throw new Error("waypoints required");
    }
    return { waypoints: data.waypoints as Coord[] };
  })
  .handler(async ({ data }) => {
    const token = process.env.MAPBOX_PUBLIC_TOKEN;
    if (!token) throw new Error("Mapbox token not configured");

    const { waypoints } = data;
    if (waypoints.length < 2) {
      return { coordinates: waypoints, distance_meters: 0 };
    }

    const MAX = 25;
    const stitched: Coord[] = [];
    let totalDistance = 0;

    for (let i = 0; i < waypoints.length - 1; i += MAX - 1) {
      const slice = waypoints.slice(i, i + MAX);
      if (slice.length < 2) break;

      const coordStr = slice.map((c) => `${c[0]},${c[1]}`).join(";");
      const url =
        `https://api.mapbox.com/directions/v5/mapbox/walking/${coordStr}` +
        `?geometries=geojson&overview=full&access_token=${token}`;

      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Mapbox Directions error: ${res.status}`);
      }
      const json = (await res.json()) as {
        routes?: Array<{
          distance: number;
          geometry: { coordinates: Coord[] };
        }>;
        code?: string;
        message?: string;
      };

      if (!json.routes || json.routes.length === 0) {
        throw new Error(json.message || "No route found between points");
      }

      const route = json.routes[0];
      totalDistance += route.distance;
      const geom = route.geometry.coordinates;
      // Avoid duplicating the join point between batches
      if (stitched.length > 0 && geom.length > 0) {
        stitched.push(...geom.slice(1));
      } else {
        stitched.push(...geom);
      }
    }

    return { coordinates: stitched, distance_meters: Math.round(totalDistance) };
  });

/**
 * Compute elevation gain (meters) along a polyline by sampling Mapbox
 * Terrain-RGB tiles via the Tilequery API. Samples at most 64 points to keep
 * request volume reasonable.
 */
export const computeElevationGain = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const data = input as { coordinates?: Coord[] };
    if (!data?.coordinates || !Array.isArray(data.coordinates)) {
      throw new Error("coordinates required");
    }
    return { coordinates: data.coordinates as Coord[] };
  })
  .handler(async ({ data }) => {
    const token = process.env.MAPBOX_PUBLIC_TOKEN;
    if (!token) throw new Error("Mapbox token not configured");
    const { coordinates } = data;
    if (coordinates.length < 2) return { elevation_gain_meters: 0 };

    // Down-sample to <= 64 points
    const MAX_SAMPLES = 64;
    const step = Math.max(1, Math.floor(coordinates.length / MAX_SAMPLES));
    const samples: Coord[] = [];
    for (let i = 0; i < coordinates.length; i += step) samples.push(coordinates[i]);
    if (samples[samples.length - 1] !== coordinates[coordinates.length - 1]) {
      samples.push(coordinates[coordinates.length - 1]);
    }

    const elevations: number[] = [];
    for (const [lng, lat] of samples) {
      const url =
        `https://api.mapbox.com/v4/mapbox.mapbox-terrain-v2/tilequery/${lng},${lat}.json` +
        `?layers=contour&limit=1&access_token=${token}`;
      try {
        const res = await fetch(url);
        if (!res.ok) {
          elevations.push(elevations[elevations.length - 1] ?? 0);
          continue;
        }
        const json = (await res.json()) as {
          features?: Array<{ properties?: { ele?: number } }>;
        };
        const ele = json.features?.[0]?.properties?.ele ?? elevations[elevations.length - 1] ?? 0;
        elevations.push(ele);
      } catch {
        elevations.push(elevations[elevations.length - 1] ?? 0);
      }
    }

    let gain = 0;
    for (let i = 1; i < elevations.length; i++) {
      const d = elevations[i] - elevations[i - 1];
      if (d > 0) gain += d;
    }
    return { elevation_gain_meters: Math.round(gain) };
  });

/**
 * Forward geocoding via Mapbox Places API. Biased to user's current location
 * via `proximity` so "Starbucks" returns the nearest ones first.
 */
export type GeocodeResult = {
  id: string;
  name: string;
  place: string; // longer human-readable address
  center: Coord;
};

export const geocodePlace = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const data = input as { query?: string; proximity?: Coord };
    if (!data?.query || typeof data.query !== "string") {
      throw new Error("query required");
    }
    return {
      query: data.query.slice(0, 200),
      proximity: Array.isArray(data.proximity) && data.proximity.length === 2
        ? (data.proximity as Coord)
        : undefined,
    };
  })
  .handler(async ({ data }) => {
    const token = process.env.MAPBOX_PUBLIC_TOKEN;
    if (!token) throw new Error("Mapbox token not configured");

    const params = new URLSearchParams({
      access_token: token,
      limit: "10",
      autocomplete: "true",
      // Prioritize businesses/POIs first, then addresses, then places
      types: "poi,poi.landmark,address,place,locality,neighborhood",
    });
    if (data.proximity) {
      params.set("proximity", `${data.proximity[0]},${data.proximity[1]}`);
    } else {
      // Fallback bias to viewer's IP location for better local-first results
      params.set("proximity", "ip");
    }
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(data.query)}.json?${params}`;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.error(`Mapbox geocoding error: ${res.status} ${res.statusText}`);
        return { results: [] as GeocodeResult[], error: `Search unavailable (${res.status})` };
      }
      const json = (await res.json()) as {
        features?: Array<{
          id: string;
          text: string;
          place_name: string;
          center: Coord;
        }>;
      };
      const results: GeocodeResult[] = (json.features ?? []).map((f) => ({
        id: f.id,
        name: f.text,
        place: f.place_name,
        center: f.center,
      }));
      return { results, error: null as string | null };
    } catch (err) {
      console.error("Mapbox geocoding request failed:", err);
      return { results: [] as GeocodeResult[], error: "Search service unavailable" };
    }
  });
