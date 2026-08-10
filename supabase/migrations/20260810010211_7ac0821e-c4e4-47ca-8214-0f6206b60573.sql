-- Create private schema for internal SECURITY DEFINER functions
CREATE SCHEMA IF NOT EXISTS private;

-- Allow authenticated users and service role to reference objects in private schema
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT USAGE ON SCHEMA private TO service_role;

-- Recreate SECURITY DEFINER helper in private schema
CREATE OR REPLACE FUNCTION private.is_group_member(_group_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = private, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = _group_id AND user_id = _user_id
  )
$$;

GRANT EXECUTE ON FUNCTION private.is_group_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_group_member(uuid, uuid) TO service_role;

-- Recreate SECURITY DEFINER trigger functions in private schema
CREATE OR REPLACE FUNCTION private.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public
AS $function$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION private.sync_email_verified()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public
AS $function$
BEGIN
  UPDATE public.profiles
  SET email_verified = (NEW.email_confirmed_at IS NOT NULL)
  WHERE user_id = NEW.id;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION private.handle_new_group()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public
AS $function$
BEGIN
  INSERT INTO public.group_members (group_id, user_id, role)
  VALUES (NEW.id, NEW.created_by, 'owner');
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION private.evaluate_run_engagement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public
AS $function$
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
$function$;

-- Update triggers to point to private schema functions
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION private.handle_new_user();

DROP TRIGGER IF EXISTS on_auth_user_email_confirmed ON auth.users;
CREATE TRIGGER on_auth_user_email_confirmed
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION private.sync_email_verified();

DROP TRIGGER IF EXISTS on_group_created ON public.groups;
CREATE TRIGGER on_group_created
  AFTER INSERT ON public.groups
  FOR EACH ROW
  EXECUTE FUNCTION private.handle_new_group();

DROP TRIGGER IF EXISTS trg_evaluate_run_engagement ON public.runs;
CREATE TRIGGER trg_evaluate_run_engagement
  AFTER INSERT ON public.runs
  FOR EACH ROW
  EXECUTE FUNCTION private.evaluate_run_engagement();

-- Update policies to use private.is_group_member BEFORE dropping the old public function
DROP POLICY IF EXISTS "View public groups or member groups" ON public.groups;
CREATE POLICY "View public groups or member groups" ON public.groups
FOR SELECT TO authenticated
USING (
  is_public = true
  OR private.is_group_member(id, auth.uid())
  OR created_by = auth.uid()
);

DROP POLICY IF EXISTS "View members of accessible groups" ON public.group_members;
CREATE POLICY "View members of accessible groups" ON public.group_members
FOR SELECT TO authenticated
USING (
  private.is_group_member(group_id, auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.groups g
    WHERE g.id = group_members.group_id
      AND (g.is_public = true OR g.created_by = auth.uid())
  )
);

DROP POLICY IF EXISTS "View system and accessible challenges" ON public.challenges;
CREATE POLICY "View system and accessible challenges" ON public.challenges
FOR SELECT TO authenticated
USING (
  scope = 'system'::challenge_scope
  OR (scope = 'personal'::challenge_scope AND created_by = auth.uid())
  OR (
    scope = 'group'::challenge_scope
    AND scope_id IS NOT NULL
    AND private.is_group_member(scope_id, auth.uid())
  )
);

DROP POLICY IF EXISTS "Create personal challenges" ON public.challenges;
CREATE POLICY "Create personal challenges" ON public.challenges
FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND (
    scope = 'personal'::challenge_scope
    OR (
      scope = 'group'::challenge_scope
      AND scope_id IS NOT NULL
      AND private.is_group_member(scope_id, auth.uid())
    )
  )
);

-- Drop old public schema functions now that triggers/policies reference private versions
DROP FUNCTION IF EXISTS public.is_group_member(uuid, uuid);
DROP FUNCTION IF EXISTS public.handle_new_user();
DROP FUNCTION IF EXISTS public.sync_email_verified();
DROP FUNCTION IF EXISTS public.handle_new_group();
DROP FUNCTION IF EXISTS public.evaluate_run_engagement();

-- Restrict follows visibility to relationships involving the requesting user
DROP POLICY IF EXISTS "Anyone authenticated can view follows" ON public.follows;
CREATE POLICY "Users can view own follow relationships" ON public.follows
FOR SELECT TO authenticated
USING (follower_id = auth.uid() OR followee_id = auth.uid());

-- Restrict user_stats visibility to self
DROP POLICY IF EXISTS "Anyone can view user stats" ON public.user_stats;
CREATE POLICY "Users can view own stats" ON public.user_stats
FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- Create a public-safe profiles view and restrict base table reads to owners
CREATE OR REPLACE VIEW public.public_profiles WITH (security_invoker = false) AS
SELECT
  id,
  user_id,
  display_name,
  avatar_url,
  clan_tag,
  clan_group_id,
  created_at,
  updated_at
FROM public.profiles;

GRANT SELECT ON public.public_profiles TO authenticated;

DROP POLICY IF EXISTS "Profiles viewable by everyone authenticated" ON public.profiles;
CREATE POLICY "Users can view own full profile" ON public.profiles
FOR SELECT TO authenticated
USING (auth.uid() = user_id);

-- Fix group-photos storage policies to compare the object's path against the group id
DROP POLICY IF EXISTS "Group owners can upload group photos" ON storage.objects;
DROP POLICY IF EXISTS "Group owners can update group photos" ON storage.objects;
DROP POLICY IF EXISTS "Group owners can delete group photos" ON storage.objects;

CREATE POLICY "Group owners can upload group photos" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'group-photos'
  AND EXISTS (
    SELECT 1 FROM public.groups g
    WHERE (g.id)::text = (storage.foldername(name))[1]
      AND g.created_by = auth.uid()
  )
);

CREATE POLICY "Group owners can update group photos" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'group-photos'
  AND EXISTS (
    SELECT 1 FROM public.groups g
    WHERE (g.id)::text = (storage.foldername(name))[1]
      AND g.created_by = auth.uid()
  )
)
WITH CHECK (
  bucket_id = 'group-photos'
  AND EXISTS (
    SELECT 1 FROM public.groups g
    WHERE (g.id)::text = (storage.foldername(name))[1]
      AND g.created_by = auth.uid()
  )
);

CREATE POLICY "Group owners can delete group photos" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'group-photos'
  AND EXISTS (
    SELECT 1 FROM public.groups g
    WHERE (g.id)::text = (storage.foldername(name))[1]
      AND g.created_by = auth.uid()
  )
);