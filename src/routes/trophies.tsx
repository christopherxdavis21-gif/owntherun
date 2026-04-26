import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { TrophyCard } from "@/components/trophies/TrophyCard";
import { ChallengeCard } from "@/components/trophies/ChallengeCard";
import type { AchievementTier } from "@/lib/trophy";
import { Trophy as TrophyIcon, Medal as MedalIcon } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export const Route = createFileRoute("/trophies")({
  head: () => ({ meta: [{ title: "Trophies — Catch Up" }] }),
  component: TrophiesPage,
});

type Definition = {
  code: string;
  title: string;
  description: string;
  tier: AchievementTier;
  icon: string;
  category: string;
  sort_order: number;
};
type Earned = { achievement_code: string; earned_at: string };
type Medal = {
  id: string;
  category: string;
  rank: number;
  period_type: string;
  period_start: string;
  scope: string;
};
type Challenge = {
  id: string;
  title: string;
  description: string | null;
  metric:
    | "distance_meters"
    | "elevation_meters"
    | "runs_count"
    | "streak_days"
    | "duration_seconds";
  target_value: number;
  ends_at: string;
  scope: "system" | "group" | "personal";
};
type Progress = {
  challenge_id: string;
  progress_value: number;
  completed_at: string | null;
};

function TrophiesPage() {
  const { user } = useAuth();
  const [defs, setDefs] = useState<Definition[]>([]);
  const [earned, setEarned] = useState<Earned[]>([]);
  const [medals, setMedals] = useState<Medal[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [progress, setProgress] = useState<Progress[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [d, e, m, c, p] = await Promise.all([
        supabase.from("achievement_definitions").select("*").order("sort_order"),
        supabase.from("user_achievements").select("achievement_code, earned_at").eq("user_id", user.id),
        supabase.from("medals").select("id, category, rank, period_type, period_start, scope").eq("user_id", user.id),
        supabase.from("challenges").select("id, title, description, metric, target_value, ends_at, scope").gt("ends_at", new Date().toISOString()),
        supabase.from("user_challenge_progress").select("challenge_id, progress_value, completed_at").eq("user_id", user.id),
      ]);
      setDefs((d.data as Definition[]) ?? []);
      setEarned((e.data as Earned[]) ?? []);
      setMedals((m.data as Medal[]) ?? []);
      setChallenges((c.data as Challenge[]) ?? []);
      setProgress((p.data as Progress[]) ?? []);
      setLoading(false);
    })();
  }, [user]);

  const earnedMap = new Map(earned.map((e) => [e.achievement_code, e.earned_at]));
  const earnedCount = earned.length;
  const totalCount = defs.length;
  const progMap = new Map(progress.map((p) => [p.challenge_id, p]));

  const RANK_ICON = ["🥇", "🥈", "🥉"];

  return (
    <AppShell>
      <div className="mb-6">
        <p className="eyebrow text-primary">Trophy case</p>
        <h1 className="font-display text-4xl font-black tracking-tight">Your noteriety</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Trophies, medals & challenges. Earn 'em.{" "}
          <Link to="/stats" className="text-primary hover:underline">View stats →</Link>
        </p>
      </div>

      {loading ? (
        <div className="font-mono-num text-sm text-muted-foreground">LOADING…</div>
      ) : (
        <Tabs defaultValue="trophies" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="trophies">
              Trophies <span className="font-mono-num ml-1.5 text-[10px] text-muted-foreground">{earnedCount}/{totalCount}</span>
            </TabsTrigger>
            <TabsTrigger value="medals">
              Medals <span className="font-mono-num ml-1.5 text-[10px] text-muted-foreground">{medals.length}</span>
            </TabsTrigger>
            <TabsTrigger value="challenges">
              Challenges <span className="font-mono-num ml-1.5 text-[10px] text-muted-foreground">{challenges.length}</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="trophies" className="mt-6">
            <div className="grid gap-3 sm:grid-cols-2">
              {defs.map((d) => (
                <TrophyCard
                  key={d.code}
                  title={d.title}
                  description={d.description}
                  tier={d.tier}
                  icon={d.icon}
                  earned={earnedMap.has(d.code)}
                  earnedAt={earnedMap.get(d.code)}
                />
              ))}
            </div>
          </TabsContent>

          <TabsContent value="medals" className="mt-6">
            {medals.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-surface/30 p-8 text-center">
                <MedalIcon className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="font-display mt-3 text-xl font-bold">No medals yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Finish top 3 on a leaderboard to earn one.
                </p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {medals.map((m) => (
                  <div key={m.id} className="rounded-2xl border border-border bg-card p-4 flex items-center gap-3">
                    <div className="text-3xl">{RANK_ICON[m.rank - 1]}</div>
                    <div>
                      <p className="font-display text-base font-bold capitalize">{m.category}</p>
                      <p className="font-mono-num text-[10px] uppercase text-muted-foreground">
                        {m.scope} · {m.period_type} of {new Date(m.period_start).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="challenges" className="mt-6">
            {challenges.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-surface/30 p-8 text-center">
                <TrophyIcon className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="font-display mt-3 text-xl font-bold">No active challenges</p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {challenges.map((c) => {
                  const p = progMap.get(c.id);
                  const joined = !!p;
                  const completed = !!p?.completed_at;
                  return (
                    <ChallengeCard
                      key={c.id}
                      title={c.title}
                      description={c.description}
                      metric={c.metric}
                      target={Number(c.target_value)}
                      progress={Number(p?.progress_value ?? 0)}
                      endsAt={c.ends_at}
                      joined={joined}
                      completed={completed}
                      scopeBadge={c.scope}
                      onJoin={async () => {
                        if (!user) return;
                        await supabase
                          .from("user_challenge_progress")
                          .insert({ user_id: user.id, challenge_id: c.id });
                        const { data } = await supabase
                          .from("user_challenge_progress")
                          .select("challenge_id, progress_value, completed_at")
                          .eq("user_id", user.id);
                        setProgress((data as Progress[]) ?? []);
                      }}
                      onLeave={async () => {
                        if (!user) return;
                        await supabase
                          .from("user_challenge_progress")
                          .delete()
                          .eq("user_id", user.id)
                          .eq("challenge_id", c.id);
                        setProgress((prev) => prev.filter((x) => x.challenge_id !== c.id));
                      }}
                    />
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}
    </AppShell>
  );
}
