import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatClanTag, formatDistance, formatDuration, formatPace, haversineMeters } from "@/lib/format";
import { Activity, MapPin, Trophy, Target, Users, Globe, UserPlus, Compass } from "lucide-react";
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
type RouteLite = { id: string; name: string; coordinates: unknown };
type Profile = { user_id: string; display_name: string; clan_tag: string | null; avatar_url: string | null };
type Coord = [number, number];

type Tab = "following" | "nearby" | "groups" | "discover";

const TABS: Array<{ id: Tab; label: string; icon: typeof Users }> = [
  { id: "following", label: "Following", icon: UserPlus },
  { id: "nearby", label: "Nearby", icon: Compass },
  { id: "groups", label: "Groups", icon: Users },
  { id: "discover", label: "Discover", icon: Globe },
];

const NEARBY_RADIUS_METERS = 16093; // ~10 miles

export const Route = createFileRoute("/feed")({
  head: () => ({
    meta: [
      { title: "Feed — Own The Run" },
      { name: "description", content: "Latest runs from people you follow, your groups, and the community." },
    ],
  }),
  component: FeedPage,
});

function FeedPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("discover");
  const [runs, setRuns] = useState<Run[]>([]);
  const [routes, setRoutes] = useState<Record<string, RouteLite>>({});
  const [profiles, setProfiles] = useState<Record<string, { name: string; tag: string | null; avatar: string | null }>>({});
  const [loading, setLoading] = useState(true);
  const [userCoord, setUserCoord] = useState<Coord | null>(null);
  const [shelfTrophies, setShelfTrophies] = useState<Array<{ title: string; tier: AchievementTier; icon: string }>>([]);
  const [shelfChallenges, setShelfChallenges] = useState<Array<{ id: string; title: string; progress: number; target: number; ends_at: string }>>([]);

  // Get user's approx location for "Nearby" filter (browser GPS, one-shot).
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserCoord([pos.coords.longitude, pos.coords.latitude]),
      () => {},
      { timeout: 4000, maximumAge: 5 * 60 * 1000 },
    );
  }, []);

  // Trophy + challenge shelf (only depends on user)
  useEffect(() => {
    if (!user) return;
    (async () => {
      const [tRes, defsRes, progRes] = await Promise.all([
        supabase.from("user_achievements").select("achievement_code, earned_at").eq("user_id", user.id).order("earned_at", { ascending: false }).limit(5),
        supabase.from("achievement_definitions").select("code, title, tier, icon"),
        supabase.from("user_challenge_progress").select("challenge_id, progress_value, completed_at").eq("user_id", user.id).is("completed_at", null),
      ]);
      const defs: Record<string, { title: string; tier: AchievementTier; icon: string }> = {};
      ((defsRes.data as Array<{ code: string; title: string; tier: AchievementTier; icon: string }> | null) ?? []).forEach((d) => (defs[d.code] = d));
      setShelfTrophies(
        ((tRes.data as Array<{ achievement_code: string }> | null) ?? [])
          .map((r) => defs[r.achievement_code])
          .filter((x): x is { title: string; tier: AchievementTier; icon: string } => !!x),
      );

      const progRows = (progRes.data as Array<{ challenge_id: string; progress_value: number }> | null) ?? [];
      if (progRows.length) {
        const { data: chData } = await supabase
          .from("challenges")
          .select("id, title, target_value, ends_at")
          .in("id", progRows.map((r) => r.challenge_id))
          .gt("ends_at", new Date().toISOString());
        const merged = ((chData as Array<{ id: string; title: string; target_value: number; ends_at: string }> | null) ?? []).map((c) => {
          const p = progRows.find((x) => x.challenge_id === c.id);
          return { id: c.id, title: c.title, progress: Number(p?.progress_value ?? 0), target: Number(c.target_value), ends_at: c.ends_at };
        });
        setShelfChallenges(merged);
      }
    })();
  }, [user]);

  // Reload feed when the tab changes
  useEffect(() => {
    setLoading(true);
    (async () => {
      let userIdFilter: string[] | null = null;

      if (tab === "following") {
        if (!user) {
          setRuns([]);
          setLoading(false);
          return;
        }
        // typesafe cast — follows table may not be in generated types yet
        const { data: follows } = await (supabase
          .from("follows" as never)
          .select("followee_id")
          .eq("follower_id", user.id) as unknown as Promise<{ data: Array<{ followee_id: string }> | null }>);
        userIdFilter = (follows ?? []).map((r) => r.followee_id);
        if (userIdFilter.length === 0) {
          setRuns([]);
          setLoading(false);
          return;
        }
      } else if (tab === "groups") {
        if (!user) {
          setRuns([]);
          setLoading(false);
          return;
        }
        const { data: groupRows } = await supabase.from("group_members").select("group_id").eq("user_id", user.id);
        const groupIds = (groupRows ?? []).map((r) => r.group_id);
        if (groupIds.length === 0) {
          setRuns([]);
          setLoading(false);
          return;
        }
        const { data: memberRows } = await supabase.from("group_members").select("user_id").in("group_id", groupIds);
        userIdFilter = Array.from(new Set((memberRows ?? []).map((r) => r.user_id)));
      }

      let q = supabase
        .from("runs")
        .select("id, user_id, route_id, duration_seconds, distance_meters, ran_at, notes")
        .in("visibility", ["public", "leaderboard"])
        .order("ran_at", { ascending: false })
        .limit(60);

      if (userIdFilter) q = q.in("user_id", userIdFilter);

      const { data } = await q;
      let rows = (data as Run[]) ?? [];

      // Fetch routes + profiles in parallel
      const routeIds = Array.from(new Set(rows.map((r) => r.route_id).filter((x): x is string => !!x)));
      const userIds = Array.from(new Set(rows.map((r) => r.user_id)));

      const [routeRes, profRes] = await Promise.all([
        routeIds.length
          ? supabase.from("routes").select("id, name, coordinates").in("id", routeIds)
          : Promise.resolve({ data: [] as RouteLite[] }),
        userIds.length
          ? supabase.from("profiles").select("user_id, display_name, clan_tag, avatar_url").in("user_id", userIds)
          : Promise.resolve({ data: [] as Profile[] }),
      ]);

      const rmap: Record<string, RouteLite> = {};
      (routeRes.data as RouteLite[] | null)?.forEach((r) => (rmap[r.id] = r));
      const pmap: Record<string, { name: string; tag: string | null; avatar: string | null }> = {};
      (profRes.data as Profile[] | null)?.forEach((p) => (pmap[p.user_id] = { name: p.display_name, tag: p.clan_tag, avatar: p.avatar_url }));

      // Nearby filter (client-side; uses the run's route start point)
      if (tab === "nearby" && userCoord) {
        rows = rows.filter((r) => {
          if (!r.route_id) return false;
          const route = rmap[r.route_id];
          const coords = Array.isArray(route?.coordinates) ? (route.coordinates as Coord[]) : [];
          if (coords.length === 0) return false;
          return haversineMeters(userCoord, coords[0]) <= NEARBY_RADIUS_METERS;
        });
      }

      setRoutes(rmap);
      setProfiles(pmap);
      setRuns(rows);
      setLoading(false);
    })();
  }, [tab, user, userCoord]);

  const emptyMessage = useMemo(() => {
    if (tab === "following") return user ? "Follow other runners to see their runs here." : "Sign in to follow other runners.";
    if (tab === "nearby") return userCoord ? "No public runs near you yet." : "Enable location to see nearby runs.";
    if (tab === "groups") return user ? "Join a group to see runs from your crew here." : "Sign in to see runs from your groups.";
    return "No runs yet. Be the first to share one.";
  }, [tab, user, userCoord]);

  return (
    <AppShell>
      <div className="mb-6">
        <p className="eyebrow text-primary">The feed</p>
        <h1 className="font-display text-4xl font-black tracking-tight">Runs</h1>
      </div>

      {/* Tabs */}
      <div className="mb-5 -mx-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex gap-1.5">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Trophy + challenge shelf */}
      {(shelfTrophies.length > 0 || shelfChallenges.length > 0) && (
        <div className="mb-5 -mx-4 overflow-x-auto px-4">
          <div className="flex gap-2">
            {shelfChallenges.map((c) => {
              const pct = Math.min(100, Math.round((c.progress / c.target) * 100));
              return (
                <Link key={c.id} to="/challenges" className="flex w-44 shrink-0 flex-col gap-1.5 rounded-xl border border-primary/30 bg-primary/5 p-3 hover:border-primary/60">
                  <div className="flex items-center gap-1.5">
                    <Target className="h-3.5 w-3.5 text-primary" />
                    <p className="font-mono-num text-[10px] uppercase tracking-wider text-primary">CHALLENGE</p>
                  </div>
                  <p className="truncate text-sm font-bold">{c.title}</p>
                  <div className="h-1.5 overflow-hidden rounded bg-surface">
                    <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="font-mono-num text-[10px] text-muted-foreground">{pct}% COMPLETE</p>
                </Link>
              );
            })}
            {shelfTrophies.map((t, i) => {
              const Icon = iconFor(t.icon);
              return (
                <Link key={i} to="/trophies" className="flex w-32 shrink-0 flex-col items-center gap-1.5 rounded-xl border border-border bg-card p-3 text-center hover:border-primary/40">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg ring-2 ${TIER_RING[t.tier]}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <p className="line-clamp-2 text-[11px] font-medium leading-tight">{t.title}</p>
                </Link>
              );
            })}
            <Link to="/trophies" className="flex w-24 shrink-0 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border bg-surface/30 p-3 text-center hover:border-primary/40">
              <Trophy className="h-5 w-5 text-muted-foreground" />
              <p className="text-[11px] text-muted-foreground">View all</p>
            </Link>
          </div>
        </div>
      )}

      {loading ? (
        <div className="font-mono-num text-sm text-muted-foreground">LOADING…</div>
      ) : runs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface/30 p-10 text-center">
          <Activity className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="font-display mt-3 text-2xl font-bold">Nothing here</p>
          <p className="mt-2 text-sm text-muted-foreground">{emptyMessage}</p>
          <Link to="/routes/new" className="mt-4 inline-block">
            <Button>Create a route</Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {runs.map((r) => (
            <RunCard
              key={r.id}
              run={r}
              route={r.route_id ? routes[r.route_id] : undefined}
              profile={profiles[r.user_id]}
            />
          ))}
        </div>
      )}
    </AppShell>
  );
}

