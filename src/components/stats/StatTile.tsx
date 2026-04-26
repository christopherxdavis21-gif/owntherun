import type { LucideIcon } from "lucide-react";

type Props = {
  label: string;
  value: string;
  sub?: string;
  icon?: LucideIcon;
  accent?: boolean;
};

export function StatTile({ label, value, sub, icon: Icon, accent }: Props) {
  return (
    <div
      className={`rounded-2xl border p-4 ${
        accent ? "border-primary/40 bg-primary/5" : "border-border bg-card"
      }`}
    >
      <div className="flex items-center gap-2">
        {Icon && <Icon className={`h-4 w-4 ${accent ? "text-primary" : "text-muted-foreground"}`} />}
        <p className="font-mono-num text-[10px] uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
      </div>
      <p
        className={`font-mono-num mt-2 text-2xl font-bold tabular-nums ${
          accent ? "text-primary" : "text-foreground"
        }`}
      >
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}
