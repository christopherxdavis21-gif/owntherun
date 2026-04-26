import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Target } from "lucide-react";
import { formatDistance, formatDuration, formatElevation } from "@/lib/format";

export type ChallengeMetric =
  | "distance_meters"
  | "elevation_meters"
  | "runs_count"
  | "streak_days"
  | "duration_seconds";

type Props = {
  title: string;
  description?: string | null;
  metric: ChallengeMetric;
  target: number;
  progress: number;
  endsAt: string;
  joined: boolean;
  completed: boolean;
  onJoin?: () => void;
  onLeave?: () => void;
  scopeBadge?: string;
};

function formatMetric(metric: ChallengeMetric, value: number): string {
  switch (metric) {
    case "distance_meters":
      return formatDistance(value);
    case "elevation_meters":
      return formatElevation(value);
    case "duration_seconds":
      return formatDuration(Math.round(value));
    case "runs_count":
      return `${Math.round(value)} runs`;
    case "streak_days":
      return `${Math.round(value)} days`;
  }
}

export function ChallengeCard({
  title,
  description,
  metric,
  target,
  progress,
  endsAt,
  joined,
  completed,
  onJoin,
  onLeave,
  scopeBadge,
}: Props) {
  const pct = Math.min(100, Math.round((progress / target) * 100));
  const daysLeft = Math.max(
    0,
    Math.ceil((new Date(endsAt).getTime() - Date.now()) / 86400000),
  );

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            <p className="font-display text-base font-bold">{title}</p>
            {scopeBadge && (
              <span className="font-mono-num rounded bg-surface px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                {scopeBadge}
              </span>
            )}
          </div>
          {description && (
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          )}
        </div>
        {completed ? (
          <span className="font-mono-num rounded bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">
            DONE
          </span>
        ) : (
          <span className="font-mono-num text-[10px] text-muted-foreground">
            {daysLeft}D LEFT
          </span>
        )}
      </div>

      {joined && (
        <div className="mt-3 space-y-1">
          <Progress value={pct} className="h-2" />
          <div className="font-mono-num flex justify-between text-[11px] text-muted-foreground">
            <span>{formatMetric(metric, progress)}</span>
            <span>{formatMetric(metric, target)}</span>
          </div>
        </div>
      )}
      {!joined && (
        <div className="mt-3 text-xs text-muted-foreground">
          Goal: <span className="text-foreground font-medium">{formatMetric(metric, target)}</span>
        </div>
      )}

      <div className="mt-3 flex gap-2">
        {!joined && onJoin && (
          <Button size="sm" onClick={onJoin} className="flex-1">
            Join challenge
          </Button>
        )}
        {joined && !completed && onLeave && (
          <Button size="sm" variant="outline" onClick={onLeave} className="flex-1">
            Leave
          </Button>
        )}
      </div>
    </div>
  );
}
