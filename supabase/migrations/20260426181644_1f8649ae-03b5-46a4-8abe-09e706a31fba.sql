
-- 1) Profile: gender, age, phone, verification
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS gender text CHECK (gender IN ('male','female','nonbinary','undisclosed')),
  ADD COLUMN IF NOT EXISTS birthdate date,
  ADD COLUMN IF NOT EXISTS phone_number text,
  ADD COLUMN IF NOT EXISTS phone_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_verified boolean NOT NULL DEFAULT false;

-- Helper function to recompute is_verified
CREATE OR REPLACE FUNCTION public.recompute_profile_verified()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.is_verified := COALESCE(NEW.email_verified, false) AND COALESCE(NEW.phone_verified, false);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_recompute_verified ON public.profiles;
CREATE TRIGGER profiles_recompute_verified
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.recompute_profile_verified();

-- Sync email_verified from auth.users.email_confirmed_at on signup/confirmation
CREATE OR REPLACE FUNCTION public.sync_email_verified()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET email_verified = (NEW.email_confirmed_at IS NOT NULL)
  WHERE user_id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_email_confirmed ON auth.users;
CREATE TRIGGER on_auth_user_email_confirmed
AFTER UPDATE OF email_confirmed_at ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.sync_email_verified();

-- Backfill email_verified for existing users
UPDATE public.profiles p
SET email_verified = (au.email_confirmed_at IS NOT NULL)
FROM auth.users au
WHERE au.id = p.user_id;

-- 2) Runs: visibility + elevation
DO $$ BEGIN
  CREATE TYPE public.run_visibility AS ENUM ('private','public','leaderboard');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.runs
  ADD COLUMN IF NOT EXISTS visibility public.run_visibility NOT NULL DEFAULT 'private',
  ADD COLUMN IF NOT EXISTS elevation_gain_meters numeric NOT NULL DEFAULT 0;

-- Trigger: only verified users may submit to leaderboard
CREATE OR REPLACE FUNCTION public.enforce_run_submission()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v boolean;
BEGIN
  IF NEW.visibility = 'leaderboard' THEN
    SELECT is_verified INTO v FROM public.profiles WHERE user_id = NEW.user_id;
    IF NOT COALESCE(v, false) THEN
      RAISE EXCEPTION 'You must verify your account before submitting runs to the leaderboard';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS runs_enforce_submission ON public.runs;
CREATE TRIGGER runs_enforce_submission
BEFORE INSERT OR UPDATE OF visibility ON public.runs
FOR EACH ROW EXECUTE FUNCTION public.enforce_run_submission();

-- Update RLS: viewing runs based on visibility
DROP POLICY IF EXISTS "View runs on public routes or own runs" ON public.runs;
CREATE POLICY "View own runs or public runs"
ON public.runs
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR visibility IN ('public','leaderboard')
);

-- 3) Comments on runs
CREATE TABLE IF NOT EXISTS public.run_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.runs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.run_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View comments on public runs"
ON public.run_comments FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.runs r
    WHERE r.id = run_comments.run_id
      AND (r.visibility IN ('public','leaderboard') OR r.user_id = auth.uid())
  )
);

CREATE POLICY "Post comments on public runs"
ON public.run_comments FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id AND
  EXISTS (
    SELECT 1 FROM public.runs r
    WHERE r.id = run_comments.run_id
      AND r.visibility IN ('public','leaderboard')
  )
);

CREATE POLICY "Edit own comments"
ON public.run_comments FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Delete own comments"
ON public.run_comments FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Banned-word filter
CREATE OR REPLACE FUNCTION public.validate_comment_body()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  banned text[] := ARRAY['fuck','shit','cunt','faggot','nigger','nigga','rape','kkk','nazi','slut','retard','dick','cock','tits','porn','anal','jew','gook','spic','chink','twat','wanker','piss','bitch'];
  w text;
  lower_body text;
BEGIN
  IF length(trim(NEW.body)) = 0 THEN
    RAISE EXCEPTION 'Comment cannot be empty';
  END IF;
  IF length(NEW.body) > 500 THEN
    RAISE EXCEPTION 'Comment must be 500 characters or fewer';
  END IF;
  lower_body := lower(NEW.body);
  FOREACH w IN ARRAY banned LOOP
    IF lower_body ~* ('\m' || w || '\M') THEN
      RAISE EXCEPTION 'Comment contains language that is not allowed';
    END IF;
  END LOOP;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS run_comments_validate ON public.run_comments;
CREATE TRIGGER run_comments_validate
BEFORE INSERT OR UPDATE ON public.run_comments
FOR EACH ROW EXECUTE FUNCTION public.validate_comment_body();

-- 4) Saved leaderboard views
CREATE TABLE IF NOT EXISTS public.saved_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  category text NOT NULL CHECK (category IN ('miles','pace','time')),
  time_filter text NOT NULL CHECK (time_filter IN ('week','month','year','all')),
  distance_filter text CHECK (distance_filter IN ('any','mile','5k','10k','half','marathon')),
  gender_filter text CHECK (gender_filter IN ('all','male','female','nonbinary')),
  age_filter text CHECK (age_filter IN ('all','under18','18_27','28_34','35_44','45_54','55_64','65_74','75plus')),
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.saved_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View own saved views"
ON public.saved_views FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Insert own saved views"
ON public.saved_views FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Update own saved views"
ON public.saved_views FOR UPDATE TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Delete own saved views"
ON public.saved_views FOR DELETE TO authenticated
USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_runs_user_visibility_ranat ON public.runs(user_id, visibility, ran_at);
CREATE INDEX IF NOT EXISTS idx_run_comments_run ON public.run_comments(run_id, created_at);
