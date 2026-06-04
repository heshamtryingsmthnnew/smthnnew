// Event kinds vocabulary.
// Adding a kind: update this object AND document the addition in CLAUDE.md Section 17.
// Removing a kind: confirm no call sites remain, then remove from this object and CLAUDE.md.
//
// debug.observation is intentionally outside the structured vocabulary.
// Every debug.observation call site must be removed before Phase 6 launch.

const EVENT_KINDS = Object.freeze({
  // Solve path
  'solve.success':              'Solve completed successfully (sampled — solves table is primary record)',
  'solve.model_parse_fail':     'Model returned non-JSON or missing required fields',
  'solve.verify_fail':          'Verifier threw or returned verification_error',
  'solve.exception':            'Uncaught exception in /solve handler',

  // Verify path
  'verify.cas_timeout':         'Wolfram API exceeded timeout',
  'verify.cas_skipped':         'CAS skipped (null wolfram_query or non-CAS-eligible kind)',
  'verify.compare_unavailable': 'compareWithWolfram returned unavailable (both numeric and model tiers fell through)',
  'audit.parse_fail':           'Physics audit returned unparseable output',

  // Extract path
  'extract.no_problems_found':  'Vision returned empty array',
  'extract.unsupported_mimetype': 'File rejected by mimetype filter',
  'extract.exception':          'Uncaught exception in /extract-problem',

  // Batch path
  'batch.problem_failed':       'Individual problem failed in batch processing',
  'batch.extract_failed':       'Batch extraction failed (parse or model error)',

  // Auth + history
  'auth.merge_failed':          'Anonymous session merge into authenticated user failed',
  'history.revalidation_failed': 'Lazy Tier 1 revalidation threw',

  // Session (Phase 5a — registered now, call sites added in Brief #3)
  'session.renamed':                  'User renamed a session (source -> renamed). Measures auto-name accuracy.',
  'session.loaded_without_new_solve': 'User opened an old session but fired no new solve. Browsing vs continuing — OPEN QUESTION 2 signal.',
  'session.cross_kind_first_problem': 'Session first problem_kind differs from the dominant kind. Workflow-mix signal.',
  'session.cluster_boundary':         'New solve created a new session because the prior solve fell outside SESSION_CLUSTER_HOURS. Measures whether 4h is the binding threshold.',

  // Frontend (registered now, instrumented in a future commit)
  'frontend.katex_render_fail': 'KaTeXBoundary tripped — invalid LaTeX rendered',
  'frontend.desmos_init_fail':  'Desmos calculator failed to initialize',
  'frontend.sse_stream_break':  'Batch solve SSE stream disconnected unexpectedly',

  // Catch-all for testing-phase discoverability — DELETE all call sites before Phase 6
  'debug.observation':          'Ad-hoc observation during testing. Promote to a structured kind or delete before launch.',
});

const SEVERITIES = Object.freeze(['info', 'warn', 'error']);

function assertValidKind(kind) {
  if (!EVENT_KINDS[kind]) {
    throw new Error(
      `[eventLog] Unknown event kind: "${kind}". ` +
      `Add it to backend/eventKinds.js or use an existing kind. ` +
      `See CLAUDE.md Section 17 for the vocabulary.`
    );
  }
}

function assertValidSeverity(severity) {
  if (!SEVERITIES.includes(severity)) {
    throw new Error(
      `[eventLog] Invalid severity: "${severity}". ` +
      `Must be one of: ${SEVERITIES.join(', ')}.`
    );
  }
}

module.exports = { EVENT_KINDS, SEVERITIES, assertValidKind, assertValidSeverity };
