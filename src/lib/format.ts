const METERS_PER_MILE = 1609.344;

export function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function parseDuration(input: string): number {
  // Accepts "mm:ss" or "hh:mm:ss"
  const parts = input.split(":").map((p) => parseInt(p, 10));
  if (parts.some(isNaN)) return 0;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

export function formatDistance(meters: number): string {
  const miles = meters / METERS_PER_MILE;
  return `${miles.toFixed(2)} mi`;
}

export function formatPace(meters: number, seconds: number): string {
  if (meters <= 0 || seconds <= 0) return "—";
  const miles = meters / METERS_PER_MILE;
  const paceSecPerMile = seconds / miles;
  const m = Math.floor(paceSecPerMile / 60);
  const s = Math.round(paceSecPerMile % 60);
  return `${m}:${s.toString().padStart(2, "0")} /mi`;
}

// Format a clan tag prefix like "[NYC] " or "" if none
export function formatClanTag(tag?: string | null): string {
  if (!tag) return "";
  return `[${tag.toUpperCase()}] `;
}

// Haversine distance between two [lng, lat] points in meters
export function haversineMeters(a: [number, number], b: [number, number]): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function totalDistance(coords: Array<[number, number]>): number {
  let total = 0;
  for (let i = 1; i < coords.length; i++) total += haversineMeters(coords[i - 1], coords[i]);
  return total;
}
