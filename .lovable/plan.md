# Apple App Store Prep Plan

You'll handle the **Apple Developer enrollment** and the **Mac/Xcode submission** yourself (those can't happen in Lovable). I'll handle everything Apple's reviewers will look for inside the app itself.

---

## Part 1 — What I'll build in Lovable

### 1. In-app account deletion (Apple requirement 5.1.1(v))
Apple **rejects** any app with sign-up that doesn't offer in-app account deletion.

- New **Edge Function** `delete-account` (uses the service role key to call `auth.admin.deleteUser`) — this is the only safe way to delete an auth user from the client.
- New **"Danger zone"** section at the bottom of `/profile`:
  - Red "Delete my account" button
  - Confirmation dialog that requires typing `DELETE` to proceed
  - Explains what gets removed (runs, routes, profile, achievements)
- On success: signs the user out and redirects to `/auth` with a confirmation toast.
- Profile FK cascades already wipe runs/routes/profile rows when the auth user is deleted, so no extra cleanup migration is needed.

### 2. Privacy Policy page (`/privacy`)
A real, Apple/GDPR-compliant policy — not a placeholder. Covers:
- **Location data**: foreground + background GPS, why it's collected (run tracking), that it's stored on Lovable Cloud and never sold
- **Account data**: email, display name, optional avatar, age, gender, clan tag
- **Run history**: distance, duration, route, elevation, timestamps
- **Third parties**: Mapbox (map tiles + geocoding), Lovable Cloud (Supabase) for storage
- **User rights**: data export, account deletion (links to the new delete flow), contact email
- **Children**: app is 13+
- Last-updated date

Linked from: footer of every page, the `/auth` screen, and the App Store listing.

### 3. Terms of Service page (`/terms`)
Standard ToS covering: acceptable use, leaderboard fairness rules, no medical advice disclaimer (important for a fitness app), liability limits, jurisdiction, ability to terminate accounts.

### 4. App icons & splash screens
- **1024×1024 master icon** with the Catch Up brand (lime/dark theme matching your app)
- All iOS icon sizes Capacitor expects (`AppIcon.appiconset`)
- Splash screens for iPhone (light + dark)
- Saved into `/public/app-icons/` so you can drop them into `ios/App/App/Assets.xcassets/` after running `npx cap add ios` on your Mac

I'll generate the icon as a PNG using the Catch Up "Own The Run" lime-on-dark identity already in your styles.

---

## Part 2 — Apple Developer enrollment (you do this)

Since you don't have an account yet:

1. Go to **[developer.apple.com/programs/enroll](https://developer.apple.com/programs/enroll)**
2. Sign in with your Apple ID (or create one — use a real name; Apple requires identity verification)
3. Choose **Individual** ($99/yr) — simplest, fastest. Pick **Organization** ($99/yr but free if non-profit) only if you want the company name shown as the seller and have a D-U-N-S number.
4. Pay the $99 fee
5. Wait **24–48 hours** for Apple to verify your identity (sometimes longer for individuals)
6. Once approved, you'll get access to **App Store Connect**

**Heads up for an Individual account**: your personal legal name shows as the seller on the App Store. If you want "Catch Up" or a company name shown instead, you need the Organization route + a D-U-N-S number (free, ~1–2 weeks to get).

---

## Part 3 — After enrollment (your Mac, follow `README-mobile.md`)

1. Clone the repo to your Mac (use the GitHub integration → "Connect to GitHub" in Lovable)
2. Run the Capacitor commands in `README-mobile.md`
3. Drop the generated icons from `/public/app-icons/` into the iOS asset catalog
4. Add the privacy descriptions to `Info.plist` (already in the README)
5. Open in Xcode, sign with your developer account, run on a real iPhone
6. In **App Store Connect**: create the listing, upload screenshots (I can help script those from the live app later), paste the privacy policy URL (`https://owntherun.lovable.app/privacy`), submit for review
7. First review usually 24–72 hours. Background location apps sometimes get a follow-up question — answer with "Used to record GPS during a run when the screen is locked, with a persistent foreground notification visible to the user."

---

## What's in scope for me right now

✅ Delete account (edge function + UI + confirmation)
✅ Privacy policy page
✅ Terms of service page
✅ App icon (1024×1024) + iOS icon set + splash screens
✅ Footer/auth-screen links to privacy + terms

## What's out of scope (you do this on your Mac later)

- Capacitor `cap add ios` / Xcode build
- Apple Developer enrollment
- App Store Connect listing
- Screenshot generation (we can do this in a later round)

Ready to build when you approve.