import { getUnit } from "./units";

const METERS_PER_MILE = 1609.344;
const METERS_PER_KM = 1000;

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
  const unit = getUnit();
  if (unit === "km") return `${(meters / METERS_PER_KM).toFixed(2)} km`;
  return `${(meters / METERS_PER_MILE).toFixed(2)} mi`;
}

export function formatPace(meters: number, seconds: number): string {
  if (meters <= 0 || seconds <= 0) return "—";
  const unit = getUnit();
  const denom = unit === "km" ? meters / METERS_PER_KM : meters / METERS_PER_MILE;
  const paceSec = seconds / denom;
  const m = Math.floor(paceSec / 60);
  const s = Math.round(paceSec % 60);
  return `${m}:${s.toString().padStart(2, "0")} /${unit}`;
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

export function metersToMiles(m: number): number {
  return m / METERS_PER_MILE;
}

export function formatElevation(meters: number): string {
  if (getUnit() === "km") return `${Math.round(meters).toLocaleString()} m`;
  const ft = Math.round(meters * 3.28084);
  return `${ft.toLocaleString()} ft`;
}

export type AgeBucket =
  | "all"
  | "under18"
  | "18_27"
  | "28_34"
  | "35_44"
  | "45_54"
  | "55_64"
  | "65_74"
  | "75plus";

export function ageFromBirthdate(birthdate: string | null | undefined): number | null {
  if (!birthdate) return null;
  const b = new Date(birthdate);
  if (isNaN(b.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age;
}

export function ageInBucket(age: number | null, bucket: AgeBucket): boolean {
  if (bucket === "all") return true;
  if (age == null) return false;
  switch (bucket) {
    case "under18": return age < 18;
    case "18_27": return age >= 18 && age <= 27;
    case "28_34": return age >= 28 && age <= 34;
    case "35_44": return age >= 35 && age <= 44;
    case "45_54": return age >= 45 && age <= 54;
    case "55_64": return age >= 55 && age <= 64;
    case "65_74": return age >= 65 && age <= 74;
    case "75plus": return age >= 75;
  }
}

export type TimeFilter = "week" | "month" | "year" | "all";
export function windowStart(filter: TimeFilter): Date | null {
  if (filter === "all") return null;
  const d = new Date();
  if (filter === "week") {
    const day = d.getDay();
    const diff = (day + 6) % 7; // Monday-based
    d.setDate(d.getDate() - diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (filter === "month") return new Date(d.getFullYear(), d.getMonth(), 1);
  return new Date(d.getFullYear(), 0, 1);
}

export type DistanceFilter = "any" | "mile" | "5k" | "10k" | "half" | "marathon";
export function minMetersForDistanceFilter(f: DistanceFilter): number {
  switch (f) {
    case "any": return 0;
    case "mile": return METERS_PER_MILE;
    case "5k": return 5000;
    case "10k": return 10000;
    case "half": return 21097.5;
    case "marathon": return 42195;
  }
}

export type ActivityLabel = "established" | "low";
export function activityLabel(
  totalMiles: number,
  filter: TimeFilter,
): ActivityLabel {
  const threshold = filter === "week" ? 3 : filter === "month" ? 10 : 25;
  return totalMiles >= threshold ? "established" : "low";
}

export function ownershipThresholdMiles(filter: TimeFilter): number {
  return filter === "week" ? 3 : filter === "month" ? 10 : 25;
}
