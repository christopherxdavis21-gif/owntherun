# Engagement Layer: Trophies, Medals, Challenges & Stats

This plan layers a full engagement system on top of the existing `runs`, `profiles`, and `groups` tables, plus a new **personal stats dashboard** so every runner has one clear place to see their progress.

---

## 1. Database (new migration)

### New tables
- **`achievement_definitions`** — catalog of unlockable trophies. Columns: `code` (e.g. `lifetime_miles_100`, `streak_7`, `single_run_10mi`, `elevation_5000ft`), `title`, `description`, `tier` (bronze/silver/gold/platinum), `icon`, `category` (distance / streak / elevation / speed / social), `criteria` JSONB (declarative rule).
- **`user_achievements`** — `(user_id, achievement_code, earned_at, run_id)`. Insert-only via trigger; RLS allows SELECT for everyone, no client INSERT/UPDATE/DELETE.
- **`medals`** — `(user_id, period_type, period_start, scope, scope_id, category, rank, awarded_at)`. `scope` = `global` | `group`; `category` = `distance` | `pace` | `elevation`; `rank` 1-3 (gold/silver/bronze).
- **`challenges`** — `(id, scope, scope_id, title, description, metric, target_value, starts_at, ends_at, created_by, is_system)`. Scopes: `system` (app-wide weekly/monthly/yearly), `group`, `personal`.
- **`user_challenge_progress`** — `(user_id, challenge_id, progress_value, completed_at)`. Updated by trigger.
- **`user_stats`** (materialized cache) — `(user_id, lifetime_meters, lifetime_seconds, lifetime_elevation, lifetime_runs, longest_run_meters, fastest_mile_seconds, current_streak_days, longest_streak_days, last_run_at, updated_at)`. Recomputed on run insert.

### Triggers & functions (SECURITY DEFINER, server-side anti-cheat)
- `AFTER INSERT ON runs` →
  1. Upsert `user_stats` (recompute lifetime totals + streak from prior `last_run_at`).
  2. Evaluate every row in `achievement_definitions` against the new totals; insert into `user_achievements` for any newly satisfied criteria.
  3. Bump `user_challenge_progress` for any active challenges the user is enrolled in (or auto-enrolled in for `system` scope).
- `pg_cron` jobs:
  - Weekly/monthly/yearly: close the period, rank verified leaderboard runs, insert top-3 into `medals` (global + per group).
  - Daily: seed the next system challenge if none active.

### Seed data
Migration seeds ~20 starter achievements (First Run, 10 / 50 / 100 / 500 / 1000 lifetime miles, 7 / 30 / 100-day streaks, sub-8 / sub-7 / sub-6 mile, 5K / 10K / half / marathon distance, 1000ft / 5000ft elevation, group founder, first leaderboard medal) and the first weekly system challenge.

---

## 2. New routes

- **`/trophies`** — full Trophy Case: earned vs. locked grid, filter by category/tier, medal shelf (gold/silver/bronze with period & scope), active challenges with progress bars.
- **`/challenges`** — browse system/group challenges, join/leave, create personal challenge (distance, elevation, streak, time-window).
- **`/stats`** — **personal stats dashboard** (see §3).

All three added to `AppShell` nav.

---

## 3. Personal stats dashboard (`/stats`)

Pulled from `user_stats` + run history. Sections:

1. **Headline tiles** — Lifetime miles, total runs, total time, total elevation, current streak, longest streak.
2. **This week / month / year** — Miles, runs, avg pace, elevation (bar chart with prior-period delta).
3. **Personal bests** — Fastest mile, fastest 5K/10K/half/marathon (derived from runs ≥ that distance), longest run, biggest elevation day.
4. **Activity heatmap** — GitHub-style 365-day grid colored by daily mileage.
5. **Recent trophies** — Last 5 unlocks with link to `/trophies`.
6. **Active challenges** — Progress bars with deadlines.
7. **Medal shelf** — Compact row of current-period medals.

Uses Recharts (already common in the stack) for the bar/line/heatmap visuals.

---

## 4. Profile integration (`/profile`)

Add below the runner card:
- **Stats summary strip** — 4 tiles (lifetime miles, runs, current streak, medals) with a "View full stats" link to `/stats`.
- **Trophy Case preview** — Last 6 earned trophies + "View all" link to `/trophies`.

When viewing another user's profile (future), the same components render in read-only mode.

---

## 5. Feed integration (`/feed`)

- **`TrophyShelf` rail** at the top of the feed showing the current user's active challenges + most-recent trophy (horizontal scroll).
- **Achievement announcement cards** interleaved into the activity stream (e.g. "🏆 Sarah just earned **100-Mile Club**") — query `user_achievements` joined with `profiles`, merged with runs by timestamp.
- Run cards get a small trophy badge when that specific run unlocked an achievement (via the `run_id` link on `user_achievements`).

---

## 6. RunTracker integration

After a successful run insert, query `user_achievements` for rows with the new `run_id` and fire celebratory `sonner` toasts ("🏆 You earned **First 10-Miler**"). Also re-fetch `user_stats` and show a brief "+3.2 mi · streak: 8 days" delta toast.

---

## 7. Leaderboards integration

- Add 🥇🥈🥉 indicator next to the top-3 ranks for each period.
- Add a "Champions" tab that reads from `medals` to show historical winners (this week last year, all-time monthly winners, etc.).

---

## 8. New components

- `TrophyCard`, `MedalCard`, `ChallengeCard`, `ChallengeProgressBar`
- `StatsTile`, `ActivityHeatmap`, `PeriodBarChart`, `PersonalBestsTable`
- `TrophyShelf` (feed rail), `AchievementAnnouncementCard` (feed item)
- `CreateChallengeDialog`

---

## File summary

**New**
- `supabase/migrations/<ts>_trophies_stats.sql`
- `src/routes/trophies.tsx`
- `src/routes/challenges.tsx`
- `src/routes/stats.tsx`
- `src/components/trophies/*` (cards, shelf, dialog)
- `src/components/stats/*` (tiles, heatmap, charts)
- `src/lib/stats.ts` (period helpers, PB derivation)

**Modified**
- `src/routes/profile.tsx` — stats strip + trophy preview
- `src/routes/feed.tsx` — trophy shelf + announcement cards + run-card badges
- `src/routes/leaderboards.tsx` — medal indicators + Champions tab
- `src/components/AppShell.tsx` — add Trophies & Stats nav entries
- `src/components/RunTracker.tsx` — post-run achievement toasts

All achievement/medal/stat writes happen server-side via triggers and cron, so the UI is purely read-only for these tables — no way for a client to fabricate trophies.