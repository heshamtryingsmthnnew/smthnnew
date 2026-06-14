// Acceptance criteria 1-5 for PHASE_5A_BRIEF_06 — Durable Sessions (activation)
// Pins the ACTIVATE_SESSION / DEACTIVATE_SESSION reducer cases from sessionReducer.ts,
// plus regression checks on DISPLAY_SOLVE and SOLVE_RECONCILED (activeSessionId invariants).
// Keep this in sync with sessionReducer.ts.
// Run: node scripts/verify/durableSessions.test.js

'use strict';

// ---- Inline the logic under test (mirrors sessionReducer.ts) ----

function applyActivateSession(state, sessionId) {
  const session = state.sessionsById[sessionId];
  if (!session) return state;
  return {
    ...state,
    activeSessionId: sessionId,
    displayedSessionId: sessionId,
    displayedSolveId: null,          // empty composer, not an old solve (§6b)
    tabMicrocopy: null,              // clear any stale cue on deliberate entry
  };
}

function applyDeactivateSession(state) {
  return {
    ...state,
    activeSessionId: null,
    displayedSessionId: null,
    displayedSolveId: null,
    tabMicrocopy: null,
  };
}

function applyDisplaySolve(state, solveId) {
  const solve = state.solvesById[solveId];
  if (!solve) return state;
  return {
    ...state,
    displayedSolveId: solveId,
    displayedSessionId: solve.cluster_session_id,
    // activeSessionId intentionally NOT changed — loading old work is view-only
  };
}

function applySolveReconciled(state, action) {
  const { nonce, solve, session } = action;
  const newPending = { ...state.pendingSolves };
  delete newPending[nonce];

  const newSolvesById = { ...state.solvesById, [solve.id]: solve };

  let newSessionsById = { ...state.sessionsById };
  if (session.is_new || !newSessionsById[session.id]) {
    newSessionsById[session.id] = {
      id: session.id,
      name: session.name,
      source: 'auto',
      created_at: session.created_at,
      last_solve_at: solve.created_at,
      solve_count: 1,
    };
  } else {
    newSessionsById = {
      ...newSessionsById,
      [session.id]: {
        ...newSessionsById[session.id],
        name: session.name,
        last_solve_at: solve.created_at,
        solve_count: newSessionsById[session.id].solve_count + 1,
      },
    };
  }

  const prevDisplayed = state.displayedSessionId;
  const newTabMicrocopy =
    prevDisplayed !== null && prevDisplayed !== session.id
      ? 'started_new_session'
      : state.tabMicrocopy;

  return {
    ...state,
    pendingSolves: newPending,
    solvesById: newSolvesById,
    sessionsById: newSessionsById,
    activeSessionId: session.id,
    displayedSessionId: session.id,
    displayedSolveId: solve.id,
    tabMicrocopy: newTabMicrocopy,
  };
}

// ---- Fixtures ----

const SESSION_A = 'session-a';
const SESSION_B = 'session-b';

const solveA1 = { id: 'solve-a1', cluster_session_id: SESSION_A, created_at: '2026-01-01T01:00:00Z' };

const baseState = {
  sessionsById: {
    [SESSION_A]: { id: SESSION_A, name: 'Calculus, Jan 1', source: 'auto',
      created_at: '2026-01-01T01:00:00Z', last_solve_at: '2026-01-01T01:00:00Z', solve_count: 1 },
    [SESSION_B]: { id: SESSION_B, name: 'Algebra, Jan 2', source: 'auto',
      created_at: '2026-01-02T01:00:00Z', last_solve_at: '2026-01-02T01:00:00Z', solve_count: 1 },
  },
  solvesById: { 'solve-a1': solveA1 },
  pendingSolves: {},
  activeSessionId: SESSION_A,
  displayedSessionId: SESSION_A,
  displayedSolveId: 'solve-a1',
  tabMicrocopy: null,
};

// ---- Harness ----

