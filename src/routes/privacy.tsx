import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Own The Run" },
      {
        name: "description",
        content:
          "How Own The Run collects, uses, and protects your location data, account information, and run history.",
      },
      { property: "og:title", content: "Privacy Policy — Own The Run" },
      {
        property: "og:description",
        content: "How Own The Run handles your location data and account information.",
      },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <div className="mx-auto min-h-screen max-w-3xl px-6 py-12 text-foreground">
      <Link to="/" className="text-sm text-primary hover:underline">
        ← Back to Own The Run
      </Link>
      <h1 className="font-display mt-6 text-4xl font-black tracking-tight">Privacy Policy</h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated: 26 April 2026</p>

      <div className="prose prose-invert mt-8 max-w-none space-y-6 text-sm leading-relaxed">
        <section>
          <h2 className="font-display text-xl font-bold">1. Who we are</h2>
          <p>
            Own The Run ("we", "us") is a run-tracking app that lets runners record routes,
            compare times, and compete on local leaderboards. This policy explains what
            we collect, why, and the rights you have over your data.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl font-bold">2. Data we collect</h2>
          <ul className="ml-5 list-disc space-y-2">
            <li>
              <strong>Account data</strong> — email address, display name, and optionally
              avatar, gender, birthdate, and clan tag. Used to create your account and
              show you on leaderboards.
            </li>
            <li>
              <strong>Location data</strong> — precise GPS coordinates while you are
              actively recording a run, including in the background if you grant
              "Always" permission. Used to draw the route, measure distance, and submit
              to leaderboards. Recording stops when you stop the run.
            </li>
            <li>
              <strong>Run history</strong> — distance, duration, elevation gain, route
              geometry, and timestamps for each completed run.
            </li>
            <li>
              <strong>Authentication metadata</strong> — sign-in timestamps and email
              verification status, handled by our backend provider.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-xl font-bold">3. How we use it</h2>
          <ul className="ml-5 list-disc space-y-2">
            <li>To record and display your runs.</li>
            <li>To rank runs on public leaderboards (only when you choose "Leaderboard" visibility).</li>
            <li>To award trophies, streaks, and challenge progress.</li>
            <li>To prevent abuse (rate limits, fairness checks).</li>
          </ul>
          <p>
            We do <strong>not</strong> sell your data. We do not use your location for
            advertising. We do not share your run history with third parties for
            marketing.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl font-bold">4. Third-party services</h2>
          <ul className="ml-5 list-disc space-y-2">
            <li>
              <strong>Mapbox</strong> — provides map tiles and place search. Map view
              requests are sent to Mapbox; see{" "}
              <a
                href="https://www.mapbox.com/legal/privacy"
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:underline"
              >
                Mapbox's privacy policy
              </a>
              .
            </li>
            <li>
              <strong>Lovable Cloud</strong> (powered by Supabase) — hosts our database,
              authentication, and file storage. Data is stored on their managed
              infrastructure.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-xl font-bold">5. Background location</h2>
          <p>
            On mobile, Own The Run requests "Always" location access so it can keep
            recording your run while your phone is locked or another app is open. A
            persistent notification is shown the entire time recording is active. We do
            not collect location when you are not in an active run.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl font-bold">6. Your rights</h2>
          <ul className="ml-5 list-disc space-y-2">
            <li>
              <strong>Access &amp; export</strong> — your full run history is visible in
              the app under Stats and Profile.
            </li>
            <li>
              <strong>Delete</strong> — open Profile → Danger zone → "Delete my account"
              to permanently delete your account, runs, routes, and all associated data.
              This action is immediate and cannot be undone.
            </li>
            <li>
              <strong>Visibility</strong> — every run can be set to Private, Public, or
              Leaderboard. Private runs are never visible to other users.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-xl font-bold">7. Children</h2>
          <p>Own The Run is intended for users aged 13 and over.</p>
        </section>

        <section>
          <h2 className="font-display text-xl font-bold">8. Contact</h2>
          <p>
            For privacy questions or data requests, email{" "}
            <a href="mailto:privacy@owntherun.app" className="text-primary hover:underline">
              privacy@owntherun.app
            </a>
            .
          </p>
        </section>

        <section>
          <p className="text-xs text-muted-foreground">
            See also our{" "}
            <Link to="/terms" className="text-primary hover:underline">
              Terms of Service
            </Link>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
