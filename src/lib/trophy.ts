import {
  Trophy,
  Medal,
  Mountain,
  Flame,
  Zap,
  Sparkles,
  Route,
  type LucideIcon,
} from "lucide-react";

export type AchievementTier = "bronze" | "silver" | "gold" | "platinum";

export const TIER_RING: Record<AchievementTier, string> = {
  bronze: "ring-amber-700/50 bg-amber-700/10 text-amber-600",
  silver: "ring-slate-300/50 bg-slate-300/10 text-slate-300",
  gold: "ring-yellow-400/60 bg-yellow-400/10 text-yellow-400",
  platinum: "ring-cyan-300/60 bg-cyan-300/10 text-cyan-300",
};

export const TIER_LABEL: Record<AchievementTier, string> = {
  bronze: "Bronze",
  silver: "Silver",
  gold: "Gold",
  platinum: "Platinum",
};

const ICONS: Record<string, LucideIcon> = {
  trophy: Trophy,
  medal: Medal,
  mountain: Mountain,
  flame: Flame,
  zap: Zap,
  sparkles: Sparkles,
  route: Route,
};

export function iconFor(name: string): LucideIcon {
  return ICONS[name] ?? Trophy;
}
