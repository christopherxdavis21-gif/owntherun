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
import { computeElevationGain, mapMatchTrace } from "@/lib/mapbox.functions";
import { GpsKalman, deadReckonDistance } from "@/lib/gpsFilter";
import { startPedometer, stopPedometer, readPedometerDistance } from "@/lib/pedometer";
import { getRouteDirections, type DirectionStep } from "@/lib/directions.functions";
import { useRunGuidance } from "@/hooks/useRunGuidance";
import { isVoiceMuted, isVoiceSupported, primeVoice, setVoiceMuted, speak, cancelSpeech } from "@/lib/voice";
import {
  onLocationFix,
  onTrackingError,
  onLockScreenControl,
  startTracking,
  stopTracking,
  registerLockScreenControls,
  updateLockScreenStats,
  clearLockScreenStats,
  type LocationFix,
} from "@/lib/tracking";
import { startLiveActivity, updateLiveActivity, endLiveActivity } from "@/lib/liveActivity";
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
  /** When set, the saved run is attached to this existing route (for leaderboards). */
  followingRouteId?: string;
}

export function RunTracker({ plannedPath, followingRouteId }: RunTrackerProps = {}) {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"idle" | "running" | "paused" | "stopped">(
    "idle",
  );
  const [coords, setCoords] = useState<Coord[]>([]);
  const [coordTimes, setCoordTimes] = useState<number[]>([]);
  const [distance, setDistance] = useState(0); // meters
  const [elapsed, setElapsed] = useState(0); // seconds
  const [elevationGain, setElevationGain] = useState(0); // meters, live from GPS altitude
  const [center, setCenter] = useState<Coord | undefined>(undefined);
  const [permError, setPermError] = useState<string | null>(null);
  const [trackingSource, setTrackingSource] = useState<"native" | "web" | null>(null);
  const [lastAccuracy, setLastAccuracy] = useState<number | null>(null);

  const watchIdRef = useRef<number | null>(null);
  const lastFixRef = useRef<Coord | null>(null);
  const lastFixTimeRef = useRef<number | null>(null);
  const kalmanRef = useRef<GpsKalman>(new GpsKalman());

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
      nativeUnsubRef.current?.();
      nativeErrorUnsubRef.current?.();
      void stopTracking();
      void stopPedometer();
      void endLiveActivity();
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

  // Register lock-screen action handlers once. Subscribe so Pause/Resume/Stop
  // taps on the lock-screen notification drive the same state machine as
  // the in-app buttons.
  useEffect(() => {
    void registerLockScreenControls();
    const unsub = onLockScreenControl((event) => {
      if (event === "pause" && status === "running") handlePause();
      else if (event === "resume" && status === "paused") void handleResume();
      else if (event === "stop" && (status === "running" || status === "paused")) handleStop();
    });
    return () => {
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // Push live stats to the lock-screen notification + Live Activity ~every 3s.
  useEffect(() => {
    if (status !== "running" && status !== "paused") {
      void clearLockScreenStats();
      void endLiveActivity();
      return;
    }
    const push = () => {
      const paceSecPerMile =
        distance > 0 ? (elapsed / distance) * 1609.344 : 0;
      void updateLockScreenStats({
        distanceMeters: distance,
        elapsedSeconds: elapsed,
        paceSecondsPerMile: paceSecPerMile,
        elevationMeters: elevationGain,
        status: status === "running" ? "running" : "paused",
      });
      void updateLiveActivity({
        distanceMeters: distance,
        elapsedSeconds: elapsed,
        paceSecondsPerMile: paceSecPerMile,
        status: status === "running" ? "running" : "paused",
      });
    };
    push();
    const id = setInterval(push, 3000);
    return () => clearInterval(id);
  }, [status, distance, elapsed, elevationGain]);

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

  // --- Dead reckoning bookkeeping -----------------------------------------
  // `pedoBaselineRef` is the cumulative pedometer reading at the moment GPS
  // was last healthy; `gapCreditedRef` is how much of the current gap we have
  // already added to the total. Diffing against a baseline (rather than
  // summing deltas) means a missed or failed poll can never lose mileage.
  const pedoBaselineRef = useRef<number | null>(null);
  const gapCreditedRef = useRef(0);

  /** Re-anchor the pedometer baseline after a healthy GPS fix. */
  const rebasePedometer = async () => {
    const reading = await readPedometerDistance();
    if (reading != null) pedoBaselineRef.current = reading;
    gapCreditedRef.current = 0;
  };

  /**
   * Credit distance for a stretch where GPS was unusable. Prefers CoreMotion's
   * step-based distance, which keeps recording on the motion coprocessor even
   * while the app is suspended, and falls back to speed x time when the
   * pedometer is unavailable (web, or a build without the native plugin).
   */
  const bridgeGapDistance = async (
    speed: number | null,
    gapSeconds: number,
    fixTime: number,
  ) => {
    const reading = await readPedometerDistance();
    const baseline = pedoBaselineRef.current;

    if (reading != null && baseline != null && reading > baseline) {
      const owed = reading - baseline - gapCreditedRef.current;
      if (owed > 0) {
        gapCreditedRef.current += owed;
        setDistance((cur) => cur + owed);
        lastFixTimeRef.current = fixTime;
      }
      return;
    }

    const bridged = deadReckonDistance(speed, gapSeconds);
    if (bridged > 0) {
      setDistance((cur) => cur + bridged);
      lastFixTimeRef.current = fixTime;
    }
  };

  // Shared handler for any incoming GPS fix (web or native background plugin).
  //
  // Three defences run here, in order:
  //  1. Coarse cell/wifi fixes (accuracy > 50m) are never drawn — they are what
  //     throw the line across streets when the phone is locked in a pocket.
  //     We do NOT throw the run away though: if the fix carries a usable speed
  //     we dead-reckon the distance so mileage keeps accruing through the gap.
  //  2. Accepted fixes go through a Kalman filter so the drawn line follows the
  //     road instead of jittering around it.
  //  3. Jitter + teleport guards decide whether the movement counts as distance.
  const handleFix = (
    coord: Coord,
    altitude: number | null,
    altitudeAccuracy: number | null,
    accuracy: number | null,
    speed: number | null = null,
    timestamp: number | null = null,
  ) => {
    if (accuracy != null) setLastAccuracy(accuracy);

    // Use the OS fix time, not Date.now(). With the screen locked iOS delivers
    // fixes in batches, so wall-clock time badly misstates the real interval.
    const fixTime = timestamp ?? Date.now();

    // Drift guard: with the screen locked and the phone in a pocket, fabric and
    // body mass block the sky view and iOS falls back to coarse cell/wifi fixes
    // (~65m+). Drawing those is what throws the line across streets. Drop them —
    // but keep the mileage alive by dead reckoning, preferring the motion
    // coprocessor's step-based distance and falling back to speed x time.
    if (accuracy != null && accuracy > 50) {
      const gapSeconds = lastFixTimeRef.current != null
        ? (fixTime - lastFixTimeRef.current) / 1000
        : 0;
      void bridgeGapDistance(speed, gapSeconds, fixTime);
      return;
    }

    // A good fix ends any gap: rebase the pedometer so the distance CoreMotion
    // recorded while GPS was healthy is never double-counted.
    void rebasePedometer();



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

    // Kalman-smooth the accepted fix. Measurement noise is the reported
    // accuracy, so precise fixes move the line and vague ones barely nudge it.
    const smoothed = kalmanRef.current.process(
      coord[0],
      coord[1],
      accuracy,
      fixTime,
    );

    setCoords((prev) => {
      const last = lastFixRef.current;
      if (last) {
        const d = haversineMeters(last, smoothed);
        // Ignore tiny stationary jitter without allowing a temporarily broad
        // accuracy radius to suppress genuine forward movement indefinitely.
        const noiseFloor = Math.max(2, Math.min(10, (accuracy ?? 0) * 0.35));
        if (d < noiseFloor) {
          setCenter(smoothed);
          return prev;
        }
        // Teleport guard: reject physically impossible jumps (> 9 m/s sustained,
        // ~5:58/mi) which are always a bad fix, not a sprint.
        const dt = Math.max(1, (fixTime - (lastFixTimeRef.current ?? fixTime)) / 1000);
        if (lastFixTimeRef.current != null && d / dt > 9 && d > 60) {
          return prev;
        }
        setDistance((cur) => cur + d);
      }
      lastFixRef.current = smoothed;
      lastFixTimeRef.current = fixTime;
      setCenter(smoothed);

      const next = [...prev, smoothed];
      setCoordTimes((t) => [...t, fixTime]);
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
    // Start CoreMotion alongside GPS. It costs almost nothing (the motion
    // coprocessor is always running) and gives us step-based distance to
    // bridge GPS dropouts in a pocket. No-op where unavailable.
    pedoBaselineRef.current = null;
    gapCreditedRef.current = 0;
    void startPedometer();

    // Native (iOS/Android in Capacitor): use background-geolocation. This is
    // the ONLY place we trigger the "Always Allow" prompt — never at app launch.
    if (isNativePlatform()) {
      try {
        nativeUnsubRef.current = onLocationFix((fix: LocationFix) => {
          handleFix(
            fix.coord,
            fix.altitude,
            fix.altitudeAccuracy,
            fix.accuracy,
            fix.speed,
            fix.timestamp,
          );
        });
        const unsubscribeError = onTrackingError((message) => {
          setPermError(message);
        });
        const started = await startTracking();
        if (started) {
          setTrackingSource("native");
          nativeErrorUnsubRef.current = unsubscribeError;
          return true;
        }
        unsubscribeError();
        // If native start failed (plugin missing, perm denied), unsubscribe
        // and fall through to the web watcher so the user still gets tracking.
        nativeUnsubRef.current?.();
        nativeUnsubRef.current = null;
      } catch {
        nativeErrorUnsubRef.current?.();
        nativeErrorUnsubRef.current = null;
        nativeUnsubRef.current?.();
        nativeUnsubRef.current = null;
      }
    }

    // Web fallback (or native fallback) — When-In-Use only.
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setPermError("Geolocation is not supported on this device.");
      return false;
    }
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        handleFix(
          [pos.coords.longitude, pos.coords.latitude],
          pos.coords.altitude,
          pos.coords.altitudeAccuracy,
          pos.coords.accuracy,
          pos.coords.speed,
          pos.timestamp,
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

  const nativeErrorUnsubRef = useRef<(() => void) | null>(null);

  const endWatch = () => {
    if (watchIdRef.current != null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (nativeUnsubRef.current) {
      nativeUnsubRef.current();
      nativeUnsubRef.current = null;
    }
    if (nativeErrorUnsubRef.current) {
      nativeErrorUnsubRef.current();
      nativeErrorUnsubRef.current = null;
    }
    void stopTracking();
    void stopPedometer();
    lastFixRef.current = null;
    lastAltRef.current = null;
    kalmanRef.current = new GpsKalman();
    pedoBaselineRef.current = null;
    gapCreditedRef.current = 0;
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
    // Kick the Dynamic Island / lock-screen Live Activity off immediately so
    // it's already up before the phone gets pocketed.
    void startLiveActivity({
      distanceMeters: 0,
      elapsedSeconds: 0,
      paceSecondsPerMile: 0,
      status: "running",
    });
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
    kalmanRef.current = new GpsKalman();
    pedoBaselineRef.current = null;
    gapCreditedRef.current = 0;
    setCoords([]);
    setCoordTimes([]);
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

      // Snap the recorded trace to the road/path network so the saved map
      // clings to streets instead of the pocket-GPS zig-zag.
      let finalCoords: Coord[] = coords;
      let finalDistance = distance;
      try {
        const snapped = await mapMatchTrace({ data: { coordinates: coords } });
        if (snapped.matched && snapped.coordinates.length > 1) {
          finalCoords = snapped.coordinates as Coord[];
          // Only trust the matched distance when it's in the same ballpark as
          // the GPS-measured distance (guards against a bad match shortcut).
          const d = snapped.distance_meters;
          if (d > 0 && distance > 0 && d / distance > 0.7 && d / distance < 1.3) {
            finalDistance = d;
          }
        }
      } catch {
        // Non-fatal — keep the raw trace
      }

      // Refine elevation gain via Mapbox terrain (more accurate than phone GPS altitude)
      let finalElev = elevationGain;
      try {
        const elev = await computeElevationGain({ data: { coordinates: finalCoords } });
        if (elev.elevation_gain_meters > 0) finalElev = elev.elevation_gain_meters;
      } catch {
        // Non-fatal, fall back to live GPS-derived gain
      }

      let routeId: string | null = followingRouteId ?? null;
      if (!followingRouteId && saveAsRoute) {
        if (!routeName.trim()) throw new Error("Give the saved route a name");
        const { data: routeRow, error: rErr } = await supabase
          .from("routes")
          .insert({
            user_id: userId,
            name: routeName.trim(),
            description: null,
            coordinates: finalCoords,
            distance_meters: finalDistance,
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
        distance_meters: finalDistance,
        duration_seconds: elapsed,
        elevation_gain_meters: finalElev,
        visibility,
        notes: notes.trim() || null,
        coordinates: finalCoords,
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
            <RunSummary
              coords={coords}
              coordTimes={coordTimes}
              distance={distance}
              elapsed={elapsed}
              elevationGain={elevationGain}
              title={routeName}
            />

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

            {!followingRouteId && (
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
            )}

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
