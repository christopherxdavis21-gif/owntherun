-- Make is_verified depend on email_verified only (phone optional)
CREATE OR REPLACE FUNCTION public.recompute_profile_verified()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.is_verified := COALESCE(NEW.email_verified, false);
  RETURN NEW;
END;
$function$;

-- Backfill existing rows
UPDATE public.profiles
SET is_verified = COALESCE(email_verified, false)
WHERE is_verified IS DISTINCT FROM COALESCE(email_verified, false);
