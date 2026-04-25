-- Secure username availability check (RLS hides other users' rows from direct SELECT)
CREATE OR REPLACE FUNCTION public.check_username_available(p_username text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v text := lower(trim(p_username));
BEGIN
  IF v !~ '^[a-z0-9_]{3,20}$' THEN
    RETURN false;
  END IF;
  RETURN NOT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE username = v
      AND id IS DISTINCT FROM auth.uid()
  );
END;
$$;

COMMENT ON FUNCTION public.check_username_available(text) IS 'True if username matches format and is not taken by another user (SECURITY DEFINER).';

GRANT EXECUTE ON FUNCTION public.check_username_available(text) TO authenticated;
