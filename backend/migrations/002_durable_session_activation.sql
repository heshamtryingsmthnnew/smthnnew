-- PHASE_5A_BRIEF_06 — Durable Sessions (Step 1: Activation + Validated Attach)
--
-- Adds p_active_session_id (DEFAULT NULL) to get_or_create_active_session.
-- New branch: when a non-null active session id is supplied, validate it
-- belongs to the requesting owner (under the same advisory lock) and attach
-- to it directly, bumping last_solve_at. On any miss (null, not found, or
-- owner mismatch) falls through to the existing 4-hour clustering logic —
-- never errors, never attaches cross-owner.
--
-- Backward compatible: existing callers that omit p_active_session_id get
-- the prior behavior unchanged (PostgREST resolves the RPC overload by the
-- set of argument names actually passed).
--
-- STATUS: proposed — pending human review. The function below was applied
-- live without a migration file (gap this corrects); this file additionally
-- captures the brand-new p_active_session_id branch, not yet applied.

CREATE OR REPLACE FUNCTION public.get_or_create_active_session(
  p_user_id uuid, p_anon_session_id text, p_now timestamptz, p_cluster_hours numeric,
  p_active_session_id uuid DEFAULT NULL)          -- NEW, defaults null = old behavior
RETURNS jsonb LANGUAGE plpgsql AS $function$
declare
  v_owner_key text;
  v_session_id uuid;
  v_has_prior boolean := false;
begin
  v_owner_key := coalesce(p_user_id::text, 'anon:' || coalesce(p_anon_session_id, ''));
  perform pg_advisory_xact_lock(hashtextextended(v_owner_key, 0));

  -- NEW: manual activation branch. Validates ownership before attaching.
  -- On any miss (null, not found, or owner mismatch) falls through to the
  -- existing 4-hour logic below — never errors, never attaches cross-owner.
  if p_active_session_id is not null then
    select id into v_session_id
    from sessions
    where id = p_active_session_id
      and ( (p_user_id is not null and user_id = p_user_id)
         or (p_user_id is null and anon_session_id = p_anon_session_id) )
    for update;

    if v_session_id is not null then
      update sessions set last_solve_at = p_now where id = v_session_id;
      return jsonb_build_object('session_id', v_session_id, 'created', false,
                                'boundary_crossed', false, 'via_activation', true);
    end if;
    -- else: fall through to clustering (stale/forged/foreign id ignored safely)
  end if;

  -- ===== existing logic below, UNCHANGED =====
  select id into v_session_id
  from sessions
  where ( (p_user_id is not null and user_id = p_user_id)
       or (p_user_id is null and anon_session_id = p_anon_session_id) )
    and last_solve_at >= p_now - make_interval(hours => p_cluster_hours::integer)
  order by last_solve_at desc limit 1 for update;

  if v_session_id is not null then
    update sessions set last_solve_at = p_now where id = v_session_id;
    return jsonb_build_object('session_id', v_session_id, 'created', false, 'boundary_crossed', false);
  end if;

  select exists( select 1 from sessions
    where (p_user_id is not null and user_id = p_user_id)
       or (p_user_id is null and anon_session_id = p_anon_session_id) ) into v_has_prior;

  insert into sessions (user_id, anon_session_id, name, source, created_at, last_solve_at)
  values (p_user_id, p_anon_session_id, null, 'auto', p_now, p_now)
  returning id into v_session_id;

  return jsonb_build_object('session_id', v_session_id, 'created', true, 'boundary_crossed', v_has_prior);
end; $function$
