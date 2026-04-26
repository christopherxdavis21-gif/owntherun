import { iconFor, TIER_LABEL, TIER_RING, type AchievementTier } from "@/lib/trophy";

type Props = {
  title: string;
  description: string;
  tier: AchievementTier;
  icon: string;
  earned: boolean;
  earnedAt?: string | null;
};

export function TrophyCard({ title, description, tier, icon, earned, earnedAt }: Props) {
  const Icon = iconFor(icon);
  return (
    <div
      className={`rounded-2xl border p-4 transition ${
        earned
          ? "border-border bg-card"
          : "border-dashed border-border/60 bg-surface/30 opacity-60"
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ring-2 ${
            earned ? TIER_RING[tier] : "ring-border bg-surface text-muted-foreground"
          }`}
        >
          <Icon className="h-6 w-6" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-display text-base font-bold leading-tight">{title}</p>
          </div>
          <p className="font-mono-num text-[10px] uppercase tracking-wider text-muted-foreground">
            {TIER_LABEL[tier]}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          {earned && earnedAt && (
            <p className="font-mono-num mt-1 text-[10px] text-primary">
              EARNED {new Date(earnedAt).toLocaleDateString()}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
