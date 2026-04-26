import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import {
  formatClanTag,
  formatDistance,
  formatDuration,
  formatPace,
  formatElevation,
  metersToMiles,
  ageFromBirthdate,
  ageInBucket,
  windowStart,
  minMetersForDistanceFilter,
  ownershipThresholdMiles,
  type AgeBucket,
  type DistanceFilter,
  type TimeFilter,
  type ActivityLabel,
  activityLabel,
} from "@/lib/format";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Crown, Trophy, Star, BookmarkPlus, Bookmark, Filter } from "lucide-react";
import { toast } from "sonner";

type Category = "miles" | "pace" | "time";
type GenderFilter = "all" | "male" | "female" | "nonbinary";

type RunRow = {
  id: string;
  user_id: string;
  duration_seconds: number;
  distance_meters: number;
  elevation_gain_meters: number;
  ran_at: string;
};
type ProfileRow = {
  user_id: string;
  display_name: string;
  clan_tag: string | null;
  gender: string | null;
  birthdate: string | null;
};
type SavedView = {
  id: string;
  name: string;
  category: Category;
  time_filter: TimeFilter;
  distance_filter: DistanceFilter | null;
  gender_filter: GenderFilter | null;
  age_filter: AgeBucket | null;
  is_default: boolean;
};

type RankRow = {
  user_id: string;
  profile: ProfileRow | undefined;
  totalMeters: number;
  totalSeconds: number;
  paceSecPerMeter: number; // smaller = faster
  bestRun?: RunRow;
  totalElevation: number;
  activity: ActivityLabel;
  ownershipEligible: boolean;
  topRun?: RunRow;
};

export const Route = createFileRoute("/leaderboards")({
  head: () => ({
    meta: [
      { title: "Leaderboards — Catch Up" },
      { name: "description", content: "Global leaderboards across miles, pace, and time." },
    ],
  }),
  component: LeaderboardsPage,
});

function LeaderboardsPage() {
  const [category, setCategory] = useState<Category>("miles");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("week");
  const [distanceFilter, setDistanceFilter] = useState<DistanceFilter>("any");
  const [genderFilter, setGenderFilter] = useState<GenderFilter>("all");
  const [ageFilter, setAgeFilter] = useState<AgeBucket>("all");

  const [runs, setRuns] = useState<RunRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileRow>>({});
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);

  // Load default saved view on first mount
  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id ?? null;
      setUserId(uid);
      if (uid) {
        const { data: views } = await supabase
          .from("saved_views")
          .select("*")
          .eq("user_id", uid)
          .order("created_at", { ascending: true });
        const list = (views as SavedView[] | null) ?? [];
        setSavedViews(list);
        const def = list.find((v) => v.is_default);
        if (def) applyView(def);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load runs whenever filters change
  useEffect(() => {
    (async () => {
      setLoading(true);
      let q = supabase
        .from("runs")
        .select("id, user_id, duration_seconds, distance_meters, elevation_gain_meters, ran_at")
        .eq("visibility", "leaderboard");

      const start = windowStart(timeFilter);
      if (start) q = q.gte("ran_at", start.toISOString());

      const { data: runsData } = await q;
      const rows = (runsData as RunRow[] | null) ?? [];
      setRuns(rows);

      const ids = Array.from(new Set(rows.map((r) => r.user_id)));
      if (ids.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("user_id, display_name, clan_tag, gender, birthdate")
          .in("user_id", ids);
        const map: Record<string, ProfileRow> = {};
        ((profs as ProfileRow[] | null) ?? []).forEach((p) => (map[p.user_id] = p));
        setProfiles(map);
      } else {
        setProfiles({});
      }
      setLoading(false);
    })();
  }, [timeFilter]);

  // Compute rankings respecting filters
  const ranked = useMemo<RankRow[]>(() => {
    const minMeters = category === "pace" ? minMetersForDistanceFilter(distanceFilter) : 0;
    const elig: Record<string, RunRow[]> = {};
    runs.forEach((r) => {
      if (category === "pace" && r.distance_meters < Math.max(minMeters, 1609.344)) return;
      (elig[r.user_id] ||= []).push(r);
    });

    const all: RankRow[] = Object.entries(elig).map(([uid, userRuns]) => {
      const profile = profiles[uid];
      const totalMeters = userRuns.reduce((s, r) => s + Number(r.distance_meters), 0);
      const totalSeconds = userRuns.reduce((s, r) => s + Number(r.duration_seconds), 0);
      const paceSecPerMeter = totalMeters > 0 ? totalSeconds / totalMeters : Infinity;
      const totalElevation = userRuns.reduce(
        (s, r) => s + Number(r.elevation_gain_meters),
        0,
      );
      const totalMiles = metersToMiles(totalMeters);
      const activity = activityLabel(totalMiles, timeFilter);
      const eligibleByMiles =
        totalMiles >= ownershipThresholdMiles(timeFilter);
      // Best (fastest pace) run for this user
      const topRun = [...userRuns].sort(
        (a, b) =>
          Number(a.duration_seconds) / Number(a.distance_meters) -
          Number(b.duration_seconds) / Number(b.distance_meters),
      )[0];
      return {
        user_id: uid,
        profile,
        totalMeters,
        totalSeconds,
        paceSecPerMeter,
        totalElevation,
        activity,
        ownershipEligible: eligibleByMiles,
        topRun,
      };
    });

    // View filters (gender / age) — affect view, NOT ownership
    const view = all.filter((r) => {
      if (genderFilter !== "all" && r.profile?.gender !== genderFilter) return false;
      if (ageFilter !== "all") {
        const age = ageFromBirthdate(r.profile?.birthdate);
        if (!ageInBucket(age, ageFilter)) return false;
      }
      return true;
    });

    view.sort((a, b) => {
      if (category === "miles") return b.totalMeters - a.totalMeters;
      if (category === "time") return b.totalSeconds - a.totalSeconds;
      return a.paceSecPerMeter - b.paceSecPerMeter;
    });

    return view;
  }, [runs, profiles, category, distanceFilter, genderFilter, ageFilter, timeFilter]);

  // Ownership uses unfiltered (gender/age don't matter) but does apply distance filter for pace
  const ownership = useMemo(() => {
    const all: RankRow[] = [];
    const minMeters = category === "pace" ? minMetersForDistanceFilter(distanceFilter) : 0;
    const grouped: Record<string, RunRow[]> = {};
    runs.forEach((r) => {
      if (category === "pace" && r.distance_meters < Math.max(minMeters, 1609.344)) return;
      (grouped[r.user_id] ||= []).push(r);
    });
    Object.entries(grouped).forEach(([uid, userRuns]) => {
      const totalMeters = userRuns.reduce((s, r) => s + Number(r.distance_meters), 0);
      const totalSeconds = userRuns.reduce((s, r) => s + Number(r.duration_seconds), 0);
      const totalMiles = metersToMiles(totalMeters);
      all.push({
        user_id: uid,
        profile: profiles[uid],
        totalMeters,
        totalSeconds,
        paceSecPerMeter: totalMeters > 0 ? totalSeconds / totalMeters : Infinity,
        totalElevation: 0,
        activity: activityLabel(totalMiles, timeFilter),
        ownershipEligible: totalMiles >= ownershipThresholdMiles(timeFilter),
      });
    });
    all.sort((a, b) => {
      if (category === "miles") return b.totalMeters - a.totalMeters;
      if (category === "time") return b.totalSeconds - a.totalSeconds;
      return a.paceSecPerMeter - b.paceSecPerMeter;
    });
    const top = all[0];
    const owner = all.find((r) => r.ownershipEligible);
    return { top, owner };
  }, [runs, profiles, category, distanceFilter, timeFilter]);

  const ownerLabel =
    timeFilter === "week"
      ? "Weekly Leader"
      : timeFilter === "month"
      ? "Current Owner"
      : timeFilter === "year"
      ? "Yearly Owner"
      : "All-Time Owner";

  function applyView(v: SavedView) {
    setCategory(v.category);
    setTimeFilter(v.time_filter);
    setDistanceFilter(v.distance_filter ?? "any");
    setGenderFilter(v.gender_filter ?? "all");
    setAgeFilter(v.age_filter ?? "all");
  }

  async function saveCurrentView() {
    if (!userId) return;
    const name = window.prompt("Name this view");
    if (!name) return;
    const { data, error } = await supabase
      .from("saved_views")
      .insert({
        user_id: userId,
        name: name.slice(0, 40),
        category,
        time_filter: timeFilter,
        distance_filter: distanceFilter,
        gender_filter: genderFilter,
        age_filter: ageFilter,
      })
      .select("*")
      .single();
    if (error) return toast.error(error.message);
    setSavedViews((prev) => [...prev, data as SavedView]);
    toast.success("View saved");
  }

  async function setDefault(viewId: string) {
    if (!userId) return;
    await supabase.from("saved_views").update({ is_default: false }).eq("user_id", userId);
    await supabase.from("saved_views").update({ is_default: true }).eq("id", viewId);
    setSavedViews((prev) =>
      prev.map((v) => ({ ...v, is_default: v.id === viewId })),
    );
    toast.success("Set as default");
  }

  async function deleteView(viewId: string) {
    await supabase.from("saved_views").delete().eq("id", viewId);
    setSavedViews((prev) => prev.filter((v) => v.id !== viewId));
  }

  return (
    <AppShell>
      <div className="mb-6">
        <p className="eyebrow text-primary">Leaderboards</p>
        <h1 className="font-display text-4xl font-black tracking-tight">Who's in front?</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Submit your runs to compete. Filters change your view — ownership stays global.
        </p>
      </div>

      {/* Category selector */}
      <div className="mb-3 inline-flex rounded-xl border border-border bg-card p-1">
        {(["miles", "pace", "time"] as Category[]).map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`rounded-lg px-4 py-1.5 text-sm font-bold capitalize transition-colors ${
              category === c
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {c === "miles" ? "Miles" : c === "pace" ? "Avg Pace" : "Time"}
          </button>
        ))}
      </div>

      {/* Time filter */}
      <div className="mb-3 flex flex-wrap gap-2">
        {(["week", "month", "year", "all"] as TimeFilter[]).map((t) => (
          <button
            key={t}
            onClick={() => setTimeFilter(t)}
            className={`rounded-md border px-3 py-1 text-xs font-bold uppercase tracking-wide ${
              timeFilter === t
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "all" ? "All time" : `This ${t}`}
          </button>
        ))}
      </div>

      {/* Distance filter (pace only) */}
      {category === "pace" && (
        <div className="mb-3 flex flex-wrap gap-2">
          {(
            [
              ["any", "1 mi+"],
              ["5k", "5K+"],
              ["10k", "10K+"],
              ["half", "Half+"],
              ["marathon", "Marathon+"],
            ] as Array<[DistanceFilter, string]>
          ).map(([d, label]) => (
            <button
              key={d}
              onClick={() => setDistanceFilter(d)}
              className={`rounded-md border px-3 py-1 text-xs font-bold uppercase tracking-wide ${
                distanceFilter === d
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Filter toggle */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowFilters((s) => !s)}
          className="gap-1"
        >
          <Filter className="h-3.5 w-3.5" />
          Filters
        </Button>
        {userId && (
          <Button size="sm" variant="ghost" onClick={saveCurrentView} className="gap-1">
            <BookmarkPlus className="h-3.5 w-3.5" />
            Save view
          </Button>
        )}
        {savedViews.length > 0 && (
          <Select onValueChange={(id) => {
            const v = savedViews.find((x) => x.id === id);
            if (v) applyView(v);
          }}>
            <SelectTrigger className="h-8 w-[170px] text-xs">
              <SelectValue placeholder="Saved views" />
            </SelectTrigger>
            <SelectContent>
              {savedViews.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.is_default && "★ "}{v.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {showFilters && (
        <div className="mb-4 grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="eyebrow text-muted-foreground">Gender</label>
            <Select value={genderFilter} onValueChange={(v) => setGenderFilter(v as GenderFilter)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="male">Men</SelectItem>
                <SelectItem value="female">Women</SelectItem>
                <SelectItem value="nonbinary">Nonbinary</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="eyebrow text-muted-foreground">Age</label>
            <Select value={ageFilter} onValueChange={(v) => setAgeFilter(v as AgeBucket)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All ages</SelectItem>
                <SelectItem value="under18">Under 18</SelectItem>
                <SelectItem value="18_27">18–27</SelectItem>
                <SelectItem value="28_34">28–34</SelectItem>
                <SelectItem value="35_44">35–44</SelectItem>
                <SelectItem value="45_54">45–54</SelectItem>
                <SelectItem value="55_64">55–64</SelectItem>
                <SelectItem value="65_74">65–74</SelectItem>
                <SelectItem value="75plus">75+</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {savedViews.length > 0 && (
            <div className="sm:col-span-2 space-y-2">
              <p className="eyebrow text-muted-foreground">Your saved views</p>
              <div className="flex flex-wrap gap-2">
                {savedViews.map((v) => (
                  <div key={v.id} className="flex items-center gap-1 rounded-md border border-border bg-surface/40 px-2 py-1 text-xs">
                    <button onClick={() => applyView(v)} className="font-medium hover:text-primary">
                      {v.name}
                    </button>
                    <button
                      onClick={() => setDefault(v.id)}
                      className={v.is_default ? "text-primary" : "text-muted-foreground hover:text-foreground"}
                      aria-label="Set default"
                    >
                      <Star className={`h-3 w-3 ${v.is_default ? "fill-current" : ""}`} />
                    </button>
                    <button
                      onClick={() => deleteView(v.id)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Ownership header */}
      <div className="mb-5 rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 to-transparent p-5">
        <p className="eyebrow flex items-center gap-1 text-primary">
          <Crown className="h-3.5 w-3.5" /> {ownerLabel}
        </p>
        {ownership.top ? (
          ownership.owner ? (
            <div className="mt-1 flex flex-wrap items-baseline gap-2">
              <p className="font-display text-3xl font-black">
                {ownership.owner.profile?.clan_tag && (
                  <span className="font-mono-num text-primary mr-1">
                    {formatClanTag(ownership.owner.profile.clan_tag)}
                  </span>
                )}
                {ownership.owner.profile?.display_name ?? "Runner"}
              </p>
              <p className="font-mono-num text-lg text-primary">
                {category === "miles" && formatDistance(ownership.owner.totalMeters)}
                {category === "time" && formatDuration(ownership.owner.totalSeconds)}
                {category === "pace" &&
                  formatPace(ownership.owner.totalMeters, ownership.owner.totalSeconds)}
              </p>
            </div>
          ) : (
            <p className="font-display mt-1 text-xl font-bold text-muted-foreground">
              #1, Not eligible for ownership
              <span className="ml-2 text-xs font-medium uppercase">
                (need {ownershipThresholdMiles(timeFilter)} mi)
              </span>
            </p>
          )
        ) : (
          <p className="font-display mt-1 text-xl font-bold text-muted-foreground">
            No verified runs yet
          </p>
        )}
      </div>

      {/* Leaderboard list */}
      {loading ? (
        <div className="font-mono-num text-sm text-muted-foreground">LOADING…</div>
      ) : ranked.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface/30 p-10 text-center">
          <Trophy className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="font-display mt-3 text-2xl font-bold">No one matches yet</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Try a different time window, or submit your run to get on the board.
          </p>
        </div>
      ) : (
        <ol className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {ranked.map((r, i) => (
            <li
              key={r.user_id}
              className={`flex items-center justify-between gap-3 px-4 py-3 ${
                i === 0 ? "bg-primary/5" : ""
              } ${r.user_id === userId ? "ring-1 ring-inset ring-primary/30" : ""}`}
            >
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className={`font-mono-num w-8 text-center text-sm font-bold ${
                    i === 0 ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  {i === 0 ? <Crown className="mx-auto h-4 w-4" /> : `#${i + 1}`}
                </span>
                <div className="min-w-0">
                  <div className="truncate font-medium">
                    {r.profile?.clan_tag && (
                      <span className="font-mono-num text-primary">
                        {formatClanTag(r.profile.clan_tag)}
                      </span>
                    )}
                    {r.profile?.display_name ?? "Runner"}
                    {r.user_id === userId && (
                      <span className="ml-1.5 text-xs text-primary">you</span>
                    )}
                    <span
                      className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                        r.activity === "established"
                          ? "bg-primary/15 text-primary"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {r.activity === "established" ? "Established" : "Low Activity"}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {category === "miles" && (
                      <>
                        Avg pace {formatPace(r.totalMeters, r.totalSeconds)}
                      </>
                    )}
                    {category === "time" && (
                      <>{formatDistance(r.totalMeters)} total</>
                    )}
                    {category === "pace" && r.topRun && (
                      <>
                        {formatDistance(r.topRun.distance_meters)} ·{" "}
                        {formatElevation(r.topRun.elevation_gain_meters)} ·{" "}
                        {new Date(r.topRun.ran_at).toLocaleDateString()}
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono-num text-lg font-bold tabular-nums">
                  {category === "miles" && formatDistance(r.totalMeters)}
                  {category === "time" && formatDuration(r.totalSeconds)}
                  {category === "pace" && formatPace(r.totalMeters, r.totalSeconds)}
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </AppShell>
  );
}
