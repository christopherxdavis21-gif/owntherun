import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { RunTracker } from "@/components/RunTracker";
import { MapHub, loadHubRoutes, type NearbyRoute } from "@/components/MapHub";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { formatDistance, formatDuration } from "@/lib/format";
import { Plus, Trophy, Bookmark, Map as MapIcon, ChevronRight } from "lucide-react";

type Coord = [number, number];

export const Route = createFileRoute("/routes/")({
  head: () => ({
    meta: [
      { title: "Run — Catch Up" },
      { name: "description", content: "Start a run, follow community routes near you, or map a path to anywhere." },
    ],
  }),
  component: RunHubPage,
});

function RunHubPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<Coord | undefined>(undefined);
  const [nearby, setNearby] = useState<NearbyRoute[]>([]);
  const [saved, setSaved] = useState<NearbyRoute[]>([]);
  const [mine, setMine] = useState<NearbyRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [trackerOpen, setTrackerOpen] = useState(false);
  const [plannedPath, setPlannedPath] = useState<Coord[] | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserLocation([pos.coords.longitude, pos.coords.latitude]),
      () => {},
      { timeout: 5000 },
    );
  }, []);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setLoading(true);
    loadHubRoutes(userId, userLocation)
      .then(({ nearby, saved, mine }) => {
        if (cancelled) return;
        setNearby(nearby);
        setSaved(saved);
        setMine(mine);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, userLocation]);

  const openTracker = () => {
    const stored = sessionStorage.getItem("catchup:plannedPath");
    if (stored) {
      try {
        setPlannedPath(JSON.parse(stored) as Coord[]);
      } catch {
        setPlannedPath(undefined);
      }
      sessionStorage.removeItem("catchup:plannedPath");
    } else {
      setPlannedPath(undefined);
    }
    setTrackerOpen(true);
  };

  return (
    <AppShell>
      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <p className="eyebrow text-primary">Run</p>
          <h1 className="font-display text-3xl font-black tracking-tight md:text-4xl">
            Where to today?
          </h1>
        </div>
        <Link to="/routes/new" className="hidden sm:block">
          <Button variant="outline" size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" /> New route
          </Button>
        </Link>
      </div>

      {/* Map hub */}
      <div className="mb-6 overflow-hidden rounded-2xl border border-border">
        <MapHub
          userLocation={userLocation}
          nearbyRoutes={[...mine, ...saved, ...nearby]}
          onStartFreeRun={openTracker}
        />
      </div>

      {/* Web background-tracking notice */}
      <div className="mb-6 rounded-xl border border-border bg-surface/40 p-3 text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">Heads up:</span> on the web, keep this tab in the foreground while running.
        We'll keep your screen on during a run. Background tracking with the screen locked is available in the mobile app.
      </div>

      {/* Rails */}
      {loading ? (
        <div className="font-mono-num text-sm text-muted-foreground">LOADING…</div>
      ) : (
        <div className="space-y-8">
          <Rail
            title="Nearby community routes"
            icon={<MapIcon className="h-4 w-4 text-primary" />}
            routes={nearby}
            empty="No public routes near you yet — be the first to map one."
          />
          <Rail
            title="Saved routes"
            icon={<Bookmark className="h-4 w-4 text-primary" />}
            routes={saved}
            empty="Bookmark routes you find on the map and they'll show up here."
          />
          <Rail
            title="Your routes"
            icon={<Plus className="h-4 w-4 text-primary" />}
            routes={mine}
            empty="You haven't built a route yet."
            cta={
              <Link to="/routes/new">
                <Button size="sm" variant="outline" className="gap-1.5">
                  <Plus className="h-3.5 w-3.5" /> Create route
                </Button>
              </Link>
            }
          />
        </div>
      )}

      {/* Run tracker dialog */}
      <Dialog open={trackerOpen} onOpenChange={setTrackerOpen}>
        <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">
              {plannedPath ? "Run with a planned path" : "Track a free run"}
            </DialogTitle>
          </DialogHeader>
          <RunTracker plannedPath={plannedPath} />
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function Rail({
  title,
  icon,
  routes,
  empty,
  cta,
}: {
  title: string;
  icon: React.ReactNode;
  routes: NearbyRoute[];
  empty: string;
  cta?: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display flex items-center gap-2 text-lg font-bold">
          {icon} {title}
          <span className="font-mono-num ml-1 text-sm font-normal text-muted-foreground">
            {routes.length}
          </span>
        </h2>
        {cta}
      </div>
      {routes.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-surface/30 p-5 text-sm text-muted-foreground">
          {empty}
        </p>
      ) : (
        <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2 [scrollbar-width:thin]">
          {routes.map((r) => (
            <Link
              key={r.id}
              to="/routes/$routeId"
              params={{ routeId: r.id }}
              className="group min-w-[240px] max-w-[260px] shrink-0 rounded-2xl border border-border bg-card p-4 transition-all hover:border-primary/50 hover:shadow-glow"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-display line-clamp-2 text-base font-bold leading-tight group-hover:text-primary">
                  {r.name}
                </h3>
                <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary" />
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className="font-mono-num text-base font-semibold text-primary">
                  {formatDistance(r.distance_meters)}
                </span>
                {r.best_time_seconds != null && (
                  <span className="font-mono-num flex items-center gap-1 text-xs text-muted-foreground">
                    <Trophy className="h-3 w-3 text-primary" />
                    {formatDuration(r.best_time_seconds)}
                  </span>
                )}
              </div>
              {r.best_runner_name && (
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  Best: {r.best_runner_name}
                </p>
              )}
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
