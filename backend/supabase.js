const { createClient } = require('@supabase/supabase-js');
const { SESSION_CLUSTER_HOURS } = require('./sessionConfig');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// problem_kind → display label for session auto-naming
const KIND_LABELS = {
  equation:       'Algebra',
  system:         'Systems',
  inequality:     'Inequalities',
  expression:     'Expressions',
  calculus:       'Calculus',
  differentiation:'Calculus',
  integration:    'Calculus',
  physics:        'Physics',
  unknown:        'Mixed',
};

function kindDisplayLabel(kind) {
  return KIND_LABELS[kind] || (kind ? kind.charAt(0).toUpperCase() + kind.slice(1) : 'Mixed');
}

function sessionDateLabel(createdAt) {
  const d = new Date(createdAt);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

async function insertSolve({ userId, anonSessionId, rawInput, mode, artifact, activeSessionId }) {
  const ver = artifact?.verification || {};
  const np = artifact?.normalized_payload || {};
  const problemKind = np.type || null;

  // ---- 1. Derive or create the cluster session via advisory-locked Postgres function ----
  let clusterSessionId = null;
  let sessionCreated = false;
  let boundaryCrossed = false;
  let viaActivation = false;

  try {
    const now = new Date().toISOString();
    const { data: rpcData, error: rpcError } = await supabase.rpc(
      'get_or_create_active_session',
      {
        p_user_id:           userId || null,
        p_anon_session_id:   userId ? null : (anonSessionId || null),
        p_now:               now,
        p_cluster_hours:     SESSION_CLUSTER_HOURS,
        p_active_session_id: activeSessionId || null,
      }
    );

    if (rpcError) {
      console.error('[insertSolve] get_or_create_active_session error:', rpcError.message);
    } else if (rpcData) {
      clusterSessionId = rpcData.session_id || null;
      sessionCreated   = rpcData.created    || false;
      boundaryCrossed  = rpcData.boundary_crossed || false;
      viaActivation    = rpcData.via_activation || false;
    }
  } catch (rpcErr) {
    console.error('[insertSolve] RPC call threw:', rpcErr.message);
  }

  // ---- 2. Insert the solve row (post-migration schema) ----
  const { data, error } = await supabase
    .from('solves')
    .insert({
      user_id:            userId || null,
      anon_session_id:    userId ? null : (anonSessionId || null),
      cluster_session_id: clusterSessionId,
      raw_input:          rawInput,
      mode,
      artifact,
      build_version:      artifact?.build_version || '',
      badge:              ver.badge || 'not_verified',
      reason_code:        ver.reason_code || null,
      problem_kind:       problemKind,
      original_badge:     ver.badge || 'not_verified',
    })
    .select('id, anon_session_id, user_id, created_at')
    .single();

  if (error) throw error;

  // ---- 3. Auto-name the session; capture name+created_at for /solve response ----
  let sessionMeta = null;
  if (clusterSessionId) {
    try {
      sessionMeta = await recomputeSessionName(clusterSessionId, viaActivation);
    } catch (nameErr) {
      console.error('[insertSolve] session naming error (non-fatal):', nameErr.message);
    }
  }

  // ---- 4. Fire-and-forget event logs ----
  // Lazy import to avoid circular dep (eventLog imports supabase)
  let logEvent;
  try { logEvent = require('./eventLog').logEvent; } catch { /* ignore */ }

  if (logEvent && clusterSessionId) {
    if (boundaryCrossed && !viaActivation) {
      logEvent({
        kind:       'session.cluster_boundary',
        severity:   'info',
        sessionId:  clusterSessionId,
        userId:     userId || null,
        buildVersion: artifact?.build_version || '',
        payload: {
          session_id:  clusterSessionId,
          owner_type:  userId ? 'authenticated' : 'anonymous',
        },
        message: 'New solve created a new session — prior session outside cluster window',
      });
    }

    // Cross-kind signal: check if first problem kind in session differs from current dominant
    if (problemKind) {
      try {
        await checkCrossKindSignal({ clusterSessionId, logEvent, artifact, userId });
      } catch (ckErr) {
        console.error('[insertSolve] cross-kind check error (non-fatal):', ckErr.message);
      }
    }
  }

  return {
    id:                 data.id,
    anon_session_id:    data.anon_session_id,
    user_id:            data.user_id,
    created_at:         data.created_at,
    cluster_session_id: clusterSessionId,
    // Session metadata for optimistic sidebar reconcile (Option A — additive)
    session: sessionMeta
      ? { name: sessionMeta.name, created_at: sessionMeta.created_at, is_new: sessionCreated }
      : null,
  };
}

async function recomputeSessionName(sessionId, viaActivation = false) {
  // Read session source and created_at
  const { data: session, error: sessErr } = await supabase
    .from('sessions')
    .select('source, created_at, name')
    .eq('id', sessionId)
    .single();

  if (sessErr || !session) return null;

  // Freeze: a deliberate reopen-and-append turns an auto-label into a landmark the
  // user navigated back to. Flip source before the auto-rename guard below so the
  // rename is naturally skipped — no separate skip-condition needed.
  if (viaActivation && session.source === 'auto') {
    await supabase
      .from('sessions')
      .update({ source: 'reopened' })
      .eq('id', sessionId)
      .eq('source', 'auto'); // double-guard: never flip an already-renamed/batch session
    return { name: session.name, created_at: session.created_at };
  }

  // For renamed/batch/reopened sessions, skip recompute but still return current name + created_at
  if (session.source !== 'auto') {
    return { name: session.name, created_at: session.created_at };
  }

  // Dominant kind: group by problem_kind, order by count desc, then most recent
  const { data: kinds } = await supabase
    .from('solves')
    .select('problem_kind')
    .eq('cluster_session_id', sessionId)
    .not('problem_kind', 'is', null);

  if (!kinds || kinds.length === 0) {
    return { name: session.name, created_at: session.created_at };
  }

  const counts = {};
  for (const row of kinds) {
    const k = row.problem_kind;
    counts[k] = (counts[k] || 0) + 1;
  }

  const dominant = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])[0]?.[0];

  if (!dominant) return { name: session.name, created_at: session.created_at };

  const label = kindDisplayLabel(dominant);
  const dateStr = sessionDateLabel(session.created_at);
  const newName = `${label}, ${dateStr}`;

  if (newName !== session.name) {
    await supabase
      .from('sessions')
      .update({ name: newName })
      .eq('id', sessionId)
      .eq('source', 'auto'); // double-guard: never overwrite renamed/batch
  }

  return { name: newName, created_at: session.created_at };
}

