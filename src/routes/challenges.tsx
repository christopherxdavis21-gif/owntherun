import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ChallengeCard } from "@/components/trophies/ChallengeCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/challenges")({
  head: () => ({ meta: [{ title: "Challenges — Catch Up" }] }),
  component: ChallengesPage,
});

type Metric =
  | "distance_meters"
  | "elevation_meters"
  | "runs_count"
  | "streak_days"
  | "duration_seconds";

type Challenge = {
  id: string;
  title: string;
  description: string | null;
  metric: Metric;
  target_value: number;
  starts_at: string;
  ends_at: string;
  scope: "system" | "group" | "personal";
};

type Progress = {
  challenge_id: string;
  progress_value: number;
  completed_at: string | null;
};

function ChallengesPage() {
  const { user } = useAuth();
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [progress, setProgress] = useState<Progress[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  // create form
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [metric, setMetric] = useState<Metric>("distance_meters");
  const [targetMiles, setTargetMiles] = useState("10");
  const [days, setDays] = useState("7");

  async function refresh() {
    if (!user) return;
    const [c, p] = await Promise.all([
      supabase
        .from("challenges")
        .select("id, title, description, metric, target_value, starts_at, ends_at, scope")
        .gt("ends_at", new Date().toISOString())
        .order("ends_at"),
      supabase
        .from("user_challenge_progress")
        .select("challenge_id, progress_value, completed_at")
        .eq("user_id", user.id),
    ]);
    setChallenges((c.data as Challenge[]) ?? []);
    setProgress((p.data as Progress[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    if (user) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function createPersonal() {
    if (!user) return;
    const t = title.trim();
    if (!t) return toast.error("Title required");
    const dayCount = Math.max(1, parseInt(days) || 7);
    const target = parseFloat(targetMiles) || 0;
    if (target <= 0) return toast.error("Target must be > 0");

    let targetValue = target;
    if (metric === "distance_meters" || metric === "elevation_meters") {
      targetValue = target * 1609.344; // input is miles for distance, treat same for elev shorthand
    } else if (metric === "duration_seconds") {
      targetValue = target * 60;
    }

    const ends = new Date(Date.now() + dayCount * 86400000).toISOString();
    const { data, error } = await supabase
      .from("challenges")
      .insert({
        scope: "personal",
        title: t,
        description: desc.trim() || null,
        metric,
        target_value: targetValue,
        ends_at: ends,
        created_by: user.id,
      })
      .select("id")
      .single();
    if (error) return toast.error(error.message);
    // auto-join
    await supabase
      .from("user_challenge_progress")
      .insert({ user_id: user.id, challenge_id: (data as { id: string }).id });
    toast.success("Challenge created");
    setOpen(false);
    setTitle("");
    setDesc("");
    setTargetMiles("10");
    setDays("7");
    refresh();
  }

  const progMap = new Map(progress.map((p) => [p.challenge_id, p]));
  const system = challenges.filter((c) => c.scope === "system");
  const personal = challenges.filter((c) => c.scope === "personal");
  const group = challenges.filter((c) => c.scope === "group");

  return (
    <AppShell>
      <div className="mb-6 flex items-end justify-between gap-3">
        <div>
          <p className="eyebrow text-primary">Challenges</p>
          <h1 className="font-display text-4xl font-black tracking-tight">Set a goal</h1>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1">
              <Plus className="h-4 w-4" /> New
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New personal challenge</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="ct">Title</Label>
                <Input id="ct" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cd">Description</Label>
                <Textarea id="cd" value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={300} />
              </div>
              <div className="space-y-1.5">
                <Label>Metric</Label>
                <Select value={metric} onValueChange={(v) => setMetric(v as Metric)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="distance_meters">Distance (miles)</SelectItem>
                    <SelectItem value="elevation_meters">Elevation (×1609 ft proxy)</SelectItem>
                    <SelectItem value="runs_count">Runs (count)</SelectItem>
                    <SelectItem value="duration_seconds">Time (minutes)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="tv">Target</Label>
                  <Input id="tv" type="number" value={targetMiles} onChange={(e) => setTargetMiles(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="dy">Days</Label>
                  <Input id="dy" type="number" value={days} onChange={(e) => setDays(e.target.value)} />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={createPersonal}>Create & join</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="font-mono-num text-sm text-muted-foreground">LOADING…</div>
      ) : (
        <div className="space-y-8">
          {[
            { label: "System challenges", list: system },
            { label: "Group challenges", list: group },
            { label: "Personal", list: personal },
          ].map(
            ({ label, list }) =>
              list.length > 0 && (
                <section key={label}>
                  <h2 className="font-display mb-3 text-2xl font-bold">{label}</h2>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {list.map((c) => {
                      const p = progMap.get(c.id);
                      return (
                        <ChallengeCard
                          key={c.id}
                          title={c.title}
                          description={c.description}
                          metric={c.metric}
                          target={Number(c.target_value)}
                          progress={Number(p?.progress_value ?? 0)}
                          endsAt={c.ends_at}
                          joined={!!p}
                          completed={!!p?.completed_at}
                          scopeBadge={c.scope}
                          onJoin={async () => {
                            if (!user) return;
                            await supabase
                              .from("user_challenge_progress")
                              .insert({ user_id: user.id, challenge_id: c.id });
                            refresh();
                          }}
                          onLeave={async () => {
                            if (!user) return;
                            await supabase
                              .from("user_challenge_progress")
                              .delete()
                              .eq("user_id", user.id)
                              .eq("challenge_id", c.id);
                            refresh();
                          }}
                        />
                      );
                    })}
                  </div>
                </section>
              ),
          )}
          {challenges.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border bg-surface/30 p-8 text-center">
              <p className="font-display text-xl font-bold">No active challenges</p>
              <p className="mt-1 text-sm text-muted-foreground">Create your own to get started.</p>
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}
