import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { StatTile } from "@/components/stats/StatTile";
import { ActivityHeatmap } from "@/components/stats/ActivityHeatmap";
import { TrophyCard } from "@/components/trophies/TrophyCard";
import {
  formatDistance,
  formatDuration,
  formatElevation,
  formatPace,
  metersToMiles,
} from "@/lib/format";
import {
  Activity,
  Flame,
  Mountain,
  Route as RouteIcon,
  Timer,
  Trophy,
  Zap,
} from "lucide-react";
import type { AchievementTier } from "@/lib/trophy";

export const Route = createFileRoute("/stats")({
  head: () => ({ meta: [{ title: "Stats — Own The Run" }] }),
  component: StatsPage,
});

type UserStats = {
  lifetime_meters: number;
  lifetime_seconds: number;
  lifetime_elevation: number;
  lifetime_runs: number;
  longest_run_meters: number;
  fastest_mile_seconds: number | null;
  current_streak_days: number;
  longest_streak_days: number;
  last_run_at: string | null;
};

type Run = {
  id: string;
  ran_at: string;
  distance_meters: number;
  duration_seconds: number;
  elevation_gain_meters: number;
  route_id: string | null;
  visibility: "private" | "public" | "leaderboard";
};

type Definition = {
  code: string;
  title: string;
  description: string;
  tier: AchievementTier;
  icon: string;
};

type Earned = { achievement_code: string; earned_at: string };

const PB_DISTANCES: Array<{ label: string; meters: number }> = [
  { label: "1 Mile", meters: 1609.344 },
  { label: "5K", meters: 5000 },
  { label: "10K", meters: 10000 },
  { label: "Half", meters: 21097.5 },
  { label: "Marathon", meters: 42195 },
];

function StatsPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<UserStats | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [defs, setDefs] = useState<Record<string, Definition>>({});
  const [earned, setEarned] = useState<Earned[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [s, r, d, e] = await Promise.all([
        supabase.from("user_stats").select("*").eq("user_id", user.id).maybeSingle(),
        supabase
          .from("runs")
          .select("id, ran_at, distance_meters, duration_seconds, elevation_gain_meters, route_id, visibility")
          .eq("user_id", user.id)
          .order("ran_at", { ascending: false })
          .limit(500),
        supabase.from("achievement_definitions").select("code, title, description, tier, icon"),
        supabase
          .from("user_achievements")
          .select("achievement_code, earned_at")
          .eq("user_id", user.id)
          .order("earned_at", { ascending: false })
          .limit(5),
      ]);
      setStats((s.data as UserStats | null) ?? null);
      setRuns((r.data as Run[]) ?? []);
      const dmap: Record<string, Definition> = {};
      ((d.data as Definition[]) ?? []).forEach((x) => (dmap[x.code] = x));
      setDefs(dmap);
      setEarned((e.data as Earned[]) ?? []);
      setLoading(false);
    })();
  }, [user]);

  const periodTotals = useMemo(() => {
    const now = new Date();
    const startOfWeek = new Date(now);
    const dow = (startOfWeek.getDay() + 6) % 7;
    startOfWeek.setDate(startOfWeek.getDate() - dow);
    startOfWeek.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    function totals(since: Date) {
      const filtered = runs.filter((r) => new Date(r.ran_at) >= since);
      const meters = filtered.reduce((s, r) => s + Number(r.distance_meters), 0);
      const seconds = filtered.reduce((s, r) => s + Number(r.duration_seconds), 0);
      const elev = filtered.reduce((s, r) => s + Number(r.elevation_gain_meters), 0);
      return { runs: filtered.length, meters, seconds, elev };
    }
    return {
      week: totals(startOfWeek),
      month: totals(startOfMonth),
      year: totals(startOfYear),
    };
  }, [runs]);

  const personalBests = useMemo(() => {
    const out: Array<{ label: string; pace: string; meters: number }> = [];
    for (const d of PB_DISTANCES) {
      const eligible = runs.filter((r) => Number(r.distance_meters) >= d.meters);
      if (eligible.length === 0) {
        out.push({ label: d.label, pace: "—", meters: d.meters });
        continue;
      }
      const best = eligible.reduce((best, r) => {
        const cur = (Number(r.duration_seconds) / Number(r.distance_meters)) * d.meters;
        return cur < best ? cur : best;
      }, Infinity);
      out.push({
        label: d.label,
        pace: formatPace(d.meters, best),
        meters: d.meters,
      });
    }
    return out;
  }, [runs]);

  if (loading) {
    return (
      <AppShell>
        <div className="font-mono-num text-sm text-muted-foreground">LOADING…</div>
      </AppShell>
    );
  }

  const s = stats ?? {
    lifetime_meters: 0,
    lifetime_seconds: 0,
    lifetime_elevation: 0,
    lifetime_runs: 0,
    longest_run_meters: 0,
    fastest_mile_seconds: null,
    current_streak_days: 0,
    longest_streak_days: 0,
    last_run_at: null,
  };

  return (
    <AppShell>
      <div className="mb-6">
        <p className="eyebrow text-primary">Your stats</p>
        <h1 className="font-display text-4xl font-black tracking-tight">All-time progress</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Every mile, every streak, every PR.{" "}
          <Link to="/trophies" className="text-primary hover:underline">View trophies →</Link>
        </p>
      </div>

      {/* Lifetime tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile
          label="Lifetime"
          value={`${metersToMiles(s.lifetime_meters).toFixed(1)} mi`}
          icon={RouteIcon}
          accent
        />
        <StatTile label="Total runs" value={String(s.lifetime_runs)} icon={Activity} />
        <StatTile
          label="Total time"
          value={formatDuration(Math.round(s.lifetime_seconds))}
          icon={Timer}
        />
        <StatTile
          label="Elevation"
          value={formatElevation(s.lifetime_elevation)}
          icon={Mountain}
        />
        <StatTile
          label="Current streak"
          value={`${s.current_streak_days}d`}
          sub={`Longest: ${s.longest_streak_days}d`}
          icon={Flame}
        />
        <StatTile
          label="Fastest mile"
          value={
            s.fastest_mile_seconds != null
              ? formatDuration(Math.round(s.fastest_mile_seconds))
              : "—"
          }
          icon={Zap}
        />
      </div>

      {/* Period breakdown */}
      <h2 className="font-display mt-8 text-2xl font-bold">This week / month / year</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {(["week", "month", "year"] as const).map((p) => {
          const t = periodTotals[p];
          return (
            <div key={p} className="rounded-2xl border border-border bg-card p-4">
              <p className="font-mono-num text-[10px] uppercase tracking-wider text-muted-foreground">
                THIS {p.toUpperCase()}
              </p>
              <p className="font-mono-num mt-2 text-3xl font-bold tabular-nums text-primary">
                {metersToMiles(t.meters).toFixed(1)} mi
              </p>
              <div className="font-mono-num mt-3 grid grid-cols-3 gap-2 text-xs">
                <div>
                  <p className="text-muted-foreground">RUNS</p>
                  <p className="text-foreground">{t.runs}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">TIME</p>
                  <p className="text-foreground">{formatDuration(Math.round(t.seconds))}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">ELEV</p>
                  <p className="text-foreground">{formatElevation(t.elev)}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Personal bests */}
      <h2 className="font-display mt-8 text-2xl font-bold">Personal bests</h2>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {personalBests.map((pb) => (
          <div key={pb.label} className="rounded-2xl border border-border bg-card p-4 text-center">
            <p className="font-mono-num text-[10px] uppercase tracking-wider text-muted-foreground">
              {pb.label}
            </p>
            <p className="font-mono-num mt-2 text-xl font-bold text-primary tabular-nums">
              {pb.pace}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="font-mono-num text-[10px] uppercase tracking-wider text-muted-foreground">
            LONGEST RUN
          </p>
          <p className="font-mono-num mt-2 text-xl font-bold text-primary tabular-nums">
            {formatDistance(s.longest_run_meters)}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="font-mono-num text-[10px] uppercase tracking-wider text-muted-foreground">
            LONGEST STREAK
          </p>
          <p className="font-mono-num mt-2 text-xl font-bold text-primary tabular-nums">
            {s.longest_streak_days} days
          </p>
        </div>
      </div>

      {/* Past runs */}
      <h2 className="font-display mt-8 text-2xl font-bold">Past runs</h2>
      {runs.length === 0 ? (
        <div className="mt-3 rounded-2xl border border-dashed border-border bg-surface/30 p-6 text-center">
          <p className="text-sm text-muted-foreground">
            No runs yet.{" "}
            <Link to="/" className="text-primary hover:underline">Start your first run →</Link>
          </p>
        </div>
      ) : (
        <div className="mt-3 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {runs.slice(0, 25).map((r) => {
            const date = new Date(r.ran_at);
            const dateStr = date.toLocaleDateString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
            });
            const timeStr = date.toLocaleTimeString(undefined, {
              hour: "numeric",
              minute: "2-digit",
            });
            const inner = (
              <div className="flex items-center gap-4 p-4 transition-colors hover:bg-surface/50">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold truncate">{dateStr}</p>
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {timeStr}
                    </span>
                  </div>
                  <div className="font-mono-num mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs tabular-nums text-muted-foreground">
                    <span className="text-primary">{formatDistance(r.distance_meters)}</span>
                    <span>{formatDuration(r.duration_seconds)}</span>
                    <span>{formatPace(r.distance_meters, r.duration_seconds)}</span>
                    {Number(r.elevation_gain_meters) > 0 && (
                      <span>↑ {formatElevation(r.elevation_gain_meters)}</span>
                    )}
                  </div>
                </div>
                {r.route_id && (
                  <span className="font-mono-num text-[10px] uppercase tracking-wider text-primary">
                    View route →
                  </span>
                )}
              </div>
            );
            return r.route_id ? (
              <Link
                key={r.id}
                to="/routes/$routeId"
                params={{ routeId: r.route_id }}
                className="block"
              >
                {inner}
              </Link>
            ) : (
              <div key={r.id}>{inner}</div>
            );
          })}
          {runs.length > 25 && (
            <div className="bg-surface/40 p-3 text-center text-xs text-muted-foreground">
              Showing 25 of {runs.length} runs
            </div>
          )}
        </div>
      )}

      {/* Heatmap */}
      <h2 className="font-display mt-8 text-2xl font-bold">Last 365 days</h2>
      <div className="mt-3 rounded-2xl border border-border bg-card p-4">
        <ActivityHeatmap runs={runs} />
      </div>

      {/* Recent trophies */}
      <h2 className="font-display mt-8 text-2xl font-bold">Recent trophies</h2>
      {earned.length === 0 ? (
        <div className="mt-3 rounded-2xl border border-dashed border-border bg-surface/30 p-6 text-center">
          <Trophy className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">
            Run to start unlocking trophies.{" "}
            <Link to="/trophies" className="text-primary hover:underline">See all</Link>
          </p>
        </div>
      ) : (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {earned.map((e) => {
            const d = defs[e.achievement_code];
            if (!d) return null;
            return (
              <TrophyCard
                key={e.achievement_code}
                title={d.title}
                description={d.description}
                tier={d.tier}
                icon={d.icon}
                earned
                earnedAt={e.earned_at}
              />
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
