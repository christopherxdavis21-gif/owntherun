import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RouteMap } from "@/components/RouteMap";
import { RunSummary } from "@/components/RunSummary";
import { RunComments } from "@/components/RunComments";
import {
  formatClanTag,
  formatDistance,
  formatDuration,
  formatPace,
  formatElevation,
} from "@/lib/format";
import { toast } from "sonner";
import { ArrowLeft, Lock, Globe, Trophy, Trash2, Loader2 } from "lucide-react";

type Coord = [number, number];
type Visibility = "private" | "public" | "leaderboard";
type RunRow = {
  id: string;
  user_id: string;
  route_id: string | null;
  distance_meters: number;
  duration_seconds: number;
  elevation_gain_meters: number;
  notes: string | null;
  ran_at: string;
  visibility: Visibility;
};
type RouteLite = { id: string; name: string; coordinates: Coord[] };
type Profile = { user_id: string; display_name: string; clan_tag: string | null; avatar_url: string | null };

export const Route = createFileRoute("/runs/$runId")({
  head: () => ({
    meta: [
      { title: "Run — Own The Run" },
      { name: "description", content: "Run details, share card, and comments." },
    ],
  }),
  component: RunDetailPage,
});

function RunDetailPage() {
  const { runId } = Route.useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [run, setRun] = useState<RunRow | null>(null);
  const [route, setRoute] = useState<RouteLite | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [notes, setNotes] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("private");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: runData } = await supabase
        .from("runs")
        .select("id, user_id, route_id, distance_meters, duration_seconds, elevation_gain_meters, notes, ran_at, visibility")
        .eq("id", runId)
        .maybeSingle();
      const r = (runData as RunRow | null) ?? null;
      setRun(r);
      if (r) {
        setNotes(r.notes ?? "");
        setVisibility(r.visibility);
        const [{ data: routeData }, { data: profData }] = await Promise.all([
          r.route_id
            ? supabase.from("routes").select("id, name, coordinates").eq("id", r.route_id).maybeSingle()
            : Promise.resolve({ data: null }),
          supabase.from("profiles").select("user_id, display_name, clan_tag, avatar_url").eq("user_id", r.user_id).maybeSingle(),
        ]);
        setRoute(routeData as unknown as RouteLite | null);
        setProfile(profData as Profile | null);
      }
      setLoading(false);
    })();
  }, [runId]);

  const isOwner = !!user && !!run && user.id === run.user_id;
  const isPublic = run?.visibility === "public" || run?.visibility === "leaderboard";

  async function saveEdits() {
    if (!run || !isOwner) return;
    setSaving(true);
    const { error } = await supabase
      .from("runs")
      .update({ notes: notes.trim() || null, visibility })
      .eq("id", run.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    setRun({ ...run, notes: notes.trim() || null, visibility });
    toast.success(
      visibility === "leaderboard"
        ? "Submitted to leaderboard"
        : visibility === "public"
        ? "Shared publicly"
        : "Set to private",
    );
  }

  async function deleteRun() {
    if (!run || !isOwner) return;
    if (!confirm("Delete this run? This can't be undone.")) return;
    const { error } = await supabase.from("runs").delete().eq("id", run.id);
    if (error) return toast.error(error.message);
    toast.success("Run deleted");
    navigate({ to: "/stats" });
  }

  if (loading) {
    return (
      <AppShell>
        <div className="font-mono-num text-sm text-muted-foreground">LOADING…</div>
      </AppShell>
    );
  }

  if (!run) {
    return (
      <AppShell>
        <div className="rounded-2xl border border-border bg-card p-6 text-center">
          <p className="text-sm text-muted-foreground">Run not found.</p>
          <Link to="/stats" className="mt-3 inline-block text-primary hover:underline">Back to stats</Link>
        </div>
      </AppShell>
    );
  }

  const coords: Coord[] = route?.coordinates ?? [];
  const dateStr = new Date(run.ran_at).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <AppShell>
      <Link to="/stats" className="font-mono-num inline-flex items-center gap-1 text-xs uppercase tracking-wider text-muted-foreground hover:text-primary">
        <ArrowLeft className="h-3 w-3" /> Back
      </Link>

      <div className="mt-3 flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow text-primary">{dateStr}</p>
          <h1 className="font-display text-3xl font-black tracking-tight">
            {route?.name ?? "Free run"}
          </h1>
          {profile && (
            <p className="mt-1 text-sm text-muted-foreground">
              {profile.clan_tag && <span className="font-mono-num text-primary">{formatClanTag(profile.clan_tag)}</span>}
              {profile.display_name}
            </p>
          )}
        </div>
        <span className="font-mono-num inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-[10px] uppercase tracking-wider">
          {run.visibility === "leaderboard" ? <Trophy className="h-3 w-3 text-primary" /> :
           run.visibility === "public" ? <Globe className="h-3 w-3 text-primary" /> :
           <Lock className="h-3 w-3" />}
          {run.visibility}
        </span>
      </div>

      {/* Stat row */}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Distance" value={formatDistance(run.distance_meters)} />
        <Stat label="Time" value={formatDuration(run.duration_seconds)} />
        <Stat label="Pace" value={formatPace(run.distance_meters, run.duration_seconds)} />
        <Stat label="Elevation" value={formatElevation(run.elevation_gain_meters)} />
      </div>

      {/* Map */}
      {coords.length > 1 && (
        <div className="mt-4 h-64 overflow-hidden rounded-2xl border border-border">
          <RouteMap coordinates={coords} interactive={false} />
        </div>
      )}

      {/* Owner editing */}
      {isOwner && (
        <section className="mt-4 space-y-3 rounded-2xl border border-border bg-card p-4">
          <h2 className="font-display text-lg font-bold">Post this run</h2>
          <div className="space-y-1.5">
            <Label htmlFor="run-vis">Visibility</Label>
            <Select value={visibility} onValueChange={(v) => setVisibility(v as Visibility)}>
              <SelectTrigger id="run-vis"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="private">Private — only you</SelectItem>
                <SelectItem value="public">Public — anyone can see &amp; comment</SelectItem>
                <SelectItem value="leaderboard">Leaderboard — compete on this route</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="run-notes">Description (optional)</Label>
            <Textarea
              id="run-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value.slice(0, 280))}
              placeholder="How did this run feel? Drop a brief caption…"
              rows={3}
              maxLength={280}
            />
            <p className="font-mono-num text-[10px] text-muted-foreground">{notes.length}/280</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={saveEdits} disabled={saving} className="flex-1">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
            <Button variant="ghost" onClick={deleteRun} className="text-destructive hover:text-destructive">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </section>
      )}

      {/* Read-only description for non-owners */}
      {!isOwner && run.notes && (
        <p className="mt-4 rounded-2xl border border-border bg-surface/30 p-4 text-sm">
          "{run.notes}"
        </p>
      )}

      {/* Share carousel — anyone with view access can re-share */}
      {coords.length > 1 && (
        <div className="mt-4">
          <RunSummary
            coords={coords}
            distance={Number(run.distance_meters)}
            elapsed={Number(run.duration_seconds)}
            elevationGain={Number(run.elevation_gain_meters)}
            title={route?.name}
          />
        </div>
      )}

      {/* Comments (only on public/leaderboard runs) */}
      {isPublic && (
        <div className="mt-4">
          <RunComments runId={run.id} canComment={true} />
        </div>
      )}
      {!isPublic && isOwner && (
        <p className="mt-4 rounded-2xl border border-dashed border-border bg-surface/30 p-4 text-center text-xs text-muted-foreground">
          Switch this run to Public or Leaderboard to open comments.
        </p>
      )}
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 text-center">
      <p className="eyebrow text-muted-foreground">{label}</p>
      <p className="font-mono-num mt-1 text-lg font-bold text-primary tabular-nums">{value}</p>
    </div>
  );
}