async function checkCrossKindSignal({ clusterSessionId, logEvent, artifact, userId }) {
  const { data: solves } = await supabase
    .from('solves')
    .select('problem_kind, created_at')
    .eq('cluster_session_id', clusterSessionId)
    .not('problem_kind', 'is', null)
    .order('created_at', { ascending: true });

  if (!solves || solves.length < 2) return;

  const firstKind = solves[0].problem_kind;

  const counts = {};
  for (const row of solves) {
    const k = row.problem_kind;
    counts[k] = (counts[k] || 0) + 1;
  }
  const dominantKind = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])[0]?.[0];

  if (dominantKind && firstKind !== dominantKind) {
    logEvent({
      kind:       'session.cross_kind_first_problem',
      severity:   'info',
      sessionId:  clusterSessionId,
      userId:     userId || null,
      buildVersion: artifact?.build_version || '',
      payload: {
        session_id:    clusterSessionId,
        first_kind:    firstKind,
        dominant_kind: dominantKind,
      },
      message: 'Session first problem kind differs from dominant kind',
    });
  }
}

async function updateSolveVerification({ solveId, artifact }) {
  const ver = artifact?.verification || {};
  await supabase.from('solves').update({
    artifact,
    badge: ver.badge || 'not_verified',
  }).eq('id', solveId);
}

// Decode JWT payload locally — avoids a network round-trip to Supabase auth on every request.
// The 'sub' claim is the user ID; Supabase always sets it.
function getUserFromToken(token) {
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
    if (!payload.sub) return null;
    return { id: payload.sub, email: payload.email || null };
  } catch {
    return null;
  }
}

module.exports = {
  supabase,
  insertSolve,
  updateSolveVerification,
  getUserFromToken,
  recomputeSessionName,
  kindDisplayLabel,
};
