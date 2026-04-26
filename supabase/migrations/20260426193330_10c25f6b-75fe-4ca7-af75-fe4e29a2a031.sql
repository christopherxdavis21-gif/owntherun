-- enums
DO $$ BEGIN
  CREATE TYPE achievement_tier AS ENUM ('bronze','silver','gold','platinum');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE achievement_category AS ENUM ('distance','streak','elevation','speed','social','milestone');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE challenge_scope AS ENUM ('system','group','personal');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE challenge_metric AS ENUM ('distance_meters','elevation_meters','runs_count','streak_days','duration_seconds');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS public.achievement_definitions (
  code text PRIMARY KEY,
  title text NOT NULL,
  description text NOT NULL,
  tier achievement_tier NOT NULL DEFAULT 'bronze',
  category achievement_category NOT NULL,
  icon text NOT NULL DEFAULT 'trophy',
  criteria jsonb NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.achievement_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view achievement definitions"
  ON public.achievement_definitions FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.user_achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  achievement_code text NOT NULL REFERENCES public.achievement_definitions(code) ON DELETE CASCADE,
  earned_at timestamptz NOT NULL DEFAULT now(),
  run_id uuid,
  UNIQUE (user_id, achievement_code)
);
CREATE INDEX IF NOT EXISTS idx_user_achievements_user ON public.user_achievements(user_id);
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view user achievements"
  ON public.user_achievements FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.medals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  period_type text NOT NULL CHECK (period_type IN ('week','month','year','all_time')),
  period_start date NOT NULL,
  scope text NOT NULL CHECK (scope IN ('global','group')),
  scope_id uuid,
  category text NOT NULL CHECK (category IN ('distance','pace','elevation')),
  rank int NOT NULL CHECK (rank BETWEEN 1 AND 3),
  awarded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, period_type, period_start, scope, scope_id, category, rank)
);
CREATE INDEX IF NOT EXISTS idx_medals_user ON public.medals(user_id);
ALTER TABLE public.medals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view medals"
  ON public.medals FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope challenge_scope NOT NULL,
  scope_id uuid,
  title text NOT NULL,
  description text,
  metric challenge_metric NOT NULL,
  target_value numeric NOT NULL CHECK (target_value > 0),
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz NOT NULL,
  created_by uuid,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS idx_challenges_ends_at ON public.challenges(ends_at);
ALTER TABLE public.challenges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View system and accessible challenges"
  ON public.challenges FOR SELECT TO authenticated
  USING (
    scope = 'system'
    OR (scope = 'personal' AND created_by = auth.uid())
    OR (scope = 'group' AND scope_id IS NOT NULL AND public.is_group_member(scope_id, auth.uid()))
  );
CREATE POLICY "Create personal challenges"
  ON public.challenges FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (
      scope = 'personal'
      OR (scope = 'group' AND scope_id IS NOT NULL AND public.is_group_member(scope_id, auth.uid()))
    )
  );
CREATE POLICY "Delete own challenges"
  ON public.challenges FOR DELETE TO authenticated
  USING (created_by = auth.uid() AND scope <> 'system');

