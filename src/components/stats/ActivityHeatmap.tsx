import { useMemo } from "react";
import { metersToMiles } from "@/lib/format";

type Run = { ran_at: string; distance_meters: number };

export function ActivityHeatmap({ runs }: { runs: Run[] }) {
  const days = useMemo(() => {
    const map = new Map<string, number>();
    runs.forEach((r) => {
      const key = new Date(r.ran_at).toISOString().slice(0, 10);
      map.set(key, (map.get(key) ?? 0) + Number(r.distance_meters));
    });
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(today);
    start.setDate(start.getDate() - 363);
    // Align to Monday-start week
    const dow = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - dow);

    const cells: { date: string; miles: number }[] = [];
    const cur = new Date(start);
    while (cur <= today) {
      const k = cur.toISOString().slice(0, 10);
      cells.push({ date: k, miles: metersToMiles(map.get(k) ?? 0) });
      cur.setDate(cur.getDate() + 1);
    }
    return cells;
  }, [runs]);

  // Group into weeks (columns)
  const weeks: { date: string; miles: number }[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  function bg(miles: number) {
    if (miles <= 0) return "bg-surface";
    if (miles < 2) return "bg-primary/20";
    if (miles < 5) return "bg-primary/40";
    if (miles < 10) return "bg-primary/70";
    return "bg-primary";
  }

  return (
    <div className="overflow-x-auto">
      <div className="inline-flex gap-[3px] py-1">
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-[3px]">
            {week.map((d) => (
              <div
                key={d.date}
                title={`${d.date} — ${d.miles.toFixed(1)} mi`}
                className={`h-[10px] w-[10px] rounded-[2px] ${bg(d.miles)}`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
