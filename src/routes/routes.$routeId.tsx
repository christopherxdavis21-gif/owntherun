import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { RouteMap } from "@/components/RouteMap";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  formatDistance,
  formatDuration,
  formatPace,
  parseDuration,
} from "@/lib/format";
import { toast } from "sonner";
import { Trash2, Trophy, Lock, Globe, ArrowLeft, Crown } from "lucide-react";

type Coord = [number, number];
type RouteRow = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  distance_meters: number;
  is_public: boolean;
  coordinates: Coord[];
};
type RunRow = {
  id: string;
  user_id: string;
  duration_seconds: number;
  distance_meters: number;
  notes: string | null;
  ran_at: string;
};
type Profile = { user_id: string; display_name: string };

export const Route = createFileRoute("/routes/$routeId")({
  head: () => ({
    meta: [
      { title: "Route — Catch Up" },
      { name: "description", content: "Route details, leaderboard, and run logs." },
    ],
  }),
  component: RouteDetailPage,
});

function RouteDetailPage() {
  const { routeId } = Route.useParams();
  const navigate = useNavigate();
  const [route, setRoute] = useState<RouteRow | null>(null);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Run-log form
  const [duration, setDuration] = useState("");
  const [notes, setNotes] = useState("");
  const [logging, setLogging] = useState(false);

  const reload = async () => {
    setLoading(true);
    const [{ data: r }, { data: u }] = await Promise.all([
      supabase.from("routes").select("*").eq("id", routeId).maybeSingle(),
      supabase.auth.getUser(),
    ]);
    setUserId(u.user?.id ?? null);
    setRoute((r as RouteRow) ?? null);

    if (r) {
      const { data: runData } = await supabase
        .from("runs")
        .select("id, user_id, duration_seconds, distance_meters, notes, ran_at")
        .eq("route_id", routeId)
        .order("duration_seconds", { ascending: true });
      const runRows = (runData as RunRow[]) ?? [];
      setRuns(runRows);

      const userIds = Array.from(new Set(runRows.map((x) => x.user_id)));
      if (userIds.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("user_id, display_name")
          .in("user_id", userIds);
        const map: Record<string, string> = {};
        (profs as Profile[] | null)?.forEach((p) => (map[p.user_id] = p.display_name));
        setProfiles(map);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId]);

  const logRun = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!route || !userId) return;
    const seconds = parseDuration(duration);
    if (seconds <= 0) return toast.error("Enter a valid time like 24:30");
    setLogging(true);
    try {
      const { error } = await supabase.from("runs").insert({
        user_id: userId,
        route_id: route.id,
        duration_seconds: seconds,
        distance_meters: route.distance_meters,
        notes: notes.trim() || null,
      });
      if (error) throw error;
      toast.success("Run logged. Nice work.");
      setDuration("");
      setNotes("");
      void reload();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to log run");
    } finally {
      setLogging(false);
    }
  };

  const deleteRoute = async () => {
    if (!route || !userId || route.user_id !== userId) return;
    if (!confirm("Delete this route? This can't be undone.")) return;
    const { error } = await supabase.from("routes").delete().eq("id", route.id);
    if (error) return toast.error(error.message);
    toast.success("Route deleted");
    navigate({ to: "/routes" });
  };

  if (loading) {
    return (
      <AppShell>
        <div className="font-mono-num text-sm text-muted-foreground">LOADING…</div>
      </AppShell>
    );
  }

  if (!route) {
    return (
      <AppShell>
        <div className="rounded-2xl border border-border bg-card p-10 text-center">
          <p className="font-display text-2xl font-bold">Route not found</p>
          <Link to="/routes" className="mt-4 inline-block text-primary hover:underline">
            Back to routes
          </Link>
        </div>
      </AppShell>
    );
  }

  const isOwner = userId === route.user_id;
  const bestTime = runs[0]?.duration_seconds;

  return (
    <AppShell>
      <Link
        to="/routes"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> All routes
      </Link>

      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow flex items-center gap-2 text-primary">
            {route.is_public ? <Globe className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
            {route.is_public ? "Public route" : "Private route"}
          </p>
          <h1 className="font-display mt-1 text-4xl font-black tracking-tight md:text-5xl">
            {route.name}
          </h1>
          {route.description && (
            <p className="mt-2 max-w-2xl text-muted-foreground">{route.description}</p>
          )}
        </div>
        {isOwner && (
          <Button variant="ghost" size="sm" onClick={deleteRoute}>
            <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
          </Button>
        )}
      </div>

      <div className="mb-6 grid grid-cols-3 gap-3">
        <Stat label="Distance" value={formatDistance(route.distance_meters)} />
        <Stat label="Best time" value={bestTime ? formatDuration(bestTime) : "—"} highlight />
        <Stat label="Runs logged" value={String(runs.length)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <RouteMap coordinates={route.coordinates} className="h-[420px] w-full" />

          <section>
            <h2 className="font-display mb-3 flex items-center gap-2 text-2xl font-bold">
              <Trophy className="h-5 w-5 text-primary" /> Leaderboard
            </h2>
            {runs.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-surface/30 p-8 text-center text-sm text-muted-foreground">
                No one has run this yet. Be first.
              </div>
            ) : (
              <ol className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
                {runs.map((r, i) => (
                  <li
                    key={r.id}
                    className={`flex items-center justify-between gap-3 px-4 py-3 ${
                      i === 0 ? "bg-primary/5" : ""
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={`font-mono-num w-8 text-center text-sm font-bold ${
                          i === 0 ? "text-primary" : "text-muted-foreground"
                        }`}
                      >
                        {i === 0 ? <Crown className="mx-auto h-4 w-4" /> : `#${i + 1}`}
                      </span>
                      <div className="min-w-0">
                        <div className="truncate font-medium">
                          {profiles[r.user_id] ?? "Runner"}
                          {r.user_id === userId && (
                            <span className="ml-1.5 text-xs text-primary">you</span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatPace(r.distance_meters, r.duration_seconds)} ·{" "}
                          {new Date(r.ran_at).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                    <div className="font-mono-num text-lg font-bold tabular-nums">
                      {formatDuration(r.duration_seconds)}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <aside className="h-fit space-y-4 rounded-2xl border border-border bg-card p-5">
          <div>
            <h3 className="font-display text-xl font-bold">Log a run</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Climb the board for {route.name}.
            </p>
          </div>
          <form onSubmit={logRun} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="duration">Time (mm:ss or hh:mm:ss)</Label>
              <Input
                id="duration"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                placeholder="24:30"
                className="font-mono-num"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Felt strong on the second half."
                rows={2}
              />
            </div>
            <Button type="submit" className="w-full" disabled={logging}>
              {logging ? "Logging…" : "Log run"}
            </Button>
          </form>
        </aside>
      </div>
    </AppShell>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        highlight ? "border-primary/40 bg-primary/5" : "border-border bg-card"
      }`}
    >
      <p className="eyebrow text-muted-foreground">{label}</p>
      <p
        className={`font-mono-num mt-1 text-2xl font-bold tabular-nums ${
          highlight ? "text-primary" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}
