import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { formatDistance, formatDuration, formatPace } from "@/lib/format";
import { ArrowLeft, Copy, LogOut, Trophy, Users, Trash2 } from "lucide-react";
import { toast } from "sonner";

type Group = {
  id: string;
  name: string;
  description: string | null;
  invite_code: string;
  is_public: boolean;
  created_by: string;
};
type Member = { user_id: string; role: string; display_name: string };
type Run = { user_id: string; distance_meters: number; duration_seconds: number };

export const Route = createFileRoute("/groups/$groupId")({
  head: () => ({
    meta: [{ title: "Club — Catch Up" }],
  }),
  component: GroupDetailPage,
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    return (
      <AppShell>
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-6">
          <p className="font-display text-xl font-bold">Couldn't load club</p>
          <p className="mt-1 text-sm text-muted-foreground">{error.message}</p>
          <Button
            className="mt-3"
            onClick={() => {
              router.invalidate();
              reset();
            }}
          >
            Retry
          </Button>
        </div>
      </AppShell>
    );
  },
  notFoundComponent: () => (
    <AppShell>
      <div className="rounded-xl border border-border bg-surface/30 p-6 text-center">
        <p className="font-display text-xl font-bold">Club not found</p>
        <Link to="/groups" className="mt-2 inline-block text-sm text-primary underline">
          Back to clubs
        </Link>
      </div>
    </AppShell>
  ),
});

