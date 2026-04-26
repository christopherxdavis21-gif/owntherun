import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { RouteMap } from "@/components/RouteMap";
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
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import {
  formatDistance,
  formatDuration,
  formatPace,
  formatElevation,
  haversineMeters,
} from "@/lib/format";
import { computeElevationGain } from "@/lib/mapbox.functions";
import { toast } from "sonner";
import { Play, Pause, Square, MapPin, Loader2, RotateCcw } from "lucide-react";

type Coord = [number, number];
type Visibility = "private" | "public" | "leaderboard";

export function RunTracker() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"idle" | "running" | "paused" | "stopped">(
    "idle",
  );
  const [coords, setCoords] = useState<Coord[]>([]);
  const [distance, setDistance] = useState(0); // meters
  const [elapsed, setElapsed] = useState(0); // seconds
  const [elevationGain, setElevationGain] = useState(0); // meters, live from GPS altitude
  const [center, setCenter] = useState<Coord | undefined>(undefined);
  const [permError, setPermError] = useState<string | null>(null);

  const watchIdRef = useRef<number | null>(null);
  const lastFixRef = useRef<Coord | null>(null);
  const lastAltRef = useRef<number | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const accumulatedMsRef = useRef(0);

  // Save form
  const [notes, setNotes] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("private");
  const [saveAsRoute, setSaveAsRoute] = useState(false);
  const [routeName, setRouteName] = useState("");
  const [routePublic, setRoutePublic] = useState(true);
  const [saving, setSaving] = useState(false);

  // Initial center on user location
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setCenter([pos.coords.longitude, pos.coords.latitude]),
      () => {},
      { timeout: 5000 },
    );
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current != null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, []);

  const startTimer = () => {
    startedAtRef.current = Date.now();
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = setInterval(() => {
      const ms =
        accumulatedMsRef.current +
        (startedAtRef.current ? Date.now() - startedAtRef.current : 0);
      setElapsed(Math.floor(ms / 1000));
    }, 250);
  };

  const stopTimer = () => {
    if (startedAtRef.current) {
      accumulatedMsRef.current += Date.now() - startedAtRef.current;
      startedAtRef.current = null;
    }
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    setElapsed(Math.floor(accumulatedMsRef.current / 1000));
  };

  const beginWatch = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setPermError("Geolocation is not supported on this device.");
      return false;
    }
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const next: Coord = [pos.coords.longitude, pos.coords.latitude];
        // Filter low-accuracy fixes (> 30m) to reduce GPS jitter inflating distance
        if (pos.coords.accuracy && pos.coords.accuracy > 30) {
          setCenter(next);
          return;
        }
        // Live elevation gain from GPS altitude (filter noisy/low-accuracy altitudes)
        const alt = pos.coords.altitude;
        const altAcc = pos.coords.altitudeAccuracy;
        if (
          typeof alt === "number" &&
          !Number.isNaN(alt) &&
          (altAcc == null || altAcc <= 15)
        ) {
          const lastAlt = lastAltRef.current;
          if (lastAlt != null) {
            const dAlt = alt - lastAlt;
            // Only count climbs > 1m to ignore altitude jitter
            if (dAlt > 1) setElevationGain((g) => g + dAlt);
          }
          lastAltRef.current = alt;
        }
        setCoords((prev) => {
          const last = lastFixRef.current;
          if (last) {
            const d = haversineMeters(last, next);
            if (d < 3) return prev;
            setDistance((cur) => cur + d);
          }
          lastFixRef.current = next;
          setCenter(next);
          return [...prev, next];
        });
      },
      (err) => {
        setPermError(
          err.code === err.PERMISSION_DENIED
            ? "Location permission denied. Enable location to track your run."
            : "Could not get your location. Try again outside.",
        );
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 },
    );
    return true;
  };

  const endWatch = () => {
    if (watchIdRef.current != null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    lastFixRef.current = null;
    lastAltRef.current = null;
  };

  const handleStart = () => {
    setPermError(null);
    if (!beginWatch()) return;
    startTimer();
    setStatus("running");
  };
  const handlePause = () => {
    endWatch();
    stopTimer();
    setStatus("paused");
  };
  const handleResume = () => {
    if (!beginWatch()) return;
    startTimer();
    setStatus("running");
  };
  const handleStop = () => {
    endWatch();
    stopTimer();
    setStatus("stopped");
    if (coords.length > 0) {
      const now = new Date();
      setRouteName(
        `Run on ${now.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`,
      );
    }
  };
  const handleReset = () => {
    endWatch();
    stopTimer();
    accumulatedMsRef.current = 0;
    startedAtRef.current = null;
    lastFixRef.current = null;
    lastAltRef.current = null;
    setCoords([]);
    setDistance(0);
    setElapsed(0);
    setElevationGain(0);
    setStatus("idle");
    setNotes("");
    setSaveAsRoute(false);
    setRouteName("");
    setVisibility("private");
  };

  const save = async () => {
    if (coords.length < 2) return toast.error("Not enough GPS data to save");
    if (elapsed < 5) return toast.error("Run is too short to save");
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Not signed in");
      const userId = userData.user.id;

      // Refine elevation gain via Mapbox terrain (more accurate than phone GPS altitude)
      let finalElev = elevationGain;
      try {
        const elev = await computeElevationGain({ data: { coordinates: coords } });
        if (elev.elevation_gain_meters > 0) finalElev = elev.elevation_gain_meters;
      } catch {
        // Non-fatal, fall back to live GPS-derived gain
      }

      let routeId: string | null = null;
      if (saveAsRoute) {
        if (!routeName.trim()) throw new Error("Give the saved route a name");
        const { data: routeRow, error: rErr } = await supabase
          .from("routes")
          .insert({
            user_id: userId,
            name: routeName.trim(),
            description: null,
            coordinates: coords,
            distance_meters: distance,
            is_public: routePublic,
          })
          .select("id")
          .single();
        if (rErr) throw rErr;
        routeId = routeRow.id;
      }

      const { error: runErr } = await supabase.from("runs").insert({
        user_id: userId,
        route_id: routeId,
        distance_meters: distance,
        duration_seconds: elapsed,
        elevation_gain_meters: finalElev,
        visibility,
        notes: notes.trim() || null,
      });
      if (runErr) throw runErr;

      toast.success(
        visibility === "leaderboard"
          ? "Run submitted to the leaderboard"
          : visibility === "public"
            ? "Run shared publicly"
            : "Run saved privately",
      );
      navigate({ to: "/feed" });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save run");
    } finally {
      setSaving(false);
    }
  };

  const isLive = status === "running" || status === "paused";

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-3">
        <RouteMap
          coordinates={coords}
          initialCenter={center}
          className="h-[420px] w-full"
        />

        {/* Live stats — 4 cells now including elevation */}
        <div className="grid grid-cols-2 gap-2 rounded-2xl border border-border bg-card p-4 sm:grid-cols-4">
          <Stat label="Distance" value={formatDistance(distance)} />
          <Stat label="Time" value={formatDuration(elapsed)} />
          <Stat label="Pace" value={formatPace(distance, elapsed)} />
          <Stat label="Elevation" value={formatElevation(elevationGain)} />
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {status === "idle" && (
            <Button onClick={handleStart} className="gap-1.5">
              <Play className="h-4 w-4" /> Start
            </Button>
          )}
          {status === "running" && (
            <>
              <Button variant="secondary" onClick={handlePause} className="gap-1.5">
                <Pause className="h-4 w-4" /> Pause
              </Button>
              <Button variant="destructive" onClick={handleStop} className="gap-1.5">
                <Square className="h-4 w-4" /> Stop
              </Button>
            </>
          )}
          {status === "paused" && (
            <>
              <Button onClick={handleResume} className="gap-1.5">
                <Play className="h-4 w-4" /> Resume
              </Button>
              <Button variant="destructive" onClick={handleStop} className="gap-1.5">
                <Square className="h-4 w-4" /> Stop
              </Button>
            </>
          )}
          {status === "stopped" && (
            <Button variant="secondary" onClick={handleReset} className="gap-1.5">
              <RotateCcw className="h-4 w-4" /> Discard & reset
            </Button>
          )}

          {isLive && (
            <div className="ml-auto flex items-center gap-1.5 text-sm text-muted-foreground">
              <span
                className={`inline-block h-2 w-2 rounded-full ${
                  status === "running" ? "animate-pulse bg-primary" : "bg-muted-foreground"
                }`}
              />
              {status === "running" ? "Recording GPS…" : "Paused"}
            </div>
          )}
          {coords.length > 0 && !isLive && (
            <div className="ml-auto flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4" />
              <span className="font-mono-num">{coords.length}</span> fixes
            </div>
          )}
        </div>

        {permError && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {permError}
          </div>
        )}
      </div>

      <aside className="space-y-4 rounded-2xl border border-border bg-card p-5">
        {status === "stopped" ? (
          <>
            <div>
              <h2 className="font-display text-lg font-bold">Save your run</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Choose how this run is shared. You can also save the path as a reusable route.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="vis">Visibility</Label>
              <Select value={visibility} onValueChange={(v) => setVisibility(v as Visibility)}>
                <SelectTrigger id="vis">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">Private — only me</SelectItem>
                  <SelectItem value="public">Public — share on profile</SelectItem>
                  <SelectItem value="leaderboard">Submit to leaderboard</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Leaderboard submission requires a verified account.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Textarea
                id="notes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="How'd it feel?"
              />
            </div>

            <div className="rounded-lg border border-border bg-surface/50 p-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">Save path as a route</div>
                  <div className="text-xs text-muted-foreground">
                    Reuse it later or share with others
                  </div>
                </div>
                <Switch checked={saveAsRoute} onCheckedChange={setSaveAsRoute} />
              </div>
              {saveAsRoute && (
                <div className="mt-3 space-y-2">
                  <Input
                    value={routeName}
                    onChange={(e) => setRouteName(e.target.value)}
                    placeholder="Route name"
                  />
                  <label className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Public route</span>
                    <Switch checked={routePublic} onCheckedChange={setRoutePublic} />
                  </label>
                </div>
              )}
            </div>

            <Button className="w-full" onClick={save} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Saving…
                </>
              ) : (
                "Save run"
              )}
            </Button>
          </>
        ) : (
          <>
            <div>
              <h2 className="font-display text-lg font-bold">How it works</h2>
            </div>
            <ol className="space-y-2 text-sm text-muted-foreground">
              <li>
                <span className="font-mono-num text-primary">1.</span> Tap{" "}
                <span className="font-medium text-foreground">Start</span> and allow
                location access.
              </li>
              <li>
                <span className="font-mono-num text-primary">2.</span> Run anywhere —
                your path draws live on the map.
              </li>
              <li>
                <span className="font-mono-num text-primary">3.</span> Hit{" "}
                <span className="font-medium text-foreground">Stop</span> when done,
                then choose Private, Public, or Leaderboard.
              </li>
            </ol>
            <div className="rounded-lg border border-border bg-surface/50 p-3 text-xs text-muted-foreground">
              Tip: keep this tab in the foreground while running. Background GPS
              isn't supported in the browser. Elevation comes from your device's GPS
              while running and is refined with terrain data on save.
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <div className="eyebrow text-muted-foreground">{label}</div>
      <div className="font-mono-num text-2xl font-bold text-primary">{value}</div>
    </div>
  );
}
