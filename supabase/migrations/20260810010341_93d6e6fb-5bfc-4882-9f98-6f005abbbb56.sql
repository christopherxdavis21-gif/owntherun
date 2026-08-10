-- Remove the view and its backing function
DROP VIEW IF EXISTS public.public_profiles;
DROP FUNCTION IF EXISTS private.get_public_profiles();

-- Create a public-safe mirror table for profiles
CREATE TABLE public.public_profiles (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  avatar_url text,
  clan_tag text,
  clan_group_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.public_profiles TO authenticated;
GRANT ALL ON public.public_profiles TO service_role;

ALTER TABLE public.public_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view public profiles" ON public.public_profiles
FOR SELECT TO authenticated
USING (true);

-- Backfill from existing profiles
INSERT INTO public.public_profiles (id, user_id, display_name, avatar_url, clan_tag, clan_group_id, created_at, updated_at)
SELECT id, user_id, display_name, avatar_url, clan_tag, clan_group_id, created_at, updated_at
FROM public.profiles
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  avatar_url = EXCLUDED.avatar_url,
  clan_tag = EXCLUDED.clan_tag,
  clan_group_id = EXCLUDED.clan_group_id,
  created_at = EXCLUDED.created_at,
  updated_at = EXCLUDED.updated_at;

-- Trigger to keep public_profiles in sync with profiles
CREATE OR REPLACE FUNCTION private.sync_public_profiles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.public_profiles (id, user_id, display_name, avatar_url, clan_tag, clan_group_id, created_at, updated_at)
    VALUES (NEW.id, NEW.user_id, NEW.display_name, NEW.avatar_url, NEW.clan_tag, NEW.clan_group_id, NEW.created_at, NEW.updated_at)
    ON CONFLICT (id) DO UPDATE SET
      display_name = EXCLUDED.display_name,
      avatar_url = EXCLUDED.avatar_url,
      clan_tag = EXCLUDED.clan_tag,
      clan_group_id = EXCLUDED.clan_group_id,
      created_at = EXCLUDED.created_at,
      updated_at = EXCLUDED.updated_at;
  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE public.public_profiles SET
      display_name = NEW.display_name,
      avatar_url = NEW.avatar_url,
      clan_tag = NEW.clan_tag,
      clan_group_id = NEW.clan_group_id,
      created_at = NEW.created_at,
      updated_at = NEW.updated_at
    WHERE id = NEW.id;
  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM public.public_profiles WHERE id = OLD.id;
  END IF;
  RETURN NEW;
END;
$function$;

GRANT EXECUTE ON FUNCTION private.sync_public_profiles() TO authenticated;
GRANT EXECUTE ON FUNCTION private.sync_public_profiles() TO service_role;

DROP TRIGGER IF EXISTS sync_public_profiles_trigger ON public.profiles;
CREATE TRIGGER sync_public_profiles_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION private.sync_public_profiles();