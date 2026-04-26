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