// ---------- run card with mini route preview ----------

function RunCard({
  run,
  route,
  profile,
}: {
  run: Run;
  route: RouteLite | undefined;
  profile: { name: string; tag: string | null; avatar: string | null } | undefined;
}) {
  const coords = useMemo(() => {
    if (!route || !Array.isArray(route.coordinates)) return [] as Coord[];
    return route.coordinates as Coord[];
  }, [route]);

  return (
    <article className="overflow-hidden rounded-2xl border border-border bg-card transition-colors hover:border-primary/30">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 pb-3">
        <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-surface">
          {profile?.avatar ? (
            <img src={profile.avatar} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center font-bold text-primary">
              {(profile?.name ?? "R").slice(0, 1).toUpperCase()}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-sm">
            {profile?.tag && <span className="font-mono-num text-primary">{formatClanTag(profile.tag)}</span>}
            <span className="truncate font-semibold">{profile?.name ?? "Runner"}</span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {new Date(run.ran_at).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
          </p>
        </div>
      </div>

      {/* Mini route preview */}
      {coords.length > 1 && (
        <div className="relative aspect-[16/9] w-full overflow-hidden bg-gradient-to-b from-surface/50 to-black">
          <RouteSparkline coords={coords} />
          {route && (
            <Link
              to="/routes/$routeId"
              params={{ routeId: route.id }}
              className="absolute bottom-2 left-3 right-3 line-clamp-1 rounded-md bg-black/60 px-2 py-1 text-xs font-semibold text-white backdrop-blur hover:bg-black/80"
            >
              <MapPin className="mr-1 inline h-3 w-3" />
              {route.name}
            </Link>
          )}
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 border-t border-border p-4">
        <Stat label="Distance" value={formatDistance(run.distance_meters)} />
        <Stat label="Time" value={formatDuration(run.duration_seconds)} />
        <Stat label="Pace" value={formatPace(run.distance_meters, run.duration_seconds)} />
      </div>

      {run.notes && (
        <p className="border-t border-border bg-surface/20 px-4 py-3 text-sm text-muted-foreground">"{run.notes}"</p>
      )}
    </article>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <p className="eyebrow text-[10px] text-muted-foreground">{label}</p>
      <p className="font-mono-num text-base font-bold text-foreground">{value}</p>
    </div>
  );
}

// SVG mini route preview — no map tiles, just the GPS shape on a subtle grid.
function RouteSparkline({ coords }: { coords: Coord[] }) {
  const path = useMemo(() => {
    if (coords.length < 2) return "";
    let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
    for (const [lng, lat] of coords) {
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
    const W = 320, H = 180, PAD = 16;
    const dLng = Math.max(1e-6, maxLng - minLng);
    const dLat = Math.max(1e-6, maxLat - minLat);
    const scale = Math.min((W - PAD * 2) / dLng, (H - PAD * 2) / dLat);
    const cx = W / 2, cy = H / 2;
    const midLng = (minLng + maxLng) / 2;
    const midLat = (minLat + maxLat) / 2;
    return coords
      .map(([lng, lat], i) => {
        const x = cx + (lng - midLng) * scale;
        const y = cy - (lat - midLat) * scale;
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }, [coords]);

  return (
    <svg viewBox="0 0 320 180" className="h-full w-full" preserveAspectRatio="xMidYMid meet">
      <defs>
        <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(76,217,123,0.06)" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="320" height="180" fill="url(#grid)" />
      <path d={path} fill="none" stroke="rgba(76,217,123,0.3)" strokeWidth="6" strokeLinejoin="round" strokeLinecap="round" />
      <path d={path} fill="none" stroke="hsl(var(--primary))" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
