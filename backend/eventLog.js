const fs = require('fs');
const path = require('path');
const { supabase } = require('./supabase');
const { assertValidKind, assertValidSeverity } = require('./eventKinds');

const LOG_DIR = path.join(__dirname, 'logs');
const FALLBACK_PATH = path.join(LOG_DIR, 'events-fallback.jsonl');

try {
  fs.mkdirSync(LOG_DIR, { recursive: true });
} catch (err) {
  console.error('[eventLog] Failed to create log directory:', err.message);
}

/**
 * Generate a correlation ID for tracing a single user action across handlers.
 * Use at the start of /solve, then thread through to /verify and any downstream calls.
 */
function newCorrelationId() {
  // Lightweight uuid v4 — no external dep
  return 'cid_' + ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
    (c ^ (require('crypto').randomBytes(1)[0] & 15) >> (c / 4)).toString(16)
  );
}

/**
 * Fire-and-forget event log. Never throws to caller (except on vocabulary violation).
 * Failures fall back to local JSONL so a Supabase outage doesn't lose data.
 *
 * @param {object} event
 * @param {string} event.kind — must be in EVENT_KINDS
 * @param {string} event.severity — 'info' | 'warn' | 'error'
 * @param {string} [event.correlationId] — uuid tying this event to a user action
 * @param {string} [event.userId]
 * @param {string} [event.sessionId]
 * @param {string} [event.buildVersion]
 * @param {object} [event.payload] — structured data only; NEVER raw user input
 * @param {string} [event.message] — one-line human summary
 */
function logEvent({ kind, severity, correlationId, userId, sessionId, buildVersion, payload, message }) {
  // Vocabulary enforcement — this is the only thing logEvent throws on.
  assertValidKind(kind);
  assertValidSeverity(severity);

  const row = {
    kind,
    severity,
    correlation_id: correlationId || null,
    user_id: userId || null,
    session_id: sessionId || null,
    build_version: buildVersion || null,
    payload: payload || {},
    message: message || null,
  };

  // Fire-and-forget Supabase write
  supabase.from('events').insert(row).then(({ error }) => {
    if (error) {
      writeFallback(row, error.message);
    }
  }).catch(err => {
    writeFallback(row, err.message);
  });
}

function writeFallback(row, reason) {
  try {
    const line = JSON.stringify({ ...row, _fallback_reason: reason, _ts: new Date().toISOString() }) + '\n';
    fs.appendFileSync(FALLBACK_PATH, line);
  } catch (err) {
    console.error('[eventLog] Fallback write failed:', err.message);
  }
}

module.exports = { logEvent, newCorrelationId };
