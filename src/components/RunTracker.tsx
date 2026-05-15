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
import { getRouteDirections, type DirectionStep } from "@/lib/directions.functions";
import { useRunGuidance } from "@/hooks/useRunGuidance";
import { isVoiceMuted, isVoiceSupported, primeVoice, setVoiceMuted, speak, cancelSpeech } from "@/lib/voice";
import { onLocationFix, startTracking, stopTracking, type LocationFix } from "@/lib/tracking";
import { toast } from "sonner";
import { Play, Pause, Square, MapPin, Loader2, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { RunPermissionPrimer, hasSeenRunPrimer, markRunPrimerSeen } from "@/components/RunPermissionPrimer";
import { RunSummary } from "@/components/RunSummary";

function isNativePlatform(): boolean {
  // @ts-expect-error - Capacitor injects this global on native builds only
  const cap = typeof window !== "undefined" ? window.Capacitor : undefined;
  return !!cap?.isNativePlatform?.();
}

type Coord = [number, number];
type Visibility = "private" | "public" | "leaderboard";

interface RunTrackerProps {
  /** Optional pre-planned route polyline to display as a faint guide line. */
  plannedPath?: Coord[];
}

export function RunTracker({ plannedPath }: RunTrackerProps = {}) {
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
  const [trackingSource, setTrackingSource] = useState<"native" | "web" | null>(null);
  const [lastAccuracy, setLastAccuracy] = useState<number | null>(null);

  const watchIdRef = useRef<number | null>(null);
  const lastFixRef = useRef<Coord | null>(null);
  const lastAltRef = useRef<number | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const accumulatedMsRef = useRef(0);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  // Save form
  const [notes, setNotes] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("private");
  const [saveAsRoute, setSaveAsRoute] = useState(false);
  const [routeName, setRouteName] = useState("");
  const [routePublic, setRoutePublic] = useState(true);
  const [saving, setSaving] = useState(false);

  // Voice guidance
  const [muted, setMuted] = useState(false);
  const [steps, setSteps] = useState<DirectionStep[] | undefined>(undefined);
  const [primerOpen, setPrimerOpen] = useState(false);
  const voiceSupported = isVoiceSupported();

  // Initial mute state from localStorage
  useEffect(() => {
    setMuted(isVoiceMuted());
  }, []);

  // Fetch turn-by-turn directions when a planned path is provided
  useEffect(() => {
    if (!plannedPath || plannedPath.length < 2) {
      setSteps(undefined);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await getRouteDirections({ data: { coordinates: plannedPath } });
        if (!cancelled) setSteps(res.steps);
      } catch (err) {
        console.error("Failed to fetch directions", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [plannedPath]);

  // Run audio guidance — fires on every position update
  useRunGuidance({
    active: status === "running",
    plannedPath,
    steps,
    currentCoord: coords.length > 0 ? coords[coords.length - 1] : null,
    distanceMeters: distance,
  });

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    setVoiceMuted(next);
    if (next) cancelSpeech();
  };

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
      void stopTracking();
      if (tickRef.current) clearInterval(tickRef.current);
      releaseWakeLock();
    };
  }, []);

  // Re-acquire wake lock when tab becomes visible again (browsers auto-release on hide)
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible" && (status === "running")) {
        void requestWakeLock();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [status]);

  async function requestWakeLock() {
    try {
      const navAny = navigator as Navigator & {
        wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinel> };
      };
      if (navAny.wakeLock?.request) {
        wakeLockRef.current = await navAny.wakeLock.request("screen");
      }
    } catch {
      // Non-fatal — older browsers / iOS Safari versions just don't have it
    }
  }

  function releaseWakeLock() {
    try {
      wakeLockRef.current?.release();
    } catch {
      /* ignore */
    }
    wakeLockRef.current = null;
  }


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

  // Shared handler for any incoming GPS fix (web or native background plugin).
  // IMPORTANT: we no longer drop low-accuracy fixes entirely — that was the
  // root cause of "ran a 5k, only tracked 0.01 mi". Under tree cover or in
  // urban canyons every single fix can come back with accuracy > 30m, which
  // meant we threw away the whole run. Now we always record the position
  // (so the map keeps drawing), and only skip the *distance* increment when
  // the movement is smaller than the GPS noise floor.
  const handleFix = (
    coord: Coord,
    altitude: number | null,
    altitudeAccuracy: number | null,
    accuracy: number | null,
  ) => {
    if (accuracy != null) setLastAccuracy(accuracy);

    if (
      typeof altitude === "number" &&
      !Number.isNaN(altitude) &&
      (altitudeAccuracy == null || altitudeAccuracy <= 15)
    ) {
      const lastAlt = lastAltRef.current;
      if (lastAlt != null) {
        const dAlt = altitude - lastAlt;
        if (dAlt > 1) setElevationGain((g) => g + dAlt);
      }
      lastAltRef.current = altitude;
    }
    setCoords((prev) => {
      const last = lastFixRef.current;
      if (last) {
        const d = haversineMeters(last, coord);
        // Minimum movement to register: 1m, OR larger than the GPS noise
        // floor so we don't accumulate jitter as distance.
        const noiseFloor = Math.max(1, (accuracy ?? 0) * 0.5);
        if (d < noiseFloor) {
          setCenter(coord);
          return prev;
        }
        setDistance((cur) => cur + d);
      }
      lastFixRef.current = coord;
      setCenter(coord);
      const next = [...prev, coord];
      // Persist live so a crash/kill doesn't lose the whole run
      try {
        window.localStorage.setItem(
          "otr:active-run-coords",
          JSON.stringify(next.slice(-2000)),
        );
      } catch {
        /* quota or private mode — ignore */
      }
      return next;
    });
  };

  const nativeUnsubRef = useRef<(() => void) | null>(null);

  const beginWatch = async (): Promise<boolean> => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setPermError("Geolocation is not supported on this device.");
      return false;
    }

    // Native (iOS/Android in Capacitor): use background-geolocation. This is
    // the ONLY place we trigger the "Always Allow" prompt — never at app launch.
    if (isNativePlatform()) {
      try {
        nativeUnsubRef.current = onLocationFix((fix: LocationFix) => {
          handleFix(fix.coord, fix.altitude, fix.altitudeAccuracy, fix.accuracy);
        });
        const started = await startTracking();
        if (started) {
          setTrackingSource("native");
          return true;
        }
        // If native start failed (plugin missing, perm denied), unsubscribe
        // and fall through to the web watcher so the user still gets tracking.
        nativeUnsubRef.current?.();
        nativeUnsubRef.current = null;
      } catch {
        nativeUnsubRef.current?.();
        nativeUnsubRef.current = null;
      }
    }

    // Web fallback (or native fallback) — When-In-Use only.
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        handleFix(
          [pos.coords.longitude, pos.coords.latitude],
          pos.coords.altitude,
          pos.coords.altitudeAccuracy,
          pos.coords.accuracy,
        );
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
    setTrackingSource("web");
    return true;
  };

  const endWatch = () => {
    if (watchIdRef.current != null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (nativeUnsubRef.current) {
      nativeUnsubRef.current();
      nativeUnsubRef.current = null;
    }
    void stopTracking();
    lastFixRef.current = null;
    lastAltRef.current = null;
  };

  const handleStart = async () => {
    setPermError(null);
    primeVoice(); // unlock SpeechSynthesis on iOS via this user gesture
    if (!hasSeenRunPrimer()) {
      setPrimerOpen(true);
      return;
    }
    await actuallyStart();
  };

  const actuallyStart = async () => {
    const ok = await beginWatch();
    if (!ok) return;
    startTimer();
    void requestWakeLock();
    if (plannedPath && plannedPath.length > 1) {
      speak("Starting your run. Follow the route on screen.");
    } else {
      speak("Run started");
    }
    setStatus("running");
  };
  const handlePause = () => {
    endWatch();
    stopTimer();
    releaseWakeLock();
    cancelSpeech();
    speak("Run paused");
    setStatus("paused");
  };
  const handleResume = async () => {
    const ok = await beginWatch();
    if (!ok) return;
    startTimer();
    void requestWakeLock();
    speak("Resuming");
    setStatus("running");
  };
  const handleStop = () => {
    endWatch();
    stopTimer();
    releaseWakeLock();
    cancelSpeech();
    speak("Run stopped");
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
    setTrackingSource(null);
    try { window.localStorage.removeItem("otr:active-run-coords"); } catch { /* ignore */ }
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

      try { window.localStorage.removeItem("otr:active-run-coords"); } catch { /* ignore */ }

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
          plannedPath={plannedPath}
          userLocation={center}
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

          {voiceSupported && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={toggleMute}
              className="gap-1.5"
              aria-label={muted ? "Unmute audio guidance" : "Mute audio guidance"}
              title={muted ? "Unmute audio guidance" : "Mute audio guidance"}
            >
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              <span className="hidden sm:inline">{muted ? "Audio off" : "Audio on"}</span>
            </Button>
          )}

          {isLive && (
            <div className="ml-auto flex flex-col items-end gap-0.5 text-sm text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <span
                  className={`inline-block h-2 w-2 rounded-full ${
                    status === "running" ? "animate-pulse bg-primary" : "bg-muted-foreground"
                  }`}
                />
                {status === "running" ? "Recording GPS…" : "Paused"}
                {trackingSource && (
                  <span
                    className={`ml-1 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                      trackingSource === "native"
                        ? "bg-primary/15 text-primary"
                        : "bg-amber-500/15 text-amber-500"
                    }`}
                    title={
                      trackingSource === "native"
                        ? "Background GPS active — keeps recording with the screen off"
                        : "Browser GPS — pauses if the screen locks. Install the app for background tracking."
                    }
                  >
                    {trackingSource === "native" ? "Native GPS" : "Browser GPS"}
                  </span>
                )}
              </div>
              {lastAccuracy != null && (
                <div className="text-[10px] tabular-nums">±{Math.round(lastAccuracy)}m</div>
              )}
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
              Tip: in the browser, GPS pauses the moment your screen locks — keep
              the tab in the foreground. For background recording with the screen
              off, install Own The Run from TestFlight and choose{" "}
              <span className="font-semibold text-foreground">Always Allow</span>{" "}
              when iOS asks for location.
            </div>
            {plannedPath && plannedPath.length > 1 && voiceSupported && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs text-foreground">
                <div className="font-semibold text-primary">Audio guidance is on</div>
                <p className="mt-1 text-muted-foreground">
                  You'll hear turn-by-turn directions, mile splits, off-route
                  warnings, and a finish cue. Plug in headphones for the best
                  experience. Tap the audio button to mute.
                </p>
              </div>
            )}
          </>
        )}
      </aside>

      <RunPermissionPrimer
        open={primerOpen}
        onContinue={() => {
          markRunPrimerSeen();
          setPrimerOpen(false);
          void actuallyStart();
        }}
        onCancel={() => setPrimerOpen(false)}
      />
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
