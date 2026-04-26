import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { formatClanTag } from "@/lib/format";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [{ title: "Profile — Catch Up" }],
  }),
  component: ProfilePage,
});

type GroupOption = { id: string; name: string; clan_tag: string | null };

function ProfilePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState("");
  const [clanTag, setClanTag] = useState("");
  const [clanGroupId, setClanGroupId] = useState<string>("");
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data: profile }, { data: members }] = await Promise.all([
        supabase
          .from("profiles")
          .select("display_name, clan_tag, clan_group_id")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase.from("group_members").select("group_id").eq("user_id", user.id),
      ]);

      const p = profile as { display_name: string; clan_tag: string | null; clan_group_id: string | null } | null;
      if (p) {
        setDisplayName(p.display_name ?? "");
        setClanTag(p.clan_tag ?? "");
        setClanGroupId(p.clan_group_id ?? "");
      }

      const ids = (members ?? []).map((m: { group_id: string }) => m.group_id);
      if (ids.length) {
        const { data: gs } = await supabase
          .from("groups")
          .select("id, name, clan_tag")
          .in("id", ids);
        setGroups((gs as GroupOption[] | null) ?? []);
      }
      setLoading(false);
    })();
  }, [user]);

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    const cleanTag = clanTag.trim().toUpperCase() || null;
    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: displayName.trim(),
        clan_tag: cleanTag,
        clan_group_id: clanGroupId || null,
      })
      .eq("user_id", user.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Profile saved");
    navigate({ to: "/feed" });
  }

  function pickFromGroup(id: string) {
    setClanGroupId(id);
    const g = groups.find((x) => x.id === id);
    if (g?.clan_tag) setClanTag(g.clan_tag);
  }

  if (loading) {
    return (
      <AppShell>
        <div className="font-mono-num text-sm text-muted-foreground">LOADING…</div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-xl">
        <p className="eyebrow text-primary">Profile</p>
        <h1 className="font-display text-4xl font-black tracking-tight">Your runner card</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Set your name and a clan tag to rep your club on every leaderboard.
        </p>

        <div className="mt-8 space-y-5 rounded-2xl border border-border bg-card p-6">
          <div className="space-y-2">
            <Label htmlFor="name">Display name</Label>
            <Input
              id="name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={40}
            />
          </div>

          {groups.length > 0 && (
            <div className="space-y-2">
              <Label>Repping</Label>
              <Select value={clanGroupId} onValueChange={pickFromGroup}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick a club" />
                </SelectTrigger>
                <SelectContent>
                  {groups.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.clan_tag ? `[${g.clan_tag}] ` : ""}
                      {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Picks the club whose tag you want shown.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="tag">Clan tag (2-5 chars, A-Z and 0-9)</Label>
            <Input
              id="tag"
              value={clanTag}
              onChange={(e) =>
                setClanTag(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5))
              }
              placeholder="NYC"
              className="font-mono-num uppercase"
              maxLength={5}
            />
            <p className="text-xs text-muted-foreground">
              Preview: <span className="font-mono-num text-primary">{formatClanTag(clanTag)}</span>
              <span className="text-foreground font-medium">{displayName || "Runner"}</span>
            </p>
          </div>

          <div className="flex gap-2 pt-2">
            <Button onClick={handleSave} disabled={saving} className="flex-1">
              {saving ? "Saving…" : "Save profile"}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setClanTag("");
                setClanGroupId("");
              }}
            >
              Clear tag
            </Button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
