import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — Catch Up" },
      {
        name: "description",
        content: "The rules for using Catch Up: leaderboard fairness, acceptable use, and disclaimers.",
      },
      { property: "og:title", content: "Terms of Service — Catch Up" },
      {
        property: "og:description",
        content: "The rules for using Catch Up.",
      },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <div className="mx-auto min-h-screen max-w-3xl px-6 py-12 text-foreground">
      <Link to="/" className="text-sm text-primary hover:underline">
        ← Back to Catch Up
      </Link>
      <h1 className="font-display mt-6 text-4xl font-black tracking-tight">Terms of Service</h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated: 26 April 2026</p>

      <div className="mt-8 space-y-6 text-sm leading-relaxed">
        <section>
          <h2 className="font-display text-xl font-bold">1. Acceptance</h2>
          <p>
            By creating a Catch Up account or using the app you agree to these Terms.
            If you do not agree, do not use the service.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl font-bold">2. The service</h2>
          <p>
            Catch Up is a run-tracking and leaderboard app. We may add, change, or
            remove features at any time. We aim for high uptime but do not guarantee
            uninterrupted service.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl font-bold">3. Your account</h2>
          <ul className="ml-5 list-disc space-y-2">
            <li>You must be 13 or older.</li>
            <li>You are responsible for activity on your account and for keeping your password secure.</li>
            <li>One person, one account. Don't impersonate other people.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-xl font-bold">4. Leaderboard fairness</h2>
          <p>
            Submitting fake runs, GPS spoofed runs, vehicle-assisted runs, or any
            other fabricated data to the public leaderboards is prohibited. We may
            remove suspect runs and suspend or terminate offending accounts at our
            discretion.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl font-bold">5. Acceptable use</h2>
          <ul className="ml-5 list-disc space-y-2">
            <li>No harassment, hate speech, or threats in display names, clan tags, comments, or group descriptions.</li>
            <li>No spam, scraping, automated abuse, or attempts to break security.</li>
            <li>No illegal use of the service.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-xl font-bold">6. Health disclaimer</h2>
          <p>
            Catch Up is not a medical device. Information shown in the app
            (distance, pace, heart-rate-derived stats, training suggestions) is for
            general fitness use only and is not medical advice. Consult a qualified
            healthcare provider before starting or modifying any exercise program.
            You run at your own risk.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl font-bold">7. Your content</h2>
          <p>
            You keep ownership of the runs, routes, photos, and comments you create.
            By making content "Public" or "Leaderboard" you grant us a license to
            display it inside Catch Up to other users.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl font-bold">8. Termination</h2>
          <p>
            You can delete your account at any time from Profile → Danger zone. We
            may suspend or terminate accounts that violate these Terms.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl font-bold">9. Liability</h2>
          <p>
            To the maximum extent permitted by law, Catch Up is provided "as is"
            with no warranties. We are not liable for indirect, incidental, or
            consequential damages arising from your use of the service.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl font-bold">10. Changes</h2>
          <p>
            We may update these Terms from time to time. Material changes will be
            announced in-app. Continued use after changes means you accept the new
            Terms.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl font-bold">11. Contact</h2>
          <p>
            Questions? Email{" "}
            <a href="mailto:hello@owntherun.app" className="text-primary hover:underline">
              hello@owntherun.app
            </a>
            .
          </p>
        </section>

        <section>
          <p className="text-xs text-muted-foreground">
            See also our{" "}
            <Link to="/privacy" className="text-primary hover:underline">
              Privacy Policy
            </Link>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
