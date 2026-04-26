import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { formatDistance } from "@/lib/format";
import { Plus, MapPin, Lock, Globe } from "lucide-react";

type RouteRow = {
  id: string;
  name: string;
  description: string | null;
  distance_meters: number;
  is_public: boolean;
  user_id: string;
  created_at: string;
};

export const Route = createFileRoute("/routes/")({
  head: () => ({
    meta: [
      { title: "Routes — Catch Up" },
      { name: "description", content: "Browse and manage your running routes." },
    ],
  }),
  component: RoutesIndex,
});

function RoutesIndex() {
  const [tab, setTab] = useState<"mine" | "discover">("mine");
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    const query = supabase
      .from("routes")
      .select("id, name, description, distance_meters, is_public, user_id, created_at")
      .order("created_at", { ascending: false });

    const finalQuery =
      tab === "mine" ? query.eq("user_id", userId) : query.eq("is_public", true);

    finalQuery.then(({ data }) => {
      setRoutes((data as RouteRow[]) ?? []);
      setLoading(false);
    });
  }, [tab, userId]);

  return (
    <AppShell>
      <div className="mb-6 flex items-end justify-between">
        <div>
          <p className="eyebrow text-primary">Routes</p>
          <h1 className="font-display text-4xl font-black tracking-tight">Your running library</h1>
        </div>
        <Link to="/routes/new" className="hidden sm:block">
          <Button>
            <Plus className="mr-1.5 h-4 w-4" /> New route
          </Button>
        </Link>
      </div>

      <div className="mb-5 flex gap-1 rounded-lg border border-border bg-surface/50 p-1 w-fit">
        {(["mine", "discover"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
              tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "mine" ? "My routes" : "Discover"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="font-mono-num text-sm text-muted-foreground">LOADING…</div>
      ) : routes.length === 0 ? (
        <EmptyState tab={tab} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {routes.map((r) => (
            <Link
              key={r.id}
              to="/routes/$routeId"
              params={{ routeId: r.id }}
              className="group rounded-2xl border border-border bg-card p-5 transition-all hover:border-primary/50 hover:shadow-glow"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-display text-lg font-bold leading-tight group-hover:text-primary">
                  {r.name}
                </h3>
                <span className="text-muted-foreground">
                  {r.is_public ? <Globe className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                </span>
              </div>
              {r.description && (
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{r.description}</p>
              )}
              <div className="mt-4 flex items-center justify-between text-sm">
                <span className="font-mono-num text-primary text-base font-semibold">
                  {formatDistance(r.distance_meters)}
                </span>
                <span className="flex items-center gap-1 text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" />
                  Route
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}

function EmptyState({ tab }: { tab: "mine" | "discover" }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-surface/30 p-12 text-center">
      <p className="font-display text-2xl font-bold">
        {tab === "mine" ? "No routes yet" : "Nothing to discover yet"}
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        {tab === "mine"
          ? "Map your first route in under a minute."
          : "When other runners share routes, they'll show up here."}
      </p>
      {tab === "mine" && (
        <Link to="/routes/new" className="mt-5 inline-block">
          <Button>
            <Plus className="mr-1.5 h-4 w-4" /> Create a route
          </Button>
        </Link>
      )}
    </div>
  );
}
