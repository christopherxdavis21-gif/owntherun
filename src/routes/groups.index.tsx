import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Users, Plus, ArrowRight, KeyRound } from "lucide-react";
import { toast } from "sonner";

type GroupRow = {
  id: string;
  name: string;
  description: string | null;
  invite_code: string;
  is_public: boolean;
  created_by: string;
  image_url: string | null;
  clan_tag: string | null;
  member_count: number;
  is_member: boolean;
};

export const Route = createFileRoute("/groups/")({
  head: () => ({
    meta: [
      { title: "Run Clubs — Catch Up" },
      { name: "description", content: "Create or join run clubs and compete on group leaderboards." },
    ],
  }),
  component: GroupsIndexPage,
});

function GroupsIndexPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [inviteCode, setInviteCode] = useState("");

  async function load() {
    if (!user) return;
    setLoading(true);
    const { data: groupsData } = await supabase
      .from("groups")
      .select("id, name, description, invite_code, is_public, created_by, image_url, clan_tag")
      .order("created_at", { ascending: false });

    const list = (groupsData ?? []) as Array<Omit<GroupRow, "member_count" | "is_member">>;
    if (list.length === 0) {
      setGroups([]);
      setLoading(false);
      return;
    }

    const ids = list.map((g) => g.id);
    const { data: members } = await supabase
      .from("group_members")
      .select("group_id, user_id")
      .in("group_id", ids);

    const memberRows = (members ?? []) as Array<{ group_id: string; user_id: string }>;
    const counts: Record<string, number> = {};
    const mine = new Set<string>();
    memberRows.forEach((m) => {
      counts[m.group_id] = (counts[m.group_id] ?? 0) + 1;
      if (m.user_id === user.id) mine.add(m.group_id);
    });

    setGroups(
      list.map((g) => ({
        ...g,
        member_count: counts[g.id] ?? 0,
        is_member: mine.has(g.id),
      })),
    );
    setLoading(false);
  }

  useEffect(() => {
    if (user) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function handleCreate() {
    if (!user) return;
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSubmitting(true);
    const { data, error } = await supabase
      .from("groups")
      .insert({
        name: name.trim(),
        description: description.trim() || null,
        is_public: isPublic,
        created_by: user.id,
      })
      .select("id")
      .single();
    setSubmitting(false);
    if (error || !data) {
      toast.error(error?.message ?? "Failed to create group");
      return;
    }
    toast.success("Club created");
    setCreateOpen(false);
    setName("");
    setDescription("");
    setIsPublic(true);
    navigate({ to: "/groups/$groupId", params: { groupId: data.id } });
  }

  async function handleJoinByCode() {
    if (!user) return;
    const code = inviteCode.trim().toLowerCase();
    if (!code) {
      toast.error("Enter an invite code");
      return;
    }
    setSubmitting(true);
    const { data: group, error: lookupError } = await supabase
      .from("groups")
      .select("id, name")
      .eq("invite_code", code)
      .maybeSingle();

    if (lookupError || !group) {
      setSubmitting(false);
      toast.error("No club found with that code");
      return;
    }
    const { error: joinError } = await supabase
      .from("group_members")
      .insert({ group_id: group.id, user_id: user.id, role: "member" });
    setSubmitting(false);
    if (joinError && !joinError.message.includes("duplicate")) {
      toast.error(joinError.message);
      return;
    }
    toast.success(`Joined ${group.name}`);
    setJoinOpen(false);
    setInviteCode("");
    navigate({ to: "/groups/$groupId", params: { groupId: group.id } });
  }

  async function handleQuickJoin(groupId: string) {
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

  const myGroups = groups.filter((g) => g.is_member);
  const discover = groups.filter((g) => !g.is_member && g.is_public);

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow text-primary">Run Clubs</p>
          <h1 className="font-display text-4xl font-black tracking-tight">Find your pack.</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Form crews, compare miles, chase the top three.
          </p>
        </div>
        <div className="flex gap-2">
          <Dialog open={joinOpen} onOpenChange={setJoinOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1">
                <KeyRound className="h-4 w-4" />
                Join by code
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="font-display text-2xl">Enter invite code</DialogTitle>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="code">Invite code</Label>
                <Input
                  id="code"
                  placeholder="abc12345"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  className="font-mono-num"
                />
              </div>
              <DialogFooter>
                <Button onClick={handleJoinByCode} disabled={submitting}>
                  Join club
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1">
                <Plus className="h-4 w-4" />
                New club
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="font-display text-2xl">Start a run club</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Club name</Label>
                  <Input
                    id="name"
                    placeholder="Sunrise Striders"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="desc">Description</Label>
                  <Textarea
                    id="desc"
                    placeholder="Easy long runs every Sunday at 7am."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <Label htmlFor="public" className="font-medium">
                      Public club
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Anyone can find and join. Off = invite code only.
                    </p>
                  </div>
                  <Switch id="public" checked={isPublic} onCheckedChange={setIsPublic} />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={handleCreate} disabled={submitting}>
                  Create club
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {loading ? (
        <div className="font-mono-num text-sm text-muted-foreground">LOADING…</div>
      ) : (
        <div className="space-y-10">
          <section>
            <h2 className="font-display mb-3 text-xl font-bold">Your clubs</h2>
            {myGroups.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-surface/30 p-8 text-center">
                <Users className="mx-auto h-7 w-7 text-muted-foreground" />
                <p className="font-display mt-3 text-lg font-bold">No clubs yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Create one above or join a public club below.
                </p>
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {myGroups.map((g) => (
                  <GroupCard key={g.id} group={g} />
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="font-display mb-3 text-xl font-bold">Discover</h2>
            {discover.length === 0 ? (
              <p className="text-sm text-muted-foreground">No public clubs to join right now.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {discover.map((g) => (
                  <GroupCard key={g.id} group={g} onJoin={() => handleQuickJoin(g.id)} />
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </AppShell>
  );
}

function GroupCard({ group, onJoin }: { group: GroupRow; onJoin?: () => void }) {
  return (
    <div className="group flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/40">
      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-primary/10">
        {group.image_url ? (
          <img src={group.image_url} alt={group.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-primary">
            <Users className="h-6 w-6" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-display truncate text-base font-bold leading-tight">
          {group.clan_tag && <span className="text-primary">[{group.clan_tag}] </span>}
          {group.name}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {group.member_count} {group.member_count === 1 ? "member" : "members"}
          {!group.is_public && " · private"}
        </div>
      </div>
      {onJoin ? (
        <Button size="sm" variant="outline" onClick={onJoin}>
          Join
        </Button>
      ) : (
        <Link to="/groups/$groupId" params={{ groupId: group.id }}>
          <Button size="sm" variant="ghost" className="gap-1">
            Open
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </Link>
      )}
    </div>
  );
}
