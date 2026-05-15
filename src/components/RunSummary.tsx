import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Share2, Loader2, Download } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  formatDistance,
  formatDuration,
  formatPace,
  formatElevation,
  haversineMeters,
} from "@/lib/format";
import { getUnit } from "@/lib/units";
import { toast } from "sonner";

type Coord = [number, number];

interface Props {
  coords: Coord[];
  /** Per-fix epoch ms aligned with `coords`. Used for accurate split timing. */
  coordTimes?: number[];
  distance: number; // meters
  elapsed: number; // seconds
  elevationGain: number; // meters
  title?: string;
}

const METERS_PER_MILE = 1609.344;
const METERS_PER_KM = 1000;

/**
 * Post-run summary screen with stats, splits, and a shareable
 * 1080x1920 PNG card (Instagram-story aspect) generated client-side.
 */
export function RunSummary({ coords, coordTimes, distance, elapsed, elevationGain, title }: Props) {
  const [busy, setBusy] = useState(false);
  const [transparent, setTransparent] = useState(false);
  const unit = getUnit();
  const splitDist = unit === "km" ? METERS_PER_KM : METERS_PER_MILE;
  const splitLabel = unit === "km" ? "km" : "mi";

  const splits = useMemo(
    () => computeSplits(coords, coordTimes, elapsed, splitDist),
    [coords, coordTimes, elapsed, splitDist],
  );

  const handleShare = async () => {
    setBusy(true);
    try {
      const blob = await renderShareCard({
        coords,
        distance,
        elapsed,
        elevationGain,
        title: title || "Own The Run",
        transparent,
      });
      if (!blob) throw new Error("Could not generate share image");

      const fileName = transparent ? "otr-run-transparent.png" : "otr-run.png";
      const file = new File([blob], fileName, { type: "image/png" });
      const navAny = navigator as Navigator & {
        canShare?: (data: { files?: File[] }) => boolean;
      };
      if (navAny.canShare?.({ files: [file] }) && navigator.share) {
        await navigator.share({
          files: [file],
          title: "Own The Run",
          text: `${formatDistance(distance)} • ${formatDuration(elapsed)} • ${formatPace(distance, elapsed)}`,
        });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        toast.success("Share image downloaded");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Share failed";
      if (!/abort/i.test(msg)) toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 rounded-2xl border border-primary/30 bg-gradient-to-b from-primary/10 to-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow text-primary">Run complete</p>
          <h2 className="font-display text-2xl font-black tracking-tight">
            Nice work.
          </h2>
        </div>
        <Button
          onClick={handleShare}
          disabled={busy || coords.length < 2}
          size="sm"
          className="gap-1.5"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Share2 className="h-4 w-4" />
          )}
          Share
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <SummaryStat label="Distance" value={formatDistance(distance)} />
        <SummaryStat label="Time" value={formatDuration(elapsed)} />
        <SummaryStat label="Avg pace" value={formatPace(distance, elapsed)} />
        <SummaryStat label="Elevation" value={formatElevation(elevationGain)} />
      </div>

      {splits.length > 0 && (
        <div className="rounded-xl border border-border bg-surface/40 p-3">
          <div className="eyebrow mb-2 text-muted-foreground">Splits / {splitLabel}</div>
          <div className="space-y-1">
            {splits.map((s, i) => (
              <div
                key={i}
                className="flex items-center gap-3 font-mono-num text-xs tabular-nums"
              >
                <span className="w-6 text-muted-foreground">{i + 1}</span>
                <div className="relative h-2 flex-1 overflow-hidden rounded bg-muted">
                  <div
                    className="h-full bg-primary"
                    style={{ width: `${s.barPct}%` }}
                  />
                </div>
                <span className="w-14 text-right">{formatSplitPace(s.seconds)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        Share posts a 1080×1920 image (Instagram-story aspect) with your route and stats.
      </p>
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 text-center">
      <div className="eyebrow text-muted-foreground">{label}</div>
      <div className="font-mono-num mt-1 text-xl font-bold text-primary">{value}</div>
    </div>
  );
}

// ---------- splits ----------

interface Split {
  seconds: number; // pace seconds for this split
  barPct: number;
}

function computeSplits(
  coords: Coord[],
  coordTimes: number[] | undefined,
  elapsed: number,
  splitDist: number,
): Split[] {
  if (coords.length < 2 || elapsed <= 0) return [];

  // Cumulative distance per fix
  let total = 0;
  const cum: number[] = [0];
  for (let i = 1; i < coords.length; i++) {
    total += haversineMeters(coords[i - 1], coords[i]);
    cum.push(total);
  }
  if (total < splitDist * 0.5) return [];

  // Per-fix elapsed seconds. Prefer real timestamps when available so split
  // times reflect actual pace at each segment, not a uniform projection.
  const haveTimes = !!coordTimes && coordTimes.length === coords.length && coordTimes.length > 1;
  const t0 = haveTimes ? coordTimes![0] : 0;
  const tLast = haveTimes ? coordTimes![coordTimes!.length - 1] : 0;
  const tSpan = haveTimes ? Math.max(1, tLast - t0) : 0;
  const elapsedAt = (i: number): number => {
    if (haveTimes) {
      // Scale wall-clock deltas to total elapsed (handles paused time).
      return ((coordTimes![i] - t0) / tSpan) * elapsed;
    }
    return (i / (coords.length - 1)) * elapsed;
  };

  const splits: number[] = [];
  let prevTime = 0;
  let target = splitDist;
  while (target <= total) {
    let i = 1;
    while (i < cum.length && cum[i] < target) i++;
    if (i >= cum.length) break;
    const segLen = cum[i] - cum[i - 1] || 1;
    const frac = (target - cum[i - 1]) / segLen;
    const tA = elapsedAt(i - 1);
    const tB = elapsedAt(i);
    const time = tA + (tB - tA) * frac;
    splits.push(time - prevTime);
    prevTime = time;
    target += splitDist;
  }

  const remaining = total - (target - splitDist);
  if (remaining > splitDist * 0.25) {
    const time = elapsed - prevTime;
    splits.push(time * (splitDist / remaining));
  }

  if (splits.length === 0) return [];
  const max = Math.max(...splits);
  const min = Math.min(...splits);
  return splits.map((s) => ({
    seconds: s,
    barPct:
      max === min ? 100 : Math.max(15, 100 - ((s - min) / (max - min)) * 70),
  }));
}

function formatSplitPace(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ---------- canvas share card ----------

async function renderShareCard(opts: {
  coords: Coord[];
  distance: number;
  elapsed: number;
  elevationGain: number;
  title: string;
  transparent?: boolean;
}): Promise<Blob | null> {
  const W = 1080;
  const H = 1920;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  if (!opts.transparent) {
    // Background — deep gradient
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#0a0e0c");
    bg.addColorStop(1, "#000000");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Subtle grid texture
    ctx.strokeStyle = "rgba(80,255,160,0.04)";
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 60) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = 0; y < H; y += 60) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
  }
  // When transparent, leave the canvas clear so users can drop the PNG over
  // their own photo / story background and edit freely.

  // Header
  ctx.fillStyle = "#a3ffb8";
  ctx.font = "700 36px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("OWN THE RUN", 80, 130);

  ctx.fillStyle = "#ffffff";
  ctx.font = "900 72px system-ui, -apple-system, sans-serif";
  const dateStr = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
  ctx.fillText(dateStr, 80, 220);

  // Route map area
  const mapTop = 280;
  const mapH = 900;
  const mapPad = 80;

  // Card background for map
  ctx.fillStyle = "rgba(255,255,255,0.03)";
  roundRect(ctx, 60, mapTop, W - 120, mapH, 32);
  ctx.fill();

  drawRoute(ctx, opts.coords, 60 + mapPad, mapTop + mapPad, W - 120 - mapPad * 2, mapH - mapPad * 2);

  // Stats grid
  const statsTop = mapTop + mapH + 80;
  const cellW = (W - 120) / 2;
  const cellH = 200;
  const stats: Array<[string, string]> = [
    ["DISTANCE", formatDistance(opts.distance)],
    ["TIME", formatDuration(opts.elapsed)],
    ["AVG PACE", formatPace(opts.distance, opts.elapsed)],
    ["ELEVATION", formatElevation(opts.elevationGain)],
  ];
  stats.forEach((s, i) => {
    const x = 60 + (i % 2) * cellW;
    const y = statsTop + Math.floor(i / 2) * cellH;
    ctx.fillStyle = "rgba(255,255,255,0.03)";
    roundRect(ctx, x + 10, y + 10, cellW - 20, cellH - 20, 24);
    ctx.fill();

    ctx.fillStyle = "#7c8a82";
    ctx.font = "600 24px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(s[0], x + 40, y + 70);

    ctx.fillStyle = "#ffffff";
    ctx.font = "900 64px system-ui, -apple-system, sans-serif";
    ctx.fillText(s[1], x + 40, y + 150);
  });

  // Footer watermark
  ctx.fillStyle = "rgba(163,255,184,0.6)";
  ctx.font = "700 28px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("owntherun.app", W / 2, H - 80);

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawRoute(
  ctx: CanvasRenderingContext2D,
  coords: Coord[],
  x: number,
  y: number,
  w: number,
  h: number,
) {
  if (coords.length < 2) return;
  let minLng = Infinity,
    maxLng = -Infinity,
    minLat = Infinity,
    maxLat = -Infinity;
  for (const [lng, lat] of coords) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  const dLng = Math.max(1e-6, maxLng - minLng);
  const dLat = Math.max(1e-6, maxLat - minLat);
  // Preserve aspect using the larger axis
  const scale = Math.min(w / dLng, h / dLat);
  const cx = x + w / 2;
  const cy = y + h / 2;
  const midLng = (minLng + maxLng) / 2;
  const midLat = (minLat + maxLat) / 2;

  const project = ([lng, lat]: Coord): [number, number] => [
    cx + (lng - midLng) * scale,
    cy - (lat - midLat) * scale, // invert Y
  ];

  // Glow underlayer
  ctx.lineWidth = 22;
  ctx.strokeStyle = "rgba(76, 217, 123, 0.25)";
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  coords.forEach((c, i) => {
    const [px, py] = project(c);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();

  // Main neon line
  ctx.lineWidth = 8;
  ctx.strokeStyle = "#4ade80";
  ctx.beginPath();
  coords.forEach((c, i) => {
    const [px, py] = project(c);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();

  // Start / Finish dots
  const start = project(coords[0]);
  const end = project(coords[coords.length - 1]);
  ctx.fillStyle = "#4ade80";
  ctx.beginPath();
  ctx.arc(start[0], start[1], 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(end[0], end[1], 14, 0, Math.PI * 2);
  ctx.fill();
}

// Re-export icon for convenience (not strictly needed, kept for flexibility)
export { Download };
