const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function insertSolve({ userId, sessionId, rawInput, mode, artifact }) {
  const ver = artifact?.verification || {};
  const np = artifact?.normalized_payload || {};

  const { data, error } = await supabase
    .from('solves')
    .insert({
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
    })
    .select('id, session_id, user_id, created_at')
    .single();

  if (error) throw error;
  return data;
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

module.exports = { supabase, insertSolve, updateSolveVerification, getUserFromToken };
