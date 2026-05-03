import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ArrowRight, MapIcon, Timer, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      throw redirect({ to: "/feed" });
    }
  },
  head: () => ({
    meta: [
      { title: "Catch Up — Race your friends. Beat your ghost." },
      {
        name: "description",
        content:
          "Map running routes, log every run, and climb the leaderboards. Catch Up is the competitive running app for people who love the chase.",
      },
      { property: "og:title", content: "Catch Up — Race your friends. Beat your ghost." },
      {
        property: "og:description",
        content: "Map routes, log runs, and chase the top of every leaderboard.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="bg-hero min-h-screen">
      {/* Nav */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary">
            <span className="font-display text-xl font-black text-primary-foreground">C</span>
          </div>
          <span className="font-display text-xl font-bold tracking-tight">Catch Up</span>
        </div>
        <Link to="/auth">
          <Button variant="ghost" size="sm">
            Sign in
          </Button>
        </Link>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-12 md:pb-32 md:pt-20">
        <p className="eyebrow text-primary">Competitive running, finally fun</p>
        <h1 className="font-display mt-4 text-5xl font-black leading-[0.95] tracking-tighter md:text-7xl lg:text-8xl">
          Race your friends.
          <br />
          <span className="text-primary">Beat your ghost.</span>
        </h1>
        <p className="mt-6 max-w-xl text-lg text-muted-foreground md:text-xl">
          Map your favorite routes, log every run, and climb leaderboards against
          everyone else who's run the same path. The chase never stops.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link to="/auth">
            <Button size="lg" className="gap-2">
              Start running <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>

        {/* Feature grid */}
        <div className="mt-20 grid gap-4 md:grid-cols-3">
          <Feature
            icon={<MapIcon className="h-5 w-5" />}
            title="Map any route"
            body="Tap to drop pins on the map and shape the exact route you want to run."
          />
          <Feature
            icon={<Timer className="h-5 w-5" />}
            title="Log every run"
            body="Pick a route, drop your time, and watch your splits stack up over weeks."
          />
          <Feature
            icon={<Trophy className="h-5 w-5" />}
            title="Climb the boards"
            body="Every shared route has a leaderboard. Catch the runner above you."
          />
        </div>
      </section>
    </div>
  );
}

function Feature({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface/50 p-6 backdrop-blur-sm transition-colors hover:border-primary/40">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </div>
      <h3 className="font-display mt-4 text-xl font-bold">{title}</h3>
      <p className="mt-1.5 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
