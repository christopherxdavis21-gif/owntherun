import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { RouteMap } from "@/components/RouteMap";
import { RunTracker } from "@/components/RunTracker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import {
  formatClanTag,
  formatDistance,
  formatDuration,
  formatPace,
  formatElevation,
} from "@/lib/format";
import { toast } from "sonner";
import {
  Trash2,
  Trophy,
  Lock,
  Globe,
  ArrowLeft,
  Crown,
  Bookmark,
  Share2,
  MessageCircle,
  Send,
  Play,
} from "lucide-react";

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
  elevation_gain_meters: number;
  notes: string | null;
  ran_at: string;
  visibility: "private" | "public" | "leaderboard";
};
type Profile = { user_id: string; display_name: string; clan_tag: string | null };
type CommentRow = {
  id: string;
  run_id: string;
  user_id: string;
  body: string;
  created_at: string;
};

type Visibility = "private" | "public" | "leaderboard";

export const Route = createFileRoute("/routes/$routeId")({
  head: () => ({
    meta: [
      { title: "Route — Own The Run" },
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
  const [profiles, setProfiles] = useState<Record<string, { name: string; tag: string | null }>>({});
  const [userId, setUserId] = useState<string | null>(null);
  const [isVerified, setIsVerified] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  // Run-log form
  const [duration, setDuration] = useState("");
  const [notes, setNotes] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("private");
  const [logging, setLogging] = useState(false);

  // Comments view
  const [openCommentsFor, setOpenCommentsFor] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, CommentRow[]>>({});
  const [commentDraft, setCommentDraft] = useState<Record<string, string>>({});

  const reload = async () => {
    setLoading(true);
    const [{ data: r }, { data: u }] = await Promise.all([
      supabase.from("routes").select("*").eq("id", routeId).maybeSingle(),
      supabase.auth.getUser(),
    ]);
    const uid = u.user?.id ?? null;
    setUserId(uid);
    setRoute((r as unknown as RouteRow) ?? null);

    if (uid) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("is_verified")
        .eq("user_id", uid)
        .maybeSingle();
      setIsVerified(!!(prof as { is_verified?: boolean } | null)?.is_verified);
    }

    if (r) {
      // Only leaderboard runs appear on the leaderboard.
      const { data: runData } = await supabase
        .from("runs")
        .select("id, user_id, duration_seconds, distance_meters, elevation_gain_meters, notes, ran_at, visibility")
        .eq("route_id", routeId)
        .eq("visibility", "leaderboard")
        .order("duration_seconds", { ascending: true });
      const runRows = (runData as RunRow[]) ?? [];
      setRuns(runRows);

      const userIds = Array.from(new Set(runRows.map((x) => x.user_id)));
      if (userIds.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("user_id, display_name, clan_tag")
          .in("user_id", userIds);
        const map: Record<string, { name: string; tag: string | null }> = {};
        (profs as Profile[] | null)?.forEach(
          (p) => (map[p.user_id] = { name: p.display_name, tag: p.clan_tag }),
        );
        setProfiles(map);
      }

      if (uid) {
        const { data: savedRow } = await supabase
          .from("saved_routes")
          .select("id")
          .eq("user_id", uid)
          .eq("route_id", routeId)
          .maybeSingle();
        setSaved(!!savedRow);
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
    if (visibility === "leaderboard" && !isVerified) {
      return toast.error("Verify your account in your profile to submit to leaderboards");
    }
    setLogging(true);
    try {
      // Compute elevation for public/leaderboard submissions
      let elevation = 0;
      if (visibility !== "private" && route.coordinates?.length > 1) {
        try {
          const res = await computeElevationGain({ data: { coordinates: route.coordinates } });
          elevation = res.elevation_gain_meters;
        } catch {
          // Non-fatal — keep 0
        }
      }
      const { error } = await supabase.from("runs").insert({
        user_id: userId,
        route_id: route.id,
        duration_seconds: seconds,
        distance_meters: route.distance_meters,
        elevation_gain_meters: elevation,
        notes: notes.trim() || null,
        visibility,
      });
      if (error) throw error;
      toast.success(
        visibility === "leaderboard"
          ? "Run submitted. Climb the board."
          : visibility === "public"
          ? "Run shared publicly."
          : "Run saved privately.",
      );
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

  const toggleSave = async () => {
    if (!route || !userId) return;
    if (saved) {
      const { error } = await supabase
        .from("saved_routes")
        .delete()
        .eq("user_id", userId)
        .eq("route_id", route.id);
      if (error) return toast.error(error.message);
      setSaved(false);
      toast.success("Removed from saved");
    } else {
      const { error } = await supabase
        .from("saved_routes")
        .insert({ user_id: userId, route_id: route.id });
      if (error) return toast.error(error.message);
      setSaved(true);
      toast.success("Saved to your library");
    }
  };

  const shareRoute = async () => {
    if (!route) return;
    const url = `${window.location.origin}/routes/${route.id}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: route.name, text: `Run ${route.name} on Own The Run`, url });
        return;
      } catch {
        // fall through
      }
    }
    await navigator.clipboard.writeText(url);
    toast.success("Link copied");
  };

  async function loadComments(runId: string) {
    if (openCommentsFor === runId) {
      setOpenCommentsFor(null);
      return;
    }
    setOpenCommentsFor(runId);
    if (comments[runId]) return;
    const { data } = await supabase
      .from("run_comments")
      .select("id, run_id, user_id, body, created_at")
      .eq("run_id", runId)
      .order("created_at", { ascending: true });
    const list = (data as CommentRow[] | null) ?? [];
    setComments((p) => ({ ...p, [runId]: list }));

    // Pull any missing profiles
    const need = list.map((c) => c.user_id).filter((u) => !profiles[u]);
    if (need.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id, display_name, clan_tag")
        .in("user_id", need);
      const map: Record<string, { name: string; tag: string | null }> = { ...profiles };
      (profs as Profile[] | null)?.forEach(
        (p) => (map[p.user_id] = { name: p.display_name, tag: p.clan_tag }),
      );
      setProfiles(map);
    }
  }

  async function postComment(runId: string) {
    if (!userId) return;
    const body = (commentDraft[runId] ?? "").trim();
    if (!body) return;
    const { data, error } = await supabase
      .from("run_comments")
      .insert({ run_id: runId, user_id: userId, body })
      .select("*")
      .single();
    if (error) return toast.error(error.message);
    setComments((p) => ({ ...p, [runId]: [...(p[runId] ?? []), data as CommentRow] }));
    setCommentDraft((p) => ({ ...p, [runId]: "" }));
  }

  async function deleteComment(runId: string, commentId: string) {
    const { error } = await supabase.from("run_comments").delete().eq("id", commentId);
    if (error) return toast.error(error.message);
    setComments((p) => ({
      ...p,
      [runId]: (p[runId] ?? []).filter((c) => c.id !== commentId),
    }));
  }

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
        <div className="flex gap-2">
          {!isOwner && route.is_public && (
            <Button variant={saved ? "default" : "outline"} size="sm" onClick={toggleSave} className="gap-1">
              <Bookmark className={`h-3.5 w-3.5 ${saved ? "fill-current" : ""}`} />
              {saved ? "Saved" : "Save"}
            </Button>
          )}
          {route.is_public && (
            <Button variant="outline" size="sm" onClick={shareRoute} className="gap-1">
              <Share2 className="h-3.5 w-3.5" />
              Share
            </Button>
          )}
        </div>
      </div>

      <div className="mb-6 grid grid-cols-3 gap-3">
        <Stat label="Distance" value={formatDistance(route.distance_meters)} />
        <Stat label="Best time" value={bestTime ? formatDuration(bestTime) : "—"} highlight />
        <Stat label="Submitted runs" value={String(runs.length)} />
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
                No verified submissions yet. Submit a run to claim the crown.
              </div>
            ) : (
              <ol className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
                {runs.map((r, i) => (
                  <li key={r.id} className={i === 0 ? "bg-primary/5" : ""}>
                    <div className="flex items-center justify-between gap-3 px-4 py-3">
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
                            {profiles[r.user_id]?.tag && (
                              <span className="font-mono-num text-primary">
                                {formatClanTag(profiles[r.user_id]?.tag)}
                              </span>
                            )}
                            {profiles[r.user_id]?.name ?? "Runner"}
                            {r.user_id === userId && (
                              <span className="ml-1.5 text-xs text-primary">you</span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {formatPace(r.distance_meters, r.duration_seconds)} ·{" "}
                            {formatElevation(r.elevation_gain_meters)} ·{" "}
                            {new Date(r.ran_at).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="font-mono-num text-lg font-bold tabular-nums">
                          {formatDuration(r.duration_seconds)}
                        </div>
                        <button
                          onClick={() => loadComments(r.id)}
                          className="text-muted-foreground hover:text-primary"
                          aria-label="Comments"
                        >
                          <MessageCircle className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {openCommentsFor === r.id && (
                      <div className="border-t border-border bg-surface/20 px-4 py-3">
                        <div className="space-y-2">
                          {(comments[r.id] ?? []).length === 0 && (
                            <p className="text-xs text-muted-foreground">No comments yet.</p>
                          )}
                          {(comments[r.id] ?? []).map((c) => (
                            <div key={c.id} className="rounded-md bg-card px-3 py-2 text-sm">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-xs font-bold text-primary">
                                  {profiles[c.user_id]?.tag &&
                                    formatClanTag(profiles[c.user_id]?.tag)}
                                  <span className="text-foreground">
                                    {profiles[c.user_id]?.name ?? "Runner"}
                                  </span>
                                </p>
                                {c.user_id === userId && (
                                  <button
                                    onClick={() => deleteComment(r.id, c.id)}
                                    className="text-xs text-muted-foreground hover:text-destructive"
                                  >
                                    delete
                                  </button>
                                )}
                              </div>
                              <p className="mt-1 text-foreground">{c.body}</p>
                            </div>
                          ))}
                          <div className="flex gap-2 pt-1">
                            <Input
                              placeholder="Be respectful…"
                              value={commentDraft[r.id] ?? ""}
                              onChange={(e) =>
                                setCommentDraft((p) => ({ ...p, [r.id]: e.target.value }))
                              }
                              maxLength={500}
                            />
                            <Button size="sm" onClick={() => postComment(r.id)}>
                              <Send className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
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
              Choose how this run is shared.
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
              <Label>Visibility</Label>
              <Select value={visibility} onValueChange={(v) => setVisibility(v as Visibility)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">Private — just for me</SelectItem>
                  <SelectItem value="public">Public — share on profile</SelectItem>
                  <SelectItem value="leaderboard" disabled={!isVerified}>
                    Submit to leaderboard {!isVerified && "(verify first)"}
                  </SelectItem>
                </SelectContent>
              </Select>
              {visibility === "leaderboard" && (
                <p className="flex items-center gap-1 text-xs text-primary">
                  <ShieldCheck className="h-3 w-3" /> Verified submission
                </p>
              )}
              {!isVerified && (
                <Link to="/profile" className="text-xs text-primary hover:underline">
                  Verify your account →
                </Link>
              )}
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
              {logging ? "Saving…" : "Log run"}
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
