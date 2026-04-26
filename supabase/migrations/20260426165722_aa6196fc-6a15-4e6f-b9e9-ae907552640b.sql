-- 1. Clan tag on profiles (3-5 char uppercase tag, profanity-blocked at app level)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS clan_tag text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS clan_group_id uuid;

-- Length constraint via trigger (allows null, 2-5 alphanumeric uppercase)
CREATE OR REPLACE FUNCTION public.validate_clan_tag()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  banned text[] := ARRAY['FUCK','SHIT','CUNT','FAG','NGGR','NIGR','RAPE','KKK','SS','NAZI','SLUT','DICK','COCK','TITS','PORN','SEX','ANAL','JEW','GOOK','SPIC','CHNK','TWAT','WANK','PISS','BICH','BTCH'];
  upper_tag text;
BEGIN
  IF NEW.clan_tag IS NOT NULL THEN
    upper_tag := upper(NEW.clan_tag);
    NEW.clan_tag := upper_tag;
    IF length(upper_tag) < 2 OR length(upper_tag) > 5 THEN
      RAISE EXCEPTION 'Clan tag must be 2-5 characters';
    END IF;
    IF upper_tag !~ '^[A-Z0-9]+$' THEN
      RAISE EXCEPTION 'Clan tag must be letters and numbers only';
    END IF;
    IF upper_tag = ANY(banned) THEN
      RAISE EXCEPTION 'That clan tag is not allowed';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_clan_tag_trigger ON public.profiles;
CREATE TRIGGER validate_clan_tag_trigger
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.validate_clan_tag();

-- 2. Group photo + clan tag fields on groups
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS clan_tag text;

CREATE OR REPLACE FUNCTION public.validate_group_clan_tag()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  banned text[] := ARRAY['FUCK','SHIT','CUNT','FAG','NGGR','NIGR','RAPE','KKK','SS','NAZI','SLUT','DICK','COCK','TITS','PORN','SEX','ANAL','JEW','GOOK','SPIC','CHNK','TWAT','WANK','PISS','BICH','BTCH'];
  upper_tag text;
BEGIN
  IF NEW.clan_tag IS NOT NULL THEN
    upper_tag := upper(NEW.clan_tag);
    NEW.clan_tag := upper_tag;
    IF length(upper_tag) < 2 OR length(upper_tag) > 5 THEN
      RAISE EXCEPTION 'Clan tag must be 2-5 characters';
    END IF;
    IF upper_tag !~ '^[A-Z0-9]+$' THEN
      RAISE EXCEPTION 'Clan tag must be letters and numbers only';
    END IF;
    IF upper_tag = ANY(banned) THEN
      RAISE EXCEPTION 'That clan tag is not allowed';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_group_clan_tag_trigger ON public.groups;
CREATE TRIGGER validate_group_clan_tag_trigger
BEFORE INSERT OR UPDATE ON public.groups
FOR EACH ROW EXECUTE FUNCTION public.validate_group_clan_tag();

-- 3. Saved routes (favorites)
CREATE TABLE IF NOT EXISTS public.saved_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  route_id uuid NOT NULL,
  saved_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, route_id)
);

ALTER TABLE public.saved_routes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View own saved routes"
ON public.saved_routes FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Save routes"
ON public.saved_routes FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Unsave routes"
ON public.saved_routes FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- 4. Storage bucket for group photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('group-photos', 'group-photos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Group photos publicly viewable"
ON storage.objects FOR SELECT
USING (bucket_id = 'group-photos');

CREATE POLICY "Group owners can upload group photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'group-photos'
  AND EXISTS (
    SELECT 1 FROM public.groups g
    WHERE g.id::text = (storage.foldername(name))[1]
      AND g.created_by = auth.uid()
  )
);

CREATE POLICY "Group owners can update group photos"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'group-photos'
  AND EXISTS (
    SELECT 1 FROM public.groups g
    WHERE g.id::text = (storage.foldername(name))[1]
      AND g.created_by = auth.uid()
  )
);

CREATE POLICY "Group owners can delete group photos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'group-photos'
  AND EXISTS (
    SELECT 1 FROM public.groups g
    WHERE g.id::text = (storage.foldername(name))[1]
      AND g.created_by = auth.uid()
  )
);