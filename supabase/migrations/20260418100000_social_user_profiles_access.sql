-- Friend search + social: allow limited profile discovery and reads for related users.
-- See plan: RLS previously allowed only self + admin on user_profiles.

-- Username search (SECURITY DEFINER; RLS does not apply inside the function body)
CREATE OR REPLACE FUNCTION public.search_users_by_username(p_query text)
RETURNS TABLE(id uuid, display_name text, username text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v text;
BEGIN
  v := regexp_replace(lower(coalesce(trim(p_query), '')), '[^a-z0-9_]', '', 'g');
  IF length(v) < 2 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT p.id, p.display_name, p.username
  FROM public.user_profiles p
  WHERE p.username IS NOT NULL
    AND btrim(p.username) <> ''
    AND p.id IS DISTINCT FROM auth.uid()
    AND p.username ILIKE '%' || v || '%'
  ORDER BY p.username
  LIMIT 10;
END;
$$;

COMMENT ON FUNCTION public.search_users_by_username(text) IS
  'Returns id, display_name, username for username substring search (authenticated callers only).';

GRANT EXECUTE ON FUNCTION public.search_users_by_username(text) TO authenticated;

-- Allow reading peer profiles for friendships, shared study groups, and active study rooms
CREATE POLICY "Users can view profiles of friends groupmates and room peers"
  ON public.user_profiles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_friendships uf
      WHERE uf.status IN ('pending', 'accepted')
        AND (
          (uf.requester_id = auth.uid() AND uf.addressee_id = user_profiles.id)
          OR (uf.addressee_id = auth.uid() AND uf.requester_id = user_profiles.id)
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.study_group_members me
      INNER JOIN public.study_group_members peer
        ON me.group_id = peer.group_id
        AND peer.user_id = user_profiles.id
      WHERE me.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.study_room_participants me
      INNER JOIN public.study_room_participants peer
        ON me.room_id = peer.room_id
        AND peer.user_id = user_profiles.id
      WHERE me.user_id = auth.uid()
        AND me.left_at IS NULL
        AND peer.left_at IS NULL
    )
  );
