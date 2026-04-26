import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
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
import { ShieldCheck, ShieldAlert, Mail, Phone, Trophy, Flame, Activity, Route as RouteIcon } from "lucide-react";
import { TrophyCard } from "@/components/trophies/TrophyCard";
import type { AchievementTier } from "@/lib/trophy";

export const Route = createFileRoute("/profile")({
  head: () => ({ meta: [{ title: "Profile — Catch Up" }] }),
  component: ProfilePage,
});

type GroupOption = { id: string; name: string; clan_tag: string | null };
type ProfileRow = {
  display_name: string;
  clan_tag: string | null;
  clan_group_id: string | null;
  gender: string | null;
  birthdate: string | null;
  phone_number: string | null;
  phone_verified: boolean;
  email_verified: boolean;
  is_verified: boolean;
};

function ProfilePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState("");
  const [clanTag, setClanTag] = useState("");
  const [clanGroupId, setClanGroupId] = useState<string>("");
  const [gender, setGender] = useState<string>("undisclosed");
  const [birthdate, setBirthdate] = useState<string>("");
  const [emailVerified, setEmailVerified] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Engagement summary
  const [summary, setSummary] = useState<{
    miles: number;
    runs: number;
    streak: number;
    medals: number;
  }>({ miles: 0, runs: 0, streak: 0, medals: 0 });
  const [recentTrophies, setRecentTrophies] = useState<
    Array<{ code: string; title: string; description: string; tier: AchievementTier; icon: string; earned_at: string }>
  >([]);


  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data: profile }, { data: members }] = await Promise.all([
        supabase
          .from("profiles")
          .select("display_name, clan_tag, clan_group_id, gender, birthdate, email_verified, is_verified")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase.from("group_members").select("group_id").eq("user_id", user.id),
      ]);

      const p = profile as ProfileRow | null;
      if (p) {
        setDisplayName(p.display_name ?? "");
        setClanTag(p.clan_tag ?? "");
        setClanGroupId(p.clan_group_id ?? "");
        setGender(p.gender ?? "undisclosed");
        setBirthdate(p.birthdate ?? "");
        setEmailVerified(!!p.email_verified);
        setIsVerified(!!p.is_verified);
      }

      const ids = (members ?? []).map((m: { group_id: string }) => m.group_id);
      if (ids.length) {
        const { data: gs } = await supabase
          .from("groups")
          .select("id, name, clan_tag")
          .in("id", ids);
        setGroups((gs as GroupOption[] | null) ?? []);
      }

      // Stats summary
      const [statsRes, medalsRes, recentRes, defsRes] = await Promise.all([
        supabase
          .from("user_stats")
          .select("lifetime_meters, lifetime_runs, current_streak_days")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase.from("medals").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase
          .from("user_achievements")
          .select("achievement_code, earned_at")
          .eq("user_id", user.id)
          .order("earned_at", { ascending: false })
          .limit(6),
        supabase
          .from("achievement_definitions")
          .select("code, title, description, tier, icon"),
      ]);
      const st = statsRes.data as { lifetime_meters: number; lifetime_runs: number; current_streak_days: number } | null;
      setSummary({
        miles: st ? Number(st.lifetime_meters) / 1609.344 : 0,
        runs: st?.lifetime_runs ?? 0,
        streak: st?.current_streak_days ?? 0,
        medals: medalsRes.count ?? 0,
      });
      const defMap: Record<string, { title: string; description: string; tier: AchievementTier; icon: string }> = {};
      ((defsRes.data as Array<{ code: string; title: string; description: string; tier: AchievementTier; icon: string }> | null) ?? []).forEach(
        (d) => (defMap[d.code] = d),
      );
      const recent = ((recentRes.data as Array<{ achievement_code: string; earned_at: string }> | null) ?? [])
        .map((r) => {
          const d = defMap[r.achievement_code];
          return d ? { code: r.achievement_code, ...d, earned_at: r.earned_at } : null;
        })
        .filter((x): x is NonNullable<typeof x> => !!x);
      setRecentTrophies(recent);
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
        gender: gender === "undisclosed" ? null : gender,
        birthdate: birthdate || null,
      })
      .eq("user_id", user.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Profile saved");
  }

  function pickFromGroup(id: string) {
    setClanGroupId(id);
    const g = groups.find((x) => x.id === id);
    if (g?.clan_tag) setClanTag(g.clan_tag);
  }

  async function resendEmailVerification() {
    if (!user?.email) return;
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: user.email,
    });
    if (error) toast.error(error.message);
    else toast.success("Verification email sent");
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
          Verify once to submit runs to leaderboards. Your name and clan tag rep your club.
        </p>

        {/* Verification card */}
        <div
          className={`mt-6 rounded-2xl border p-5 ${
            isVerified ? "border-primary/40 bg-primary/5" : "border-amber-500/40 bg-amber-500/5"
          }`}
        >
          <div className="flex items-center gap-2">
            {isVerified ? (
              <ShieldCheck className="h-5 w-5 text-primary" />
            ) : (
              <ShieldAlert className="h-5 w-5 text-amber-500" />
            )}
            <p className="font-display text-xl font-bold">
              {isVerified ? "Verified runner" : "Not yet verified"}
            </p>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Verify your email to submit runs to public leaderboards. Private runs
            don't need verification.
          </p>

          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between rounded-lg border border-border bg-card p-3">
              <div className="flex items-center gap-2 text-sm">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span>{user?.email}</span>
              </div>
              {emailVerified ? (
                <span className="font-mono-num text-xs font-bold text-primary">VERIFIED</span>
              ) : (
                <Button size="sm" variant="outline" onClick={resendEmailVerification}>
                  Resend
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Stats summary strip */}
        <div className="mt-6 rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <p className="font-display text-lg font-bold">Your stats</p>
            <Link to="/stats" className="text-xs text-primary hover:underline">View full stats →</Link>
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2">
            {[
              { label: "MILES", value: summary.miles.toFixed(1), icon: RouteIcon },
              { label: "RUNS", value: String(summary.runs), icon: Activity },
              { label: "STREAK", value: `${summary.streak}d`, icon: Flame },
              { label: "MEDALS", value: String(summary.medals), icon: Trophy },
            ].map((t) => (
              <div key={t.label} className="rounded-lg border border-border bg-surface/40 p-2 text-center">
                <t.icon className="mx-auto h-3.5 w-3.5 text-muted-foreground" />
                <p className="font-mono-num mt-1 text-base font-bold tabular-nums text-primary">{t.value}</p>
                <p className="font-mono-num text-[9px] uppercase tracking-wider text-muted-foreground">{t.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Recent trophies preview */}
        <div className="mt-6 rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <p className="font-display text-lg font-bold">Trophy case</p>
            <Link to="/trophies" className="text-xs text-primary hover:underline">View all →</Link>
          </div>
          {recentTrophies.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              No trophies yet — log a run to start unlocking them.
            </p>
          ) : (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {recentTrophies.map((t) => (
                <TrophyCard
                  key={t.code}
                  title={t.title}
                  description={t.description}
                  tier={t.tier}
                  icon={t.icon}
                  earned
                  earnedAt={t.earned_at}
                />
              ))}
            </div>
          )}
        </div>

        <div className="mt-6 space-y-5 rounded-2xl border border-border bg-card p-6">
          <div className="space-y-2">
            <Label htmlFor="name">Display name</Label>
            <Input
              id="name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={40}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="gender">Gender</Label>
              <Select value={gender} onValueChange={setGender}>
                <SelectTrigger id="gender"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="undisclosed">Prefer not to say</SelectItem>
                  <SelectItem value="male">Man</SelectItem>
                  <SelectItem value="female">Woman</SelectItem>
                  <SelectItem value="nonbinary">Nonbinary</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="bday">Birthdate</Label>
              <Input
                id="bday"
                type="date"
                value={birthdate}
                onChange={(e) => setBirthdate(e.target.value)}
                max={new Date().toISOString().slice(0, 10)}
              />
            </div>
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
            <Button variant="outline" onClick={() => navigate({ to: "/feed" })}>
              Done
            </Button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