function GroupDetailPage() {
  const { groupId } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!user) return;
    setLoading(true);
    const { data: g } = await supabase
      .from("groups")
      .select("id, name, description, invite_code, is_public, created_by")
      .eq("id", groupId)
      .maybeSingle();

    if (!g) {
      setGroup(null);
      setLoading(false);
      return;
    }
    setGroup(g as Group);

    const { data: mems } = await supabase
      .from("group_members")
      .select("user_id, role")
      .eq("group_id", groupId);

    const memberRows = (mems ?? []) as Array<{ user_id: string; role: string }>;
    const userIds = memberRows.map((m) => m.user_id);

    const { data: profs } = userIds.length
      ? await supabase.from("profiles").select("user_id, display_name").in("user_id", userIds)
      : { data: [] };
    const profMap: Record<string, string> = {};
    ((profs as Array<{ user_id: string; display_name: string }> | null) ?? []).forEach(
      (p) => (profMap[p.user_id] = p.display_name),
    );
    setMembers(
      memberRows.map((m) => ({
        ...m,
        display_name: profMap[m.user_id] ?? "Runner",
      })),
    );

    const { data: runRows } = userIds.length
      ? await supabase
          .from("runs")
          .select("user_id, distance_meters, duration_seconds")
          .in("user_id", userIds)
      : { data: [] };
    setRuns(((runRows as Run[] | null) ?? []));
    setLoading(false);
  }

  useEffect(() => {
    if (user) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, groupId]);

  const isMember = useMemo(
    () => !!user && members.some((m) => m.user_id === user.id),
    [members, user],
  );
  const isOwner = !!user && group?.created_by === user.id;

  // Aggregate per-member stats
  const stats = useMemo(() => {
    const byUser: Record<
      string,
      { user_id: string; display_name: string; distance: number; duration: number; runs: number }
    > = {};
    members.forEach((m) => {
      byUser[m.user_id] = {
        user_id: m.user_id,
        display_name: m.display_name,
        distance: 0,
        duration: 0,
        runs: 0,
      };
    });
    runs.forEach((r) => {
      const row = byUser[r.user_id];
      if (!row) return;
      row.distance += Number(r.distance_meters) || 0;
      row.duration += Number(r.duration_seconds) || 0;
      row.runs += 1;
    });
    return Object.values(byUser);
  }, [members, runs]);

  const distanceBoard = useMemo(
    () => [...stats].sort((a, b) => b.distance - a.distance).filter((s) => s.distance > 0).slice(0, 3),
    [stats],
  );
  const durationBoard = useMemo(
    () => [...stats].sort((a, b) => b.duration - a.duration).filter((s) => s.duration > 0).slice(0, 3),
    [stats],
  );
  const paceBoard = useMemo(
    () =>
      [...stats]
        .filter((s) => s.distance > 0 && s.duration > 0)
        .sort((a, b) => a.duration / a.distance - b.duration / b.distance)
        .slice(0, 3),
    [stats],
  );

  async function handleJoin() {
    if (!user) return;
    const { error } = await supabase
      .from("group_members")
      .insert({ group_id: groupId, user_id: user.id, role: "member" });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Joined club");
    load();
  }

  async function handleLeave() {
    if (!user) return;
    const { error } = await supabase
      .from("group_members")
      .delete()
      .eq("group_id", groupId)
      .eq("user_id", user.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Left the club");
    navigate({ to: "/groups" });
  }

  async function handleDelete() {
    if (!group) return;
    if (!confirm(`Delete "${group.name}"? This can't be undone.`)) return;
    const { error } = await supabase.from("groups").delete().eq("id", group.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Club deleted");
    navigate({ to: "/groups" });
  }

  function copyInvite() {
    if (!group) return;
    navigator.clipboard.writeText(group.invite_code);
    toast.success("Invite code copied");
  }

  if (loading) {
    return (
      <AppShell>
        <div className="font-mono-num text-sm text-muted-foreground">LOADING…</div>
      </AppShell>
    );
  }

  if (!group) {
    return (
      <AppShell>
        <div className="rounded-xl border border-border bg-surface/30 p-6 text-center">
          <p className="font-display text-xl font-bold">Club not found</p>
          <Link to="/groups" className="mt-2 inline-block text-sm text-primary underline">
            Back to clubs
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <Link
        to="/groups"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        All clubs
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow text-primary">
            Run Club {group.is_public ? "· Public" : "· Private"}
          </p>
          <h1 className="font-display text-4xl font-black tracking-tight">{group.name}</h1>
          {group.description && (
            <p className="mt-2 max-w-prose text-sm text-muted-foreground">{group.description}</p>
          )}
          <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="h-3.5 w-3.5" />
            {members.length} {members.length === 1 ? "member" : "members"}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={copyInvite} className="gap-1 font-mono-num">
            <Copy className="h-3.5 w-3.5" />
            {group.invite_code}
          </Button>
          {!isMember && (
            <Button size="sm" onClick={handleJoin}>
              Join club
            </Button>
          )}
          {isMember && !isOwner && (
            <Button size="sm" variant="outline" onClick={handleLeave} className="gap-1">
              <LogOut className="h-3.5 w-3.5" />
              Leave
            </Button>
          )}
          {isOwner && (
            <Button size="sm" variant="destructive" onClick={handleDelete} className="gap-1">
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Button>
          )}
        </div>
      </div>

      <div className="mt-8">
        <Tabs defaultValue="distance">
          <TabsList>
            <TabsTrigger value="distance">Distance</TabsTrigger>
            <TabsTrigger value="pace">Avg Pace</TabsTrigger>
            <TabsTrigger value="time">Time</TabsTrigger>
            <TabsTrigger value="members">Members</TabsTrigger>
          </TabsList>

          <TabsContent value="distance" className="mt-4">
            <Board
              title="Most miles"
              subtitle="Total distance across all runs"
              empty="No runs logged yet."
              rows={distanceBoard.map((s) => ({
                user_id: s.user_id,
                name: s.display_name,
                primary: formatDistance(s.distance),
                secondary: `${s.runs} ${s.runs === 1 ? "run" : "runs"}`,
              }))}
            />
          </TabsContent>

          <TabsContent value="pace" className="mt-4">
            <Board
              title="Fastest avg pace"
              subtitle="Lower is better"
              empty="Need at least one run with distance + time."
              rows={paceBoard.map((s) => ({
                user_id: s.user_id,
                name: s.display_name,
                primary: formatPace(s.distance, s.duration),
                secondary: formatDistance(s.distance),
              }))}
            />
          </TabsContent>

          <TabsContent value="time" className="mt-4">
            <Board
              title="Most time on feet"
              subtitle="Total duration across all runs"
              empty="No runs logged yet."
              rows={durationBoard.map((s) => ({
                user_id: s.user_id,
                name: s.display_name,
                primary: formatDuration(s.duration),
                secondary: `${s.runs} ${s.runs === 1 ? "run" : "runs"}`,
              }))}
            />
          </TabsContent>

          <TabsContent value="members" className="mt-4">
            <div className="space-y-1.5">
              {members.map((m) => (
                <div
                  key={m.user_id}
                  className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2"
                >
                  <span className="font-medium">{m.display_name}</span>
                  {m.role === "owner" && (
                    <span className="font-mono-num text-xs uppercase text-primary">Owner</span>
                  )}
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}

type BoardRow = { user_id: string; name: string; primary: string; secondary: string };

function Board({
  title,
  subtitle,
  rows,
  empty,
}: {
  title: string;
  subtitle: string;
  rows: BoardRow[];
  empty: string;
}) {
  const medals = ["bg-primary text-primary-foreground", "bg-foreground text-background", "bg-muted text-foreground"];
  return (
    <div>
      <div className="mb-3">
        <h3 className="font-display text-2xl font-bold">{title}</h3>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface/30 p-8 text-center">
          <Trophy className="mx-auto h-7 w-7 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">{empty}</p>
        </div>
      ) : (
        <ol className="space-y-2">
          {rows.map((r, i) => (
            <li
              key={r.user_id}
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-4"
            >
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-display text-lg font-black ${medals[i]}`}
              >
                {i + 1}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-display truncate text-lg font-bold leading-tight">
                  {r.name}
                </div>
                <div className="text-xs text-muted-foreground">{r.secondary}</div>
              </div>
              <div className="font-mono-num text-2xl font-bold tabular-nums text-primary">
                {r.primary}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