CREATE TABLE IF NOT EXISTS public.user_challenge_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  challenge_id uuid NOT NULL REFERENCES public.challenges(id) ON DELETE CASCADE,
  progress_value numeric NOT NULL DEFAULT 0,
  joined_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (user_id, challenge_id)
);
CREATE INDEX IF NOT EXISTS idx_ucp_user ON public.user_challenge_progress(user_id);
ALTER TABLE public.user_challenge_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View own challenge progress"
  ON public.user_challenge_progress FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Join challenges"
  ON public.user_challenge_progress FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Leave challenges"
  ON public.user_challenge_progress FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.user_stats (
  user_id uuid PRIMARY KEY,
  lifetime_meters numeric NOT NULL DEFAULT 0,
  lifetime_seconds numeric NOT NULL DEFAULT 0,
  lifetime_elevation numeric NOT NULL DEFAULT 0,
  lifetime_runs int NOT NULL DEFAULT 0,
  longest_run_meters numeric NOT NULL DEFAULT 0,
  fastest_mile_seconds numeric,
  current_streak_days int NOT NULL DEFAULT 0,
  longest_streak_days int NOT NULL DEFAULT 0,
  last_run_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view user stats"
  ON public.user_stats FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.evaluate_run_engagement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.user_stats;
  prev_last_run_date date;
  this_run_date date;
  new_streak int;
  longest int;
  ach record;
  thresh numeric;
  mile_seconds numeric;
  ch record;
BEGIN
  this_run_date := (NEW.ran_at AT TIME ZONE 'UTC')::date;

  SELECT * INTO s FROM public.user_stats WHERE user_id = NEW.user_id;
  IF NOT FOUND THEN
    INSERT INTO public.user_stats(user_id) VALUES (NEW.user_id) RETURNING * INTO s;
  END IF;

  prev_last_run_date := (s.last_run_at AT TIME ZONE 'UTC')::date;

  IF prev_last_run_date IS NULL THEN
    new_streak := 1;
  ELSIF this_run_date = prev_last_run_date THEN
    new_streak := GREATEST(s.current_streak_days, 1);
  ELSIF this_run_date = prev_last_run_date + 1 THEN
    new_streak := s.current_streak_days + 1;
  ELSIF this_run_date > prev_last_run_date + 1 THEN
    new_streak := 1;
  ELSE
    new_streak := s.current_streak_days;
  END IF;
  longest := GREATEST(s.longest_streak_days, new_streak);

  IF NEW.distance_meters >= 1609.344 AND NEW.duration_seconds > 0 THEN
    mile_seconds := (NEW.duration_seconds::numeric / NEW.distance_meters) * 1609.344;
    IF s.fastest_mile_seconds IS NULL OR mile_seconds < s.fastest_mile_seconds THEN
      s.fastest_mile_seconds := mile_seconds;
    END IF;
  END IF;

  UPDATE public.user_stats SET
    lifetime_meters = lifetime_meters + NEW.distance_meters,
    lifetime_seconds = lifetime_seconds + NEW.duration_seconds,
    lifetime_elevation = lifetime_elevation + NEW.elevation_gain_meters,
    lifetime_runs = lifetime_runs + 1,
    longest_run_meters = GREATEST(longest_run_meters, NEW.distance_meters),
    fastest_mile_seconds = s.fastest_mile_seconds,
    current_streak_days = new_streak,
    longest_streak_days = longest,
    last_run_at = GREATEST(COALESCE(last_run_at, NEW.ran_at), NEW.ran_at),
    updated_at = now()
  WHERE user_id = NEW.user_id
  RETURNING * INTO s;

  FOR ach IN SELECT * FROM public.achievement_definitions LOOP
    IF EXISTS (SELECT 1 FROM public.user_achievements
               WHERE user_id = NEW.user_id AND achievement_code = ach.code) THEN
      CONTINUE;
    END IF;

    CASE ach.criteria->>'type'
      WHEN 'lifetime_meters' THEN
        thresh := (ach.criteria->>'value')::numeric;
        IF s.lifetime_meters >= thresh THEN
          INSERT INTO public.user_achievements(user_id, achievement_code, run_id)
            VALUES (NEW.user_id, ach.code, NEW.id) ON CONFLICT DO NOTHING;
        END IF;
      WHEN 'lifetime_runs' THEN
        thresh := (ach.criteria->>'value')::numeric;
        IF s.lifetime_runs >= thresh THEN
          INSERT INTO public.user_achievements(user_id, achievement_code, run_id)
            VALUES (NEW.user_id, ach.code, NEW.id) ON CONFLICT DO NOTHING;
        END IF;
      WHEN 'streak_days' THEN
        thresh := (ach.criteria->>'value')::numeric;
        IF s.current_streak_days >= thresh THEN
          INSERT INTO public.user_achievements(user_id, achievement_code, run_id)
            VALUES (NEW.user_id, ach.code, NEW.id) ON CONFLICT DO NOTHING;
        END IF;
      WHEN 'single_run_meters' THEN
        thresh := (ach.criteria->>'value')::numeric;
        IF NEW.distance_meters >= thresh THEN
          INSERT INTO public.user_achievements(user_id, achievement_code, run_id)
            VALUES (NEW.user_id, ach.code, NEW.id) ON CONFLICT DO NOTHING;
        END IF;
      WHEN 'lifetime_elevation' THEN
        thresh := (ach.criteria->>'value')::numeric;
        IF s.lifetime_elevation >= thresh THEN
          INSERT INTO public.user_achievements(user_id, achievement_code, run_id)
            VALUES (NEW.user_id, ach.code, NEW.id) ON CONFLICT DO NOTHING;
        END IF;
      WHEN 'fastest_mile_seconds' THEN
        thresh := (ach.criteria->>'value')::numeric;
        IF s.fastest_mile_seconds IS NOT NULL AND s.fastest_mile_seconds <= thresh THEN
          INSERT INTO public.user_achievements(user_id, achievement_code, run_id)
            VALUES (NEW.user_id, ach.code, NEW.id) ON CONFLICT DO NOTHING;
        END IF;
      ELSE NULL;
    END CASE;
  END LOOP;

  FOR ch IN
    SELECT c.*, ucp.progress_value AS current_progress
    FROM public.user_challenge_progress ucp
    JOIN public.challenges c ON c.id = ucp.challenge_id
    WHERE ucp.user_id = NEW.user_id
      AND ucp.completed_at IS NULL
      AND NEW.ran_at >= c.starts_at
      AND NEW.ran_at <= c.ends_at
  LOOP
    DECLARE
      delta numeric := 0;
      new_progress numeric;
    BEGIN
      delta := CASE ch.metric
        WHEN 'distance_meters' THEN NEW.distance_meters
        WHEN 'elevation_meters' THEN NEW.elevation_gain_meters
        WHEN 'duration_seconds' THEN NEW.duration_seconds
        WHEN 'runs_count' THEN 1
        ELSE 0
      END;
      new_progress := ch.current_progress + delta;
      UPDATE public.user_challenge_progress
      SET progress_value = new_progress,
          completed_at = CASE WHEN new_progress >= ch.target_value AND completed_at IS NULL
                              THEN now() ELSE completed_at END
      WHERE user_id = NEW.user_id AND challenge_id = ch.id;
    END;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_evaluate_run_engagement ON public.runs;
CREATE TRIGGER trg_evaluate_run_engagement
  AFTER INSERT ON public.runs
  FOR EACH ROW EXECUTE FUNCTION public.evaluate_run_engagement();

INSERT INTO public.achievement_definitions (code, title, description, tier, category, icon, criteria, sort_order) VALUES
  ('first_run',          'First Steps',         'Complete your first tracked run.',       'bronze',   'milestone', 'sparkles', '{"type":"lifetime_runs","value":1}', 1),
  ('runs_10',            'Getting Going',       'Complete 10 runs.',                      'bronze',   'milestone', 'sparkles', '{"type":"lifetime_runs","value":10}', 2),
  ('runs_50',            'Regular Runner',      'Complete 50 runs.',                      'silver',   'milestone', 'sparkles', '{"type":"lifetime_runs","value":50}', 3),
  ('runs_100',           'Century of Runs',     'Complete 100 runs.',                     'gold',     'milestone', 'sparkles', '{"type":"lifetime_runs","value":100}', 4),
  ('miles_10',           '10-Mile Club',        'Run 10 lifetime miles.',                 'bronze',   'distance',  'medal',    '{"type":"lifetime_meters","value":16093.44}', 10),
  ('miles_50',           '50-Mile Club',        'Run 50 lifetime miles.',                 'bronze',   'distance',  'medal',    '{"type":"lifetime_meters","value":80467.2}', 11),
  ('miles_100',          '100-Mile Club',       'Run 100 lifetime miles.',                'silver',   'distance',  'medal',    '{"type":"lifetime_meters","value":160934.4}', 12),
  ('miles_500',          '500-Mile Club',       'Run 500 lifetime miles.',                'gold',     'distance',  'medal',    '{"type":"lifetime_meters","value":804672}', 13),
  ('miles_1000',         '1000-Mile Club',      'Run 1,000 lifetime miles.',              'platinum', 'distance',  'medal',    '{"type":"lifetime_meters","value":1609344}', 14),
  ('streak_7',           'Week Warrior',        'Run 7 days in a row.',                   'bronze',   'streak',    'flame',    '{"type":"streak_days","value":7}', 20),
  ('streak_30',          'Month on Fire',       'Run 30 days in a row.',                  'silver',   'streak',    'flame',    '{"type":"streak_days","value":30}', 21),
  ('streak_100',         'Centurion Streak',    'Run 100 days in a row.',                 'platinum', 'streak',    'flame',    '{"type":"streak_days","value":100}', 22),
  ('single_5k',          'First 5K',            'Complete a single run of 5K or more.',   'bronze',   'distance',  'route',    '{"type":"single_run_meters","value":5000}', 30),
  ('single_10k',         'First 10K',           'Complete a single run of 10K or more.',  'silver',   'distance',  'route',    '{"type":"single_run_meters","value":10000}', 31),
  ('single_half',        'Half Marathon',       'Complete a single run of 21.1K+.',       'gold',     'distance',  'route',    '{"type":"single_run_meters","value":21097.5}', 32),
  ('single_marathon',    'Marathon',            'Complete a single run of 42.2K+.',       'platinum', 'distance',  'route',    '{"type":"single_run_meters","value":42195}', 33),
  ('elev_1000ft',        'Hill Climber',        'Climb 1,000 ft of lifetime elevation.',  'bronze',   'elevation', 'mountain', '{"type":"lifetime_elevation","value":304.8}', 40),
  ('elev_5000ft',        'Mountain Goat',       'Climb 5,000 ft of lifetime elevation.',  'silver',   'elevation', 'mountain', '{"type":"lifetime_elevation","value":1524}', 41),
  ('elev_25000ft',       'Summit Seeker',       'Climb 25,000 ft of lifetime elevation.', 'gold',     'elevation', 'mountain', '{"type":"lifetime_elevation","value":7620}', 42),
  ('mile_sub8',          'Sub-8 Mile',          'Run a mile pace of 8:00 or better.',     'silver',   'speed',     'zap',      '{"type":"fastest_mile_seconds","value":480}', 50),
  ('mile_sub7',          'Sub-7 Mile',          'Run a mile pace of 7:00 or better.',     'gold',     'speed',     'zap',      '{"type":"fastest_mile_seconds","value":420}', 51),
  ('mile_sub6',          'Sub-6 Mile',          'Run a mile pace of 6:00 or better.',     'platinum', 'speed',     'zap',      '{"type":"fastest_mile_seconds","value":360}', 52)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.challenges (scope, title, description, metric, target_value, starts_at, ends_at, is_system)
SELECT 'system', 'Weekly 10-Miler', 'Run 10 miles this week to complete the challenge.',
       'distance_meters', 16093.44,
       date_trunc('week', now()),
       date_trunc('week', now()) + interval '7 days',
       true
WHERE NOT EXISTS (
  SELECT 1 FROM public.challenges WHERE is_system = true AND ends_at > now()
);
