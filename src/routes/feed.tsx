import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatClanTag, formatDistance, formatDuration, formatPace } from "@/lib/format";
import { Activity, MapPin, Trophy, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { iconFor, TIER_RING, type AchievementTier } from "@/lib/trophy";

type Run = {
  id: string;
  user_id: string;
  route_id: string | null;
  duration_seconds: number;
  distance_meters: number;
  ran_at: string;
  notes: string | null;
};
type RouteLite = { id: string; name: string };
type Profile = { user_id: string; display_name: string; clan_tag: string | null };

export const Route = createFileRoute("/feed")({
  head: () => ({
    meta: [
      { title: "Feed — Catch Up" },
      { name: "description", content: "Latest runs from you and the community." },
    ],
  }),
  component: FeedPage,
});

function FeedPage() {
  const { user } = useAuth();
  const [runs, setRuns] = useState<Run[]>([]);
  const [routes, setRoutes] = useState<Record<string, string>>({});
  const [profiles, setProfiles] = useState<Record<string, { name: string; tag: string | null }>>({});
  const [loading, setLoading] = useState(true);
  const [shelfTrophies, setShelfTrophies] = useState<
    Array<{ title: string; tier: AchievementTier; icon: string }>
  >([]);
  const [shelfChallenges, setShelfChallenges] = useState<
    Array<{ id: string; title: string; progress: number; target: number; ends_at: string }>
  >([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("runs")
        .select("id, user_id, route_id, duration_seconds, distance_meters, ran_at, notes")
        .in("visibility", ["public", "leaderboard"])
        .order("ran_at", { ascending: false })
        .limit(40);
      const rows = (data as Run[]) ?? [];
      setRuns(rows);

      const routeIds = Array.from(
        new Set(rows.map((r) => r.route_id).filter((x): x is string => !!x)),
      );
      const userIds = Array.from(new Set(rows.map((r) => r.user_id)));

      const [routeRes, profRes] = await Promise.all([
        routeIds.length
          ? supabase.from("routes").select("id, name").in("id", routeIds)
          : Promise.resolve({ data: [] as RouteLite[] }),
        userIds.length
          ? supabase.from("profiles").select("user_id, display_name, clan_tag").in("user_id", userIds)
          : Promise.resolve({ data: [] as Profile[] }),
      ]);

      const rmap: Record<string, string> = {};
      (routeRes.data as RouteLite[] | null)?.forEach((r) => (rmap[r.id] = r.name));
      setRoutes(rmap);
      const pmap: Record<string, { name: string; tag: string | null }> = {};
      (profRes.data as Profile[] | null)?.forEach(
        (p) => (pmap[p.user_id] = { name: p.display_name, tag: p.clan_tag }),
      );
      setProfiles(pmap);

      setLoading(false);
    })();
  }, []);

  return (
    <AppShell>
      <div className="mb-6">
        <p className="eyebrow text-primary">The feed</p>
        <h1 className="font-display text-4xl font-black tracking-tight">Latest runs</h1>
      </div>

      {loading ? (
        <div className="font-mono-num text-sm text-muted-foreground">LOADING…</div>
      ) : runs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface/30 p-10 text-center">
          <Activity className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="font-display mt-3 text-2xl font-bold">No runs yet</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Map a route and log your first run to kick things off.
          </p>
          <Link to="/routes/new" className="mt-4 inline-block">
            <Button>Create a route</Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {runs.map((r) => (
            <div
              key={r.id}
              className="rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/30"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {profiles[r.user_id]?.tag && (
                        <span className="font-mono-num text-primary">
                          {formatClanTag(profiles[r.user_id]?.tag)}
                        </span>
                      )}
                      {profiles[r.user_id]?.name ?? "Runner"}
                    </span>{" "}
                    ran{" "}
                    {r.route_id && routes[r.route_id] ? (
                      <Link
                        to="/routes/$routeId"
                        params={{ routeId: r.route_id }}
                        className="font-medium text-primary hover:underline"
                      >
                        {routes[r.route_id]}
                      </Link>
                    ) : (
                      <span className="text-foreground">a route</span>
                    )}
                  </div>
                  {r.notes && (
                    <p className="mt-1.5 text-sm text-muted-foreground">"{r.notes}"</p>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" />
                      <span className="font-mono-num">{formatDistance(r.distance_meters)}</span>
                    </span>
                    <span className="font-mono-num">
                      {formatPace(r.distance_meters, r.duration_seconds)}
                    </span>
                    <span className="text-xs">
                      {new Date(r.ran_at).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  </div>
                </div>
                <div className="font-mono-num text-2xl font-bold text-primary tabular-nums">
                  {formatDuration(r.duration_seconds)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
