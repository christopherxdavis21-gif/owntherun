import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Share2, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
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

type CardKind = "route" | "transparent" | "stats" | "badge";

interface CardDef {
  key: CardKind;
  label: string;
  render: (ctx: CanvasRenderingContext2D, opts: RenderOpts) => void;
  transparent?: boolean;
}

interface RenderOpts {
  coords: Coord[];
  distance: number;
  elapsed: number;
  elevationGain: number;
  title: string;
  W: number;
  H: number;
}

/**
 * Post-run summary screen. Shows splits + a swipeable share-card carousel
 * (route map / transparent / stats / badge) modeled on the Strava share UX.
 * Each card renders to a 1080x1920 canvas at share-time.
 */
export function RunSummary({ coords, coordTimes, distance, elapsed, elevationGain, title }: Props) {
  const [busy, setBusy] = useState(false);
  const [index, setIndex] = useState(0);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const unit = getUnit();
  const splitDist = unit === "km" ? METERS_PER_KM : METERS_PER_MILE;
  const splitLabel = unit === "km" ? "km" : "mi";

  const splits = useMemo(
    () => computeSplits(coords, coordTimes, elapsed, splitDist),
    [coords, coordTimes, elapsed, splitDist],
  );

  const cards: CardDef[] = useMemo(
    () => [
      { key: "route", label: "Route", render: renderRouteCard },
      { key: "transparent", label: "Transparent", render: renderTransparentCard, transparent: true },
      { key: "stats", label: "Stats", render: renderStatsCard },
      { key: "badge", label: "Distance", render: renderBadgeCard, transparent: true },
    ],
    [],
  );

  // Sync the index when the user swipes the carousel
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const handler = () => {
      const i = Math.round(el.scrollLeft / el.clientWidth);
      if (i !== index) setIndex(i);
    };
    el.addEventListener("scroll", handler, { passive: true });
    return () => el.removeEventListener("scroll", handler);
  }, [index]);

  const goTo = (i: number) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  };

  const handleShare = async () => {
    setBusy(true);
    try {
      const card = cards[index];
      const blob = await renderShareCard(card, {
        coords,
        distance,
        elapsed,
        elevationGain,
        title: title || "Own The Run",
      });
      if (!blob) throw new Error("Could not generate share image");

      const fileName = `otr-${card.key}.png`;
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
          <h2 className="font-display text-2xl font-black tracking-tight">Nice work.</h2>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <SummaryStat label="Distance" value={formatDistance(distance)} />
        <SummaryStat label="Time" value={formatDuration(elapsed)} />
        <SummaryStat label="Avg pace" value={formatPace(distance, elapsed)} />
        <SummaryStat label="Elevation" value={formatElevation(elevationGain)} />
      </div>

      {/* Share carousel */}
      <div className="space-y-3">
        <p className="eyebrow text-muted-foreground">Share activity</p>
        <div className="relative">
          <div
            ref={trackRef}
            className="flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {cards.map((card) => (
              <div
                key={card.key}
                className="relative aspect-[9/16] w-full max-w-[260px] shrink-0 snap-center overflow-hidden rounded-2xl border border-border bg-black"
              >
                <CardPreview card={card} coords={coords} distance={distance} elapsed={elapsed} elevationGain={elevationGain} title={title || "Own The Run"} />
              </div>
            ))}
          </div>

          {cards.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => goTo(Math.max(0, index - 1))}
                className="absolute left-1 top-1/2 hidden -translate-y-1/2 rounded-full bg-black/50 p-1.5 text-white sm:block disabled:opacity-30"
                disabled={index === 0}
                aria-label="Previous card"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => goTo(Math.min(cards.length - 1, index + 1))}
                className="absolute right-1 top-1/2 hidden -translate-y-1/2 rounded-full bg-black/50 p-1.5 text-white sm:block disabled:opacity-30"
                disabled={index === cards.length - 1}
                aria-label="Next card"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </>
          )}
        </div>

        <div className="flex items-center justify-center gap-1.5">
          {cards.map((c, i) => (
            <button
              key={c.key}
              type="button"
              onClick={() => goTo(i)}
              className={`h-1.5 rounded-full transition-all ${i === index ? "w-6 bg-primary" : "w-1.5 bg-muted"}`}
              aria-label={`Show ${c.label}`}
            />
          ))}
        </div>

        <Button onClick={handleShare} disabled={busy || coords.length < 2} className="w-full gap-1.5">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
          Share {cards[index]?.label}
        </Button>
        <p className="text-center text-[11px] text-muted-foreground">1080×1920 PNG · Instagram-story aspect</p>
      </div>

      {splits.length > 0 && (
        <div className="rounded-xl border border-border bg-surface/40 p-3">
          <div className="eyebrow mb-2 text-muted-foreground">Splits / {splitLabel}</div>
          <div className="space-y-1">
            {splits.map((s, i) => (
              <div key={i} className="flex items-center gap-3 font-mono-num text-xs tabular-nums">
                <span className="w-6 text-muted-foreground">{i + 1}</span>
                <div className="relative h-2 flex-1 overflow-hidden rounded bg-muted">
                  <div className="h-full bg-primary" style={{ width: `${s.barPct}%` }} />
                </div>
                <span className="w-14 text-right">{formatSplitPace(s.seconds)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
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

// ---------- Carousel preview (renders the chosen card to an inline canvas) ----------

function CardPreview({
  card,
  coords,
  distance,
  elapsed,
  elevationGain,
  title,
}: {
  card: CardDef;
  coords: Coord[];
  distance: number;
  elapsed: number;
  elevationGain: number;
  title: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const W = 540;
    const H = 960;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    card.render(ctx, { coords, distance, elapsed, elevationGain, title, W, H });
  }, [card, coords, distance, elapsed, elevationGain, title]);

  return (
    <>
      {card.transparent && (
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(45deg, #2a2a2a 25%, transparent 25%), linear-gradient(-45deg, #2a2a2a 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #2a2a2a 75%), linear-gradient(-45deg, transparent 75%, #2a2a2a 75%)",
            backgroundSize: "20px 20px",
            backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0",
            backgroundColor: "#1a1a1a",
          }}
        />
      )}
      <canvas ref={canvasRef} className="relative h-full w-full object-cover" />
      {card.transparent && (
        <div className="absolute left-2 top-2 rounded border border-white/40 bg-black/40 px-2 py-0.5 font-mono-num text-[9px] font-bold tracking-wider text-white">
          TRANSPARENT
        </div>
      )}
    </>
  );
}

// ---------- splits ----------

interface Split {
  seconds: number;
  barPct: number;
}

function computeSplits(
  coords: Coord[],
  coordTimes: number[] | undefined,
  elapsed: number,
  splitDist: number,
): Split[] {
  if (coords.length < 2 || elapsed <= 0) return [];

  let total = 0;
  const cum: number[] = [0];
  for (let i = 1; i < coords.length; i++) {
    total += haversineMeters(coords[i - 1], coords[i]);
    cum.push(total);
  }
  if (total < splitDist * 0.5) return [];

  const haveTimes = !!coordTimes && coordTimes.length === coords.length && coordTimes.length > 1;
  const t0 = haveTimes ? coordTimes![0] : 0;
  const tLast = haveTimes ? coordTimes![coordTimes!.length - 1] : 0;
  const tSpan = haveTimes ? Math.max(1, tLast - t0) : 0;
  const elapsedAt = (i: number): number => {
    if (haveTimes) return ((coordTimes![i] - t0) / tSpan) * elapsed;
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
    barPct: max === min ? 100 : Math.max(15, 100 - ((s - min) / (max - min)) * 70),
  }));
}

function formatSplitPace(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ---------- shared canvas helpers ----------

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawRoute(ctx: CanvasRenderingContext2D, coords: Coord[], x: number, y: number, w: number, h: number, color = "#4ade80") {
  if (coords.length < 2) return;
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const [lng, lat] of coords) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  const dLng = Math.max(1e-6, maxLng - minLng);
  const dLat = Math.max(1e-6, maxLat - minLat);
  const scale = Math.min(w / dLng, h / dLat);
  const cx = x + w / 2;
  const cy = y + h / 2;
  const midLng = (minLng + maxLng) / 2;
  const midLat = (minLat + maxLat) / 2;

  const project = ([lng, lat]: Coord): [number, number] => [
    cx + (lng - midLng) * scale,
    cy - (lat - midLat) * scale,
  ];

  // Glow underlayer
  ctx.lineWidth = 22 * (w / 800);
  ctx.strokeStyle = color === "#4ade80" ? "rgba(76,217,123,0.25)" : "rgba(255,255,255,0.2)";
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  coords.forEach((c, i) => {
    const [px, py] = project(c);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();

  ctx.lineWidth = 8 * (w / 800);
  ctx.strokeStyle = color;
  ctx.beginPath();
  coords.forEach((c, i) => {
    const [px, py] = project(c);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();

  const start = project(coords[0]);
  const end = project(coords[coords.length - 1]);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(start[0], start[1], 14 * (w / 800), 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(end[0], end[1], 14 * (w / 800), 0, Math.PI * 2);
  ctx.fill();
}

function dateString(): string {
  return new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

// ---------- card renderers (1080x1920 for full export; preview at 540x960) ----------

function renderRouteCard(ctx: CanvasRenderingContext2D, opts: RenderOpts) {
  const { W, H, coords, distance, elapsed, elevationGain } = opts;
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#0a0e0c");
  bg.addColorStop(1, "#000000");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = "rgba(80,255,160,0.04)";
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 60 * (W / 1080)) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }

  const scale = W / 1080;
  ctx.fillStyle = "#a3ffb8";
  ctx.font = `700 ${36 * scale}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = "left";
  ctx.fillText("OWN THE RUN", 80 * scale, 130 * scale);

  ctx.fillStyle = "#ffffff";
  ctx.font = `900 ${72 * scale}px system-ui, -apple-system, sans-serif`;
  ctx.fillText(dateString(), 80 * scale, 220 * scale);

  const mapTop = 280 * scale;
  const mapH = 900 * scale;
  const mapPad = 80 * scale;
  ctx.fillStyle = "rgba(255,255,255,0.03)";
  roundRect(ctx, 60 * scale, mapTop, W - 120 * scale, mapH, 32 * scale);
  ctx.fill();

  drawRoute(ctx, coords, 60 * scale + mapPad, mapTop + mapPad, W - 120 * scale - mapPad * 2, mapH - mapPad * 2);

  const statsTop = mapTop + mapH + 80 * scale;
  const cellW = (W - 120 * scale) / 2;
  const cellH = 200 * scale;
  const stats: Array<[string, string]> = [
    ["DISTANCE", formatDistance(distance)],
    ["TIME", formatDuration(elapsed)],
    ["AVG PACE", formatPace(distance, elapsed)],
    ["ELEVATION", formatElevation(elevationGain)],
  ];
  stats.forEach((s, i) => {
    const x = 60 * scale + (i % 2) * cellW;
    const y = statsTop + Math.floor(i / 2) * cellH;
    ctx.fillStyle = "rgba(255,255,255,0.03)";
    roundRect(ctx, x + 10 * scale, y + 10 * scale, cellW - 20 * scale, cellH - 20 * scale, 24 * scale);
    ctx.fill();
    ctx.fillStyle = "#7c8a82";
    ctx.font = `600 ${24 * scale}px system-ui, -apple-system, sans-serif`;
    ctx.fillText(s[0], x + 40 * scale, y + 70 * scale);
    ctx.fillStyle = "#ffffff";
    ctx.font = `900 ${64 * scale}px system-ui, -apple-system, sans-serif`;
    ctx.fillText(s[1], x + 40 * scale, y + 150 * scale);
  });

  ctx.fillStyle = "rgba(163,255,184,0.85)";
  ctx.font = `700 ${28 * scale}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText("owntherun.app", W / 2, H - 80 * scale);
}

function renderTransparentCard(ctx: CanvasRenderingContext2D, opts: RenderOpts) {
  const { W, H, coords, distance, elapsed } = opts;
  const scale = W / 1080;

  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = 18 * scale;
  ctx.shadowOffsetY = 3 * scale;

  // Centered route line — primary brand color, like Strava's orange but our green
  drawRoute(ctx, coords, 200 * scale, 320 * scale, W - 400 * scale, H * 0.55, "#4ade80");

  // Big brand wordmark below the route
  ctx.fillStyle = "#ffffff";
  ctx.font = `900 ${110 * scale}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText("OWN THE RUN", W / 2, H * 0.78);

  // Stat row
  const row = H * 0.88;
  const labels: Array<[string, string]> = [
    ["Distance", formatDistance(distance)],
    ["Pace", formatPace(distance, elapsed)],
    ["Time", formatDuration(elapsed)],
  ];
  const colW = W / 3;
  labels.forEach(([label, value], i) => {
    const x = i * colW + colW / 2;
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.font = `500 ${28 * scale}px system-ui, -apple-system, sans-serif`;
    ctx.fillText(label, x, row);
    ctx.fillStyle = "#ffffff";
    ctx.font = `900 ${64 * scale}px system-ui, -apple-system, sans-serif`;
    ctx.fillText(value, x, row + 70 * scale);
  });

  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
}

function renderStatsCard(ctx: CanvasRenderingContext2D, opts: RenderOpts) {
  const { W, H, distance, elapsed, elevationGain } = opts;
  const scale = W / 1080;

  // Bold green background — stats-only card
  ctx.fillStyle = "#0a0e0c";
  ctx.fillRect(0, 0, W, H);

  const bg = ctx.createRadialGradient(W / 2, H * 0.4, 50 * scale, W / 2, H * 0.4, W * 0.9);
  bg.addColorStop(0, "rgba(76,217,123,0.18)");
  bg.addColorStop(1, "rgba(76,217,123,0)");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "#a3ffb8";
  ctx.font = `700 ${42 * scale}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText("OWN THE RUN", W / 2, 140 * scale);

  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = `600 ${32 * scale}px system-ui, -apple-system, sans-serif`;
  ctx.fillText(dateString(), W / 2, 200 * scale);

  // Hero number — distance
  ctx.fillStyle = "#ffffff";
  ctx.font = `900 ${260 * scale}px system-ui, -apple-system, sans-serif`;
  ctx.fillText(formatDistance(distance), W / 2, H * 0.5);

  ctx.fillStyle = "#a3ffb8";
  ctx.font = `700 ${44 * scale}px system-ui, -apple-system, sans-serif`;
  ctx.fillText("DISTANCE", W / 2, H * 0.5 + 70 * scale);

  // Sub stats
  const row = H * 0.78;
  const stats: Array<[string, string]> = [
    ["TIME", formatDuration(elapsed)],
    ["PACE", formatPace(distance, elapsed)],
    ["ELEV", formatElevation(elevationGain)],
  ];
  const colW = W / 3;
  stats.forEach(([label, value], i) => {
    const x = i * colW + colW / 2;
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = `600 ${28 * scale}px system-ui, -apple-system, sans-serif`;
    ctx.fillText(label, x, row);
    ctx.fillStyle = "#ffffff";
    ctx.font = `900 ${68 * scale}px system-ui, -apple-system, sans-serif`;
    ctx.fillText(value, x, row + 80 * scale);
  });

  ctx.fillStyle = "rgba(163,255,184,0.85)";
  ctx.font = `700 ${28 * scale}px system-ui, -apple-system, sans-serif`;
  ctx.fillText("owntherun.app", W / 2, H - 80 * scale);
}

function renderBadgeCard(ctx: CanvasRenderingContext2D, opts: RenderOpts) {
  const { W, H, distance, elapsed } = opts;
  const scale = W / 1080;

  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = 16 * scale;
  ctx.shadowOffsetY = 2 * scale;

  // Sun-ray "achievement" graphic
  const cx = W / 2;
  const cy = H * 0.32;
  const r = 130 * scale;
  ctx.strokeStyle = "#a3ffb8";
  ctx.lineWidth = 8 * scale;
  ctx.lineCap = "round";
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const x1 = cx + Math.cos(a) * (r + 30 * scale);
    const y1 = cy + Math.sin(a) * (r + 30 * scale);
    const x2 = cx + Math.cos(a) * (r + 90 * scale);
    const y2 = cy + Math.sin(a) * (r + 90 * scale);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  ctx.fillStyle = "#4ade80";
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  // Trophy emoji-ish glyph (uses a simple bold "T" since canvas emoji is unreliable)
  ctx.fillStyle = "#000000";
  ctx.font = `900 ${140 * scale}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("★", cx, cy + 6 * scale);
  ctx.textBaseline = "alphabetic";

  // Label
  ctx.fillStyle = "#ffffff";
  ctx.font = `900 ${110 * scale}px system-ui, -apple-system, sans-serif`;
  ctx.fillText(distanceTier(distance), W / 2, H * 0.58);

  // Big time
  ctx.fillStyle = "#ffffff";
  ctx.font = `900 ${180 * scale}px system-ui, -apple-system, sans-serif`;
  ctx.fillText(formatDuration(elapsed), W / 2, H * 0.7);

  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = `700 ${56 * scale}px system-ui, -apple-system, sans-serif`;
  ctx.fillText(formatPace(distance, elapsed), W / 2, H * 0.76);

  ctx.fillStyle = "#ffffff";
  ctx.font = `900 ${72 * scale}px system-ui, -apple-system, sans-serif`;
  ctx.fillText("OWN THE RUN", W / 2, H * 0.88);

  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
}

function distanceTier(meters: number): string {
  const km = meters / 1000;
  if (km >= 42) return "MARATHON";
  if (km >= 21) return "HALF";
  if (km >= 10) return "10K";
  if (km >= 5) return "5K";
  if (meters >= 1609) return "MILE+";
  return "RUN";
}

// ---------- export ----------

async function renderShareCard(card: CardDef, base: Omit<RenderOpts, "W" | "H">): Promise<Blob | null> {
  const W = 1080;
  const H = 1920;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  if (!card.transparent) {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
  }
  card.render(ctx, { ...base, W, H });
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
}