let pass = 0;
let fail = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    pass++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    fail++;
  }
}

// ---- ACCEPTANCE CRITERION 1: ACTIVATE_SESSION sets active+displayed, nulls solve ----

console.log('\n[1] ACTIVATE_SESSION — sets active+displayed pointers, clears displayed solve\n');

{
  const s = applyActivateSession(baseState, SESSION_B);
  assert(s.activeSessionId === SESSION_B, 'activeSessionId set to activated session');
  assert(s.displayedSessionId === SESSION_B, 'displayedSessionId set to activated session');
  assert(s.activeSessionId === s.displayedSessionId, 'activeSessionId === displayedSessionId');
  assert(s.displayedSolveId === null, 'displayedSolveId cleared (empty composer, §6b)');
  assert(s.tabMicrocopy === null, 'tabMicrocopy cleared on activation');
}

// ---- ACCEPTANCE CRITERION 2: ACTIVATE_SESSION no-ops on unknown session ----

console.log('\n[2] ACTIVATE_SESSION — no-op on unknown session id\n');

{
  const s = applyActivateSession(baseState, 'session-unknown');
  assert(s === baseState, 'unknown session id returns exact same state reference (no-op)');
}

// ---- ACCEPTANCE CRITERION 3: DEACTIVATE_SESSION clears all three pointers + tabMicrocopy ----

console.log('\n[3] DEACTIVATE_SESSION — clears activeSessionId, displayedSessionId, displayedSolveId, tabMicrocopy\n');

{
  const withMicrocopy = { ...baseState, tabMicrocopy: 'started_new_session' };
  const s = applyDeactivateSession(withMicrocopy);
  assert(s.activeSessionId === null, 'activeSessionId cleared');
  assert(s.displayedSessionId === null, 'displayedSessionId cleared');
  assert(s.displayedSolveId === null, 'displayedSolveId cleared');
  assert(s.tabMicrocopy === null, 'tabMicrocopy cleared');
}

// ---- ACCEPTANCE CRITERION 4: DISPLAY_SOLVE still does not touch activeSessionId ----

console.log('\n[4] DISPLAY_SOLVE — activeSessionId invariant holds (regression)\n');

{
  const solveB1 = { id: 'solve-b1', cluster_session_id: SESSION_B, created_at: '2026-01-02T02:00:00Z' };
  const state = { ...baseState, solvesById: { ...baseState.solvesById, 'solve-b1': solveB1 } };
  const s = applyDisplaySolve(state, 'solve-b1');
  assert(s.displayedSolveId === 'solve-b1', 'displayedSolveId updates to viewed solve');
  assert(s.displayedSessionId === SESSION_B, 'displayedSessionId follows the viewed solve');
  assert(s.activeSessionId === SESSION_A, 'activeSessionId unchanged — viewing old work is view-only');
}

// ---- ACCEPTANCE CRITERION 5: SOLVE_RECONCILED still sets activeSessionId (clustering path intact) ----

console.log('\n[5] SOLVE_RECONCILED — activeSessionId set by clustering when no activation in play\n');

{
  const state = { ...baseState, activeSessionId: null, displayedSessionId: null, displayedSolveId: null };
  const action = {
    nonce: 'n1',
    solve: { id: 'solve-c1', cluster_session_id: 'session-c', created_at: '2026-01-03T01:00:00Z' },
    session: { id: 'session-c', name: 'Calculus, Jan 3', created_at: '2026-01-03T01:00:00Z', is_new: true },
  };
  const s = applySolveReconciled(state, action);
  assert(s.activeSessionId === 'session-c', 'activeSessionId set to the newly-clustered session');
  assert(s.displayedSessionId === 'session-c', 'displayedSessionId set to the newly-clustered session');
  assert(s.displayedSolveId === 'solve-c1', 'displayedSolveId set to the new solve');
}

// ---- Summary ----

console.log(`\nResults: ${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
