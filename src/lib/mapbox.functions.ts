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
  category: string | null; // e.g. "coffee, cafe" for POIs
  is_poi: boolean;
  distance_meters: number | null; // straight-line distance from proximity if provided
};

function haversineMeters(a: Coord, b: Coord): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

type MapboxFeature = {
  id: string;
  text: string;
  place_name: string;
  center: Coord;
  place_type?: string[];
  properties?: { category?: string };
};

async function fetchMapboxFeatures(
  query: string,
  token: string,
  types: string,
  proximity: Coord | undefined,
  limit: number,
): Promise<MapboxFeature[]> {
  const params = new URLSearchParams({
    access_token: token,
    limit: String(limit),
    autocomplete: "true",
    language: "en",
    types,
  });
  if (proximity) {
    params.set("proximity", `${proximity[0]},${proximity[1]}`);
  } else {
    params.set("proximity", "ip");
  }
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?${params}`;
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`Mapbox geocoding (${types}) error: ${res.status} ${res.statusText}`);
    return [];
  }
  const json = (await res.json()) as { features?: MapboxFeature[] };
  return json.features ?? [];
}

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

    const q = data.query.trim();
    // Heuristic: queries that start with a digit are likely street addresses,
    // not business names. Otherwise treat as a possible business search and
    // run a dedicated POI pass so we get many branches (e.g. all Starbucks).
    const looksLikeAddress = /^\s*\d/.test(q);

    try {
      const passes: Promise<MapboxFeature[]>[] = [];

      if (looksLikeAddress) {
        passes.push(fetchMapboxFeatures(q, token, "address,place,locality,neighborhood,poi", data.proximity, 10));
      } else {
        // Pass A: businesses/POIs only — gives us multiple chain locations.
        passes.push(fetchMapboxFeatures(q, token, "poi", data.proximity, 10));
        // Pass B: addresses + places, for street/landmark fallbacks.
        passes.push(fetchMapboxFeatures(q, token, "address,place,locality,neighborhood", data.proximity, 5));
      }

      const settled = await Promise.all(passes);
      let features = settled.flat();

      // If proximity-biased POI search returned very few nearby hits, widen
      // the search to surface farther matches the user can still pick from.
      if (!looksLikeAddress && data.proximity) {
        const closeHits = features.filter((f) => {
          const d = haversineMeters(data.proximity!, f.center);
          return d <= 25_000 && (f.place_type ?? []).includes("poi");
        });
        if (closeHits.length < 3) {
          const wider = await fetchMapboxFeatures(q, token, "poi", undefined, 10);
          features = features.concat(wider);
        }
      }

      // Dedupe by feature id.
      const seen = new Set<string>();
      const unique = features.filter((f) => {
        if (seen.has(f.id)) return false;
        seen.add(f.id);
        return true;
      });

      const results: GeocodeResult[] = unique.map((f) => {
        const isPoi = (f.place_type ?? []).includes("poi");
        return {
          id: f.id,
          name: f.text,
          place: f.place_name,
          center: f.center,
          category: f.properties?.category ?? null,
          is_poi: isPoi,
          distance_meters: data.proximity ? Math.round(haversineMeters(data.proximity, f.center)) : null,
        };
      });

      // Sort: POIs first (when not address-like), then by distance.
      results.sort((a, b) => {
        if (!looksLikeAddress && a.is_poi !== b.is_poi) return a.is_poi ? -1 : 1;
        const da = a.distance_meters ?? Number.POSITIVE_INFINITY;
        const db = b.distance_meters ?? Number.POSITIVE_INFINITY;
        return da - db;
      });

      return { results: results.slice(0, 12), error: null as string | null };
    } catch (err) {
      console.error("Mapbox geocoding request failed:", err);
      return { results: [] as GeocodeResult[], error: "Search service unavailable" };
    }
  });
