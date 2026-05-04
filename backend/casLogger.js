'use strict';

const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'cas-events.jsonl');

// Ensure logs/ exists at module load — once, not on every write
try {
  fs.mkdirSync(LOG_DIR, { recursive: true });
} catch (err) {
  console.error('[casLogger] Failed to create logs directory:', err.message);
}

/**
 * Append one CAS comparison event as a JSON line to cas-events.jsonl.
 * Never throws — write failures are logged to console and swallowed so the
 * CAS path is never affected by logger failures.
 *
 * Event shape:
 *   timestamp, build_version, question, mode,
 *   wolfram_query, wolfram_kind, wolfram_success, wolfram_result,
 *   claude_answer, verdict,
 *   numeric_attempts (null — Phase 2 placeholder),
 *   numeric_matches  (null — Phase 2 placeholder)
 */
function logCasEvent(event) {
  try {
    const line = JSON.stringify({
      timestamp: new Date().toISOString(),
      build_version: event.build_version ?? null,
      question: event.question ?? '',
      mode: event.mode ?? 'math',
      wolfram_query: event.wolfram_query ?? null,
      wolfram_kind: event.wolfram_kind ?? null,
      wolfram_success: event.wolfram_success ?? false,
      wolfram_result: event.wolfram_result ?? null,
      claude_answer: event.claude_answer ?? '',
      verdict: event.verdict ?? 'unavailable',
      numeric_attempts: null,   // Phase 3: populate from compareWithWolfram instrumentation
      numeric_matches: null,    // Phase 3: populate from compareWithWolfram instrumentation
      verdict_tier: null,       // Phase 3: 'numeric' | 'model' | 'unavailable'
    });
    fs.appendFileSync(LOG_FILE, line + '\n', 'utf8');
  } catch (err) {
    console.error('[casLogger] Failed to write event:', err.message);
  }
}

module.exports = { logCasEvent };
