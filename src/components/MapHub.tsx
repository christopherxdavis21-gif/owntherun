import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { RouteMap, type MapPin } from "@/components/RouteMap";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import {
  formatDistance,
  formatDuration,
  haversineMeters,
} from "@/lib/format";
import {
  geocodePlace,
  snapToRoads,
  type GeocodeResult,
} from "@/lib/mapbox.functions";
import { toast } from "sonner";
import {
  Search,
  Play,
  Plus,
  Crosshair,
  Loader2,
  X,
  Bookmark,
  MapPin as MapPinIcon,
} from "lucide-react";

type Coord = [number, number];

export type NearbyRoute = {
  id: string;
  name: string;
  distance_meters: number;
  coordinates: Coord[];
  user_id: string;
  is_public: boolean;
  best_time_seconds?: number | null;
  best_runner_name?: string | null;
  origin: "community" | "saved" | "mine";
};

interface MapHubProps {
  userLocation: Coord | undefined;
  nearbyRoutes: NearbyRoute[];
  onStartFreeRun: () => void;
}

export function MapHub({ userLocation, nearbyRoutes, onStartFreeRun }: MapHubProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<GeocodeResult | null>(null);
  const [plannedPath, setPlannedPath] = useState<Coord[] | undefined>(undefined);
  const [plannedDistance, setPlannedDistance] = useState<number | null>(null);
  const [planning, setPlanning] = useState(false);
  const [recenterTick, setRecenterTick] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced geocoding as the user types
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim() || query.trim().length < 2) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        setSearching(true);
        const res = await geocodePlace({
          data: { query: query.trim(), proximity: userLocation },
        });
        setResults(res.results);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, userLocation]);

  const choose = async (r: GeocodeResult) => {
    setSelected(r);
    setResults([]);
    setQuery(r.name);
    if (!userLocation) {
      toast.error("We need your location to map a route");
      return;
    }
    setPlanning(true);
    try {
      const res = await snapToRoads({
        data: { waypoints: [userLocation, r.center] },
      });
      setPlannedPath(res.coordinates as Coord[]);
      setPlannedDistance(res.distance_meters);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not map a route there");
      setPlannedPath(undefined);
      setPlannedDistance(null);
    } finally {
      setPlanning(false);
    }
  };

  const clearPlan = () => {
    setSelected(null);
    setPlannedPath(undefined);
    setPlannedDistance(null);
    setQuery("");
    setResults([]);
  };

  const startWithPlan = () => {
    if (!plannedPath) return;
    sessionStorage.setItem("catchup:plannedPath", JSON.stringify(plannedPath));
    onStartFreeRun();
  };

  const saveAsRoute = async () => {
    if (!plannedPath || !selected || !userLocation) return;
    sessionStorage.setItem(
      "catchup:newRouteSeed",
      JSON.stringify({
        waypoints: [userLocation, selected.center],
        path: plannedPath,
        suggestedName: `Run to ${selected.name}`,
      }),
    );
    navigate({ to: "/routes/new" });
  };

  const pins: MapPin[] = useMemo(() => {
    return nearbyRoutes.map((r) => {
      const color =
        r.origin === "mine" ? "#3b82f6" : r.origin === "saved" ? "#facc15" : "#c6f700";
      const popup = `
        <div style="font-family: inherit; min-width: 200px;">
          <div style="font-weight: 700; font-size: 14px; margin-bottom: 4px;">${escapeHtml(r.name)}</div>
          <div style="font-size: 12px; color: #9ca3af; margin-bottom: 8px;">
            ${formatDistance(r.distance_meters)}${
              r.best_time_seconds
                ? ` · best ${formatDuration(r.best_time_seconds)}${r.best_runner_name ? ` by ${escapeHtml(r.best_runner_name)}` : ""}`
                : ""
            }
          </div>
          <a href="/routes/${r.id}" style="display: inline-block; background: #c6f700; color: #0d1117; padding: 6px 10px; border-radius: 6px; font-weight: 600; font-size: 12px; text-decoration: none;">Open route</a>
        </div>
      `;
      return {
        id: r.id,
        coord: r.coordinates[0],
        color,
        popupHtml: popup,
      };
    });
  }, [nearbyRoutes]);

  // Pass a key into RouteMap initialCenter via prop change to recenter
  const initialCenter = useMemo(() => userLocation, [userLocation, recenterTick]);

  return (
    <div className="relative">
      <RouteMap
        coordinates={[]}
        plannedPath={plannedPath}
        pins={pins}
        userLocation={userLocation}
        initialCenter={initialCenter}
        className="h-[55vh] w-full md:h-[60vh]"
      />

      {/* Search bar overlay */}
      <div className="absolute left-3 right-3 top-3 md:left-4 md:right-auto md:w-[380px]">
        <div className="rounded-xl border border-border bg-background/95 shadow-lg backdrop-blur">
          <div className="flex items-center gap-2 px-3 py-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search a place to run to…"
              className="h-8 border-0 bg-transparent p-0 focus-visible:ring-0"
            />
            {searching && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            {(query || selected) && (
              <button
                onClick={clearPlan}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {results.length > 0 && (
            <ul className="max-h-64 divide-y divide-border overflow-y-auto border-t border-border">
              {results.map((r) => (
                <li key={r.id}>
                  <button
                    onClick={() => choose(r)}
                    className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-surface"
                  >
                    <MapPinIcon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${r.is_poi ? "text-primary" : "text-muted-foreground"}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-medium">{r.name}</span>
                        {r.distance_meters != null && (
                          <span className="font-mono-num shrink-0 text-xs text-muted-foreground">
                            {formatDistance(r.distance_meters)}
                          </span>
                        )}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {r.category ? `${r.category.split(",")[0]} · ` : ""}{r.place}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Planned route summary */}
        {selected && (
          <div className="mt-2 rounded-xl border border-primary/40 bg-background/95 p-3 shadow-lg backdrop-blur">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="eyebrow text-primary">Planned route</p>
                <p className="truncate text-sm font-semibold">{selected.name}</p>
                <p className="truncate text-xs text-muted-foreground">{selected.place}</p>
              </div>
              {planning ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
              ) : plannedDistance != null ? (
                <span className="font-mono-num shrink-0 text-sm font-bold text-primary">
                  {formatDistance(plannedDistance)}
                </span>
              ) : null}
            </div>
            {plannedPath && (
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" onClick={startWithPlan} className="gap-1">
                  <Play className="h-3.5 w-3.5" /> Start run
                </Button>
                <Button size="sm" variant="outline" onClick={saveAsRoute} className="gap-1">
                  <Bookmark className="h-3.5 w-3.5" /> Save route
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Floating action stack */}
      <div className="absolute bottom-4 right-3 flex flex-col items-end gap-2 md:right-4">
        <Button
          size="icon"
          variant="secondary"
          onClick={() => setRecenterTick((t) => t + 1)}
          className="h-10 w-10 rounded-full shadow-lg"
          aria-label="Recenter on me"
        >
          <Crosshair className="h-4 w-4" />
        </Button>
        <Link to="/routes/new">
          <Button size="icon" variant="secondary" className="h-10 w-10 rounded-full shadow-lg" aria-label="Create route">
            <Plus className="h-4 w-4" />
          </Button>
        </Link>
        <Button
          onClick={() => {
            sessionStorage.removeItem("catchup:plannedPath");
            onStartFreeRun();
          }}
          className="h-14 gap-2 rounded-full px-5 shadow-glow"
          aria-label="Start a free run"
        >
          <Play className="h-5 w-5" /> Start run
        </Button>
      </div>
    </div>
  );
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!
  );
}

/**
 * Helper: load nearby + saved + my routes for the hub. Exported so the page
 * can call it once and pass the result to <MapHub>.
 */
export async function loadHubRoutes(
  userId: string,
  userLocation: Coord | undefined,
): Promise<{
  nearby: NearbyRoute[];
  saved: NearbyRoute[];
  mine: NearbyRoute[];
}> {
  // Pull all public routes the user can see + their own (RLS handles this)
  const [{ data: pub }, { data: mine }, { data: savedRows }] = await Promise.all([
    supabase
      .from("routes")
      .select("id, name, distance_meters, coordinates, user_id, is_public")
      .eq("is_public", true)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("routes")
      .select("id, name, distance_meters, coordinates, user_id, is_public")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("saved_routes")
      .select("route_id")
      .eq("user_id", userId),
  ]);

  const savedIds = new Set(((savedRows as Array<{ route_id: string }> | null) ?? []).map((s) => s.route_id));

  const allMap = new Map<string, NearbyRoute>();
  ((pub as RawRoute[] | null) ?? []).forEach((r) => {
    const coords = (r.coordinates ?? []) as Coord[];
    if (coords.length < 1) return;
    allMap.set(r.id, {
      id: r.id,
      name: r.name,
      distance_meters: Number(r.distance_meters),
      coordinates: coords,
      user_id: r.user_id,
      is_public: r.is_public,
      origin: r.user_id === userId ? "mine" : savedIds.has(r.id) ? "saved" : "community",
    });
  });
  ((mine as RawRoute[] | null) ?? []).forEach((r) => {
    const coords = (r.coordinates ?? []) as Coord[];
    if (coords.length < 1) return;
    if (!allMap.has(r.id)) {
      allMap.set(r.id, {
        id: r.id,
        name: r.name,
        distance_meters: Number(r.distance_meters),
        coordinates: coords,
        user_id: r.user_id,
        is_public: r.is_public,
        origin: "mine",
      });
    }
  });

  // Fetch saved routes that aren't already in the public set (e.g. someone made it public, then private)
  const missingSaved = Array.from(savedIds).filter((id) => !allMap.has(id));
  if (missingSaved.length > 0) {
    const { data: savedFull } = await supabase
      .from("routes")
      .select("id, name, distance_meters, coordinates, user_id, is_public")
      .in("id", missingSaved);
    ((savedFull as RawRoute[] | null) ?? []).forEach((r) => {
      const coords = (r.coordinates ?? []) as Coord[];
      if (coords.length < 1) return;
      allMap.set(r.id, {
        id: r.id,
        name: r.name,
        distance_meters: Number(r.distance_meters),
        coordinates: coords,
        user_id: r.user_id,
        is_public: r.is_public,
        origin: "saved",
      });
    });
  }

  const all = Array.from(allMap.values());

  // Best leaderboard time per route (single query)
  const ids = all.map((r) => r.id);
  const bestByRoute = new Map<string, { seconds: number; user_id: string }>();
  if (ids.length > 0) {
    const { data: runs } = await supabase
      .from("runs")
      .select("route_id, duration_seconds, user_id")
      .in("route_id", ids)
      .eq("visibility", "leaderboard")
      .order("duration_seconds", { ascending: true })
      .limit(500);
    ((runs as Array<{ route_id: string; duration_seconds: number; user_id: string }> | null) ?? []).forEach((r) => {
      if (!bestByRoute.has(r.route_id)) {
        bestByRoute.set(r.route_id, { seconds: r.duration_seconds, user_id: r.user_id });
      }
    });
    const bestUserIds = Array.from(new Set(Array.from(bestByRoute.values()).map((b) => b.user_id)));
    if (bestUserIds.length > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id, display_name")
        .in("user_id", bestUserIds);
      const profMap = new Map(((profs as Array<{ user_id: string; display_name: string }> | null) ?? []).map((p) => [p.user_id, p.display_name]));
      all.forEach((r) => {
        const b = bestByRoute.get(r.id);
        if (b) {
          r.best_time_seconds = b.seconds;
          r.best_runner_name = profMap.get(b.user_id) ?? null;
        }
      });
    }
  }

  // Split + sort
  const NEARBY_RADIUS_M = 25_000;
  const nearby = userLocation
    ? all
        .filter((r) => r.origin === "community")
        .map((r) => ({ r, d: haversineMeters(userLocation, r.coordinates[0]) }))
        .filter((x) => x.d <= NEARBY_RADIUS_M)
        .sort((a, b) => a.d - b.d)
        .map((x) => x.r)
    : all.filter((r) => r.origin === "community").slice(0, 12);
  const saved = all.filter((r) => savedIds.has(r.id));
  const myRoutes = all.filter((r) => r.user_id === userId);

  return { nearby, saved, mine: myRoutes };
}

type RawRoute = {
  id: string;
  name: string;
  distance_meters: number;
  coordinates: Coord[];
  user_id: string;
  is_public: boolean;
};
