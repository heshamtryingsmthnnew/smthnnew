const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function insertSolve({ userId, sessionId, rawInput, mode, artifact }) {
  const ver = artifact?.verification || {};
  const np = artifact?.normalized_payload || {};

  await supabase.from('solves').insert({
    user_id: userId || null,
    session_id: userId ? null : (sessionId || null),
    raw_input: rawInput,
    mode,
    artifact,
    build_version: artifact?.build_version || '',
    badge: ver.badge || 'not_verified',
    reason_code: ver.reason_code || null,
    problem_kind: np.type || null,
    original_badge: ver.badge || 'not_verified',
  });
}

async function updateSolveVerification({ solveId, artifact }) {
  const ver = artifact?.verification || {};
  await supabase.from('solves').update({
    artifact,
    badge: ver.badge || 'not_verified',
  }).eq('id', solveId);
}

async function getUserFromToken(token) {
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

module.exports = { supabase, insertSolve, updateSolveVerification, getUserFromToken };
