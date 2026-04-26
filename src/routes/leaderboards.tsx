import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { formatClanTag, formatDistance, formatDuration } from "@/lib/format";
import { Trophy, ArrowRight } from "lucide-react";

type RouteWithBest = {
  id: string;
  name: string;
  distance_meters: number;
  best_time: number | null;
  best_user: string | null;
  best_user_tag: string | null;
  run_count: number;
};

export const Route = createFileRoute("/leaderboards")({
  head: () => ({
    meta: [
      { title: "Leaderboards — Catch Up" },
      { name: "description", content: "Top times across every public route." },
    ],
  }),
  component: LeaderboardsPage,
});

function LeaderboardsPage() {
  const [boards, setBoards] = useState<RouteWithBest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: routesData } = await supabase
        .from("routes")
        .select("id, name, distance_meters")
        .eq("is_public", true);

      const routesList = (routesData ?? []) as Array<Pick<RouteWithBest, "id" | "name" | "distance_meters">>;
      if (routesList.length === 0) {
        setBoards([]);
        setLoading(false);
        return;
      }

      const routeIds = routesList.map((r) => r.id);
      const { data: runsData } = await supabase
        .from("runs")
        .select("route_id, user_id, duration_seconds")
        .in("route_id", routeIds);

      const runs = (runsData ?? []) as Array<{
        route_id: string;
        user_id: string;
        duration_seconds: number;
      }>;

      const userIds = Array.from(new Set(runs.map((r) => r.user_id)));
      const { data: profs } = userIds.length
        ? await supabase.from("profiles").select("user_id, display_name, clan_tag").in("user_id", userIds)
        : { data: [] };
      const profMap: Record<string, { name: string; tag: string | null }> = {};
      ((profs as Array<{ user_id: string; display_name: string; clan_tag: string | null }> | null) ?? []).forEach(
        (p) => (profMap[p.user_id] = { name: p.display_name, tag: p.clan_tag }),
      );

      const grouped = routesList.map((r): RouteWithBest => {
        const myRuns = runs.filter((x) => x.route_id === r.id);
        if (myRuns.length === 0) {
          return { ...r, best_time: null, best_user: null, best_user_tag: null, run_count: 0 };
        }
        const best = myRuns.reduce((a, b) =>
          a.duration_seconds < b.duration_seconds ? a : b,
        );
        return {
          ...r,
          best_time: best.duration_seconds,
          best_user: profMap[best.user_id]?.name ?? "Runner",
          best_user_tag: profMap[best.user_id]?.tag ?? null,
          run_count: myRuns.length,
        };
      });

      // Sort: routes with runs first, then alphabetical
      grouped.sort((a, b) => {
        if (a.run_count !== b.run_count) return b.run_count - a.run_count;
        return a.name.localeCompare(b.name);
      });

      setBoards(grouped);
      setLoading(false);
    })();
  }, []);

  return (
    <AppShell>
      <div className="mb-6">
        <p className="eyebrow text-primary">Leaderboards</p>
        <h1 className="font-display text-4xl font-black tracking-tight">Who's in front?</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Best times on every public route. Catch up if you can.
        </p>
      </div>

      {loading ? (
        <div className="font-mono-num text-sm text-muted-foreground">LOADING…</div>
      ) : boards.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface/30 p-10 text-center">
          <Trophy className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="font-display mt-3 text-2xl font-bold">No public routes yet</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Create a public route to start a leaderboard.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {boards.map((b) => (
            <Link
              key={b.id}
              to="/routes/$routeId"
              params={{ routeId: b.id }}
              className="group flex items-center gap-4 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
            >
              <div className="min-w-0 flex-1">
                <div className="font-display text-lg font-bold leading-tight group-hover:text-primary">
                  {b.name}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  <span className="font-mono-num">{formatDistance(b.distance_meters)}</span>
                  {" · "}
                  {b.run_count} {b.run_count === 1 ? "run" : "runs"}
                </div>
              </div>
              <div className="text-right">
                {b.best_time !== null ? (
                  <>
                    <div className="font-mono-num text-2xl font-bold text-primary tabular-nums">
                      {formatDuration(b.best_time)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      held by {b.best_user_tag && (
                        <span className="font-mono-num text-primary">{formatClanTag(b.best_user_tag)}</span>
                      )}{b.best_user}
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-muted-foreground">No times yet</div>
                )}
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}
