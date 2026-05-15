import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { getUnit, setUnit, type Unit } from "@/lib/units";
import { isVoiceMuted, isVoiceSupported, setVoiceMuted } from "@/lib/voice";
import { LogOut } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Own The Run" },
      { name: "description", content: "Units, voice guidance, and account settings for Own The Run." },
    ],
  }),
  component: () => (
    <AppShell>
      <SettingsPage />
    </AppShell>
  ),
});

function SettingsPage() {
  const navigate = useNavigate();
  const [unit, setUnitState] = useState<Unit>("mi");
  const [muted, setMuted] = useState(false);
  const voiceSupported = isVoiceSupported();

  useEffect(() => {
    setUnitState(getUnit());
    setMuted(isVoiceMuted());
  }, []);

  const onUnitChange = (v: string) => {
    const next = v as Unit;
    setUnitState(next);
    setUnit(next);
    toast.success(`Distances now in ${next === "mi" ? "miles" : "kilometers"}`);
  };

  const onVoiceChange = (on: boolean) => {
    setMuted(!on);
    setVoiceMuted(!on);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <p className="eyebrow text-primary">Settings</p>
        <h1 className="font-display mt-1 text-3xl font-black tracking-tight md:text-4xl">
          Your preferences
        </h1>
      </header>

      <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
        <div>
          <h2 className="font-display text-lg font-bold">Units</h2>
          <p className="text-xs text-muted-foreground">
            Affects distance, pace, and elevation everywhere in the app.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="unit">Distance units</Label>
          <Select value={unit} onValueChange={onUnitChange}>
            <SelectTrigger id="unit">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mi">Miles (mi, ft)</SelectItem>
              <SelectItem value="km">Kilometers (km, m)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
        <div>
          <h2 className="font-display text-lg font-bold">Audio guidance</h2>
          <p className="text-xs text-muted-foreground">
            Turn-by-turn directions, mile splits, and off-route warnings during runs.
          </p>
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="voice" className="text-sm font-medium">
            Voice cues during runs
          </Label>
          <Switch
            id="voice"
            checked={!muted}
            onCheckedChange={onVoiceChange}
            disabled={!voiceSupported}
          />
        </div>
        {!voiceSupported && (
          <p className="text-xs text-muted-foreground">
            Voice guidance isn't supported on this browser.
          </p>
        )}
      </section>

      <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
        <div>
          <h2 className="font-display text-lg font-bold">Account</h2>
        </div>
        <Button variant="outline" onClick={signOut} className="gap-1.5">
          <LogOut className="h-4 w-4" /> Sign out
        </Button>
      </section>

      <section className="space-y-2 rounded-2xl border border-border bg-card p-5 text-sm">
        <h2 className="font-display text-lg font-bold">Legal</h2>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <Link to="/privacy" className="text-primary hover:underline">
            Privacy Policy
          </Link>
          <Link to="/terms" className="text-primary hover:underline">
            Terms of Service
          </Link>
        </div>
      </section>
    </div>
  );
}
