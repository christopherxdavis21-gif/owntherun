import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { RouteMap } from "@/components/RouteMap";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { snapToRoads } from "@/lib/mapbox.functions";
import { totalDistance, formatDistance } from "@/lib/format";
import { toast } from "sonner";
import { Undo2, Trash2, MapPin, Loader2 } from "lucide-react";

type Coord = [number, number];

export const Route = createFileRoute("/routes/new")({
  head: () => ({
    meta: [
      { title: "New route — Catch Up" },
      { name: "description", content: "Map a new running route by tapping the map." },
    ],
  }),
  component: NewRoutePage,
});

function NewRoutePage() {
  const navigate = useNavigate();
  const [coords, setCoords] = useState<Coord[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [center, setCenter] = useState<Coord | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  // Try to center on the user's location
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setCenter([pos.coords.longitude, pos.coords.latitude]),
      () => {
        /* ignore */
      },
      { timeout: 5000 },
    );
  }, []);

  const distance = totalDistance(coords);

  const undo = () => setCoords((c) => c.slice(0, -1));
  const clear = () => setCoords([]);

  const save = async () => {
    if (!name.trim()) return toast.error("Give your route a name");
    if (coords.length < 2) return toast.error("Drop at least 2 points to make a route");
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Not signed in");
      const { data, error } = await supabase
        .from("routes")
        .insert({
          user_id: userData.user.id,
          name: name.trim(),
          description: description.trim() || null,
          coordinates: coords,
          distance_meters: distance,
          is_public: isPublic,
        })
        .select("id")
        .single();
      if (error) throw error;
      toast.success("Route saved");
      navigate({ to: "/routes/$routeId", params: { routeId: data.id } });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell>
      <div className="mb-6">
        <p className="eyebrow text-primary">Build a route</p>
        <h1 className="font-display text-4xl font-black tracking-tight">Drop pins. Make a path.</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Tap the map to add waypoints. We'll connect them in order.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-3">
          <RouteMap
            coordinates={coords}
            onChange={setCoords}
            editable
            initialCenter={center}
            className="h-[520px] w-full"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={undo} disabled={!coords.length}>
              <Undo2 className="mr-1.5 h-3.5 w-3.5" /> Undo
            </Button>
            <Button variant="secondary" size="sm" onClick={clear} disabled={!coords.length}>
              <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Clear
            </Button>
            <div className="ml-auto flex items-center gap-4 text-sm">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <MapPin className="h-4 w-4" /> <span className="font-mono-num">{coords.length}</span> pts
              </div>
              <div className="font-mono-num text-base font-semibold text-primary">
                {formatDistance(distance)}
              </div>
            </div>
          </div>
        </div>

        <aside className="space-y-4 rounded-2xl border border-border bg-card p-5">
          <div className="space-y-1.5">
            <Label htmlFor="name">Route name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Riverside loop"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="desc">Description (optional)</Label>
            <Textarea
              id="desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Mostly flat, lots of trees."
              rows={3}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border bg-surface/50 p-3">
            <div>
              <div className="text-sm font-medium">Public route</div>
              <div className="text-xs text-muted-foreground">
                Others can run it and appear on its leaderboard
              </div>
            </div>
            <Switch checked={isPublic} onCheckedChange={setIsPublic} />
          </div>
          <Button className="w-full" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save route"}
          </Button>
        </aside>
      </div>
    </AppShell>
  );
}
