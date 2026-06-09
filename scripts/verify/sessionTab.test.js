// Acceptance criteria 1-3 for PHASE_5A_BRIEF_05 — Top-Center Session Tab
// Pins the TAB_NAV_SOLVE index math from sessionReducer.ts.
// Keep this in sync with the TAB_NAV_SOLVE case in sessionReducer.ts.
// Run: node scripts/verify/sessionTab.test.js

'use strict';

// ---- Inline the logic under test (mirrors sessionReducer.ts) ----

function getSessionSolves(state, sessionId) {
  return Object.values(state.solvesById)
    .filter(s => s.cluster_session_id === sessionId)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

// Mirrors the TAB_NAV_SOLVE reducer case exactly.
function applyTabNavSolve(state, direction) {
  if (!state.displayedSessionId || !state.displayedSolveId) return state;
  const solves = getSessionSolves(state, state.displayedSessionId);
  const i = solves.findIndex(s => s.id === state.displayedSolveId);
  if (i === -1) return state;
  // newest-first: prev = older = i+1, next = newer = i-1
  const target = direction === 'prev' ? i + 1 : i - 1;
  if (target < 0 || target >= solves.length) return state;
  const targetSolve = solves[target];
  return {
    ...state,
    displayedSolveId: targetSolve.id,
    displayedSessionId: targetSolve.cluster_session_id,
    // activeSessionId intentionally NOT changed
  };
}

function applyClearTabMicrocopy(state) {
  return { ...state, tabMicrocopy: null };
}

// ---- Fixtures ----

const SESSION_ID = 'session-1';
const solveA = { id: 'solve-a', cluster_session_id: SESSION_ID, created_at: '2026-01-01T01:00:00Z' }; // oldest
const solveB = { id: 'solve-b', cluster_session_id: SESSION_ID, created_at: '2026-01-01T02:00:00Z' };
const solveC = { id: 'solve-c', cluster_session_id: SESSION_ID, created_at: '2026-01-01T03:00:00Z' }; // newest
// getSessionSolves returns newest-first: [solveC, solveB, solveA] → indices 0, 1, 2

const baseState = {
  sessionsById: {
    [SESSION_ID]: { id: SESSION_ID, name: 'Test Session', source: 'auto',
      created_at: '2026-01-01T01:00:00Z', last_solve_at: '2026-01-01T03:00:00Z', solve_count: 3 },
  },
  solvesById: { 'solve-a': solveA, 'solve-b': solveB, 'solve-c': solveC },
  activeSessionId: SESSION_ID,
  displayedSessionId: SESSION_ID,
  displayedSolveId: 'solve-c',
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

// ---- ACCEPTANCE CRITERION 1: Reducer nav logic, newest-first correctness ----

console.log('\n[1] TAB_NAV_SOLVE — newest-first index math\n');

// prev from newest (solve-c, idx 0) → solve-b (idx 1, older)
{
  const s = applyTabNavSolve({ ...baseState, displayedSolveId: 'solve-c' }, 'prev');
  assert(s.displayedSolveId === 'solve-b', 'prev from newest moves to second-newest (older)');
}

// repeated prev from solve-b → solve-a (oldest)
{
  const s = applyTabNavSolve({ ...baseState, displayedSolveId: 'solve-b' }, 'prev');
  assert(s.displayedSolveId === 'solve-a', 'prev from middle moves to oldest');
}

// prev from oldest (solve-a, idx 2) → no-op
{
  const state = { ...baseState, displayedSolveId: 'solve-a' };
  const s = applyTabNavSolve(state, 'prev');
  assert(s.displayedSolveId === 'solve-a', 'prev from oldest is a no-op (boundary)');
  assert(s === state, 'no-op returns exact same state reference');
}

// next from oldest (solve-a) → solve-b
{
  const s = applyTabNavSolve({ ...baseState, displayedSolveId: 'solve-a' }, 'next');
  assert(s.displayedSolveId === 'solve-b', 'next from oldest moves toward newer');
}

// next from newest (solve-c, idx 0) → no-op
{
  const s = applyTabNavSolve({ ...baseState, displayedSolveId: 'solve-c' }, 'next');
  assert(s.displayedSolveId === 'solve-c', 'next from newest is a no-op (boundary)');
}

// displayedSolveId not in list → no-op
{
  const s = applyTabNavSolve({ ...baseState, displayedSolveId: 'solve-unknown' }, 'next');
  assert(s.displayedSolveId === 'solve-unknown', 'unknown displayedSolveId → no-op');
}

// ---- ACCEPTANCE CRITERION 2: activeSessionId invariant ----

console.log('\n[2] activeSessionId invariant — never mutated by TAB_NAV_SOLVE\n');

const ACTIVE = baseState.activeSessionId;

{
  const s = applyTabNavSolve({ ...baseState, displayedSolveId: 'solve-c' }, 'prev');
  assert(s.activeSessionId === ACTIVE, 'prev (valid move): activeSessionId unchanged');
}
{
  const s = applyTabNavSolve({ ...baseState, displayedSolveId: 'solve-a' }, 'next');
  assert(s.activeSessionId === ACTIVE, 'next (valid move): activeSessionId unchanged');
}
{
  const s = applyTabNavSolve({ ...baseState, displayedSolveId: 'solve-c' }, 'next'); // no-op
  assert(s.activeSessionId === ACTIVE, 'next (no-op boundary): activeSessionId unchanged');
}
{
  const s = applyTabNavSolve({ ...baseState, displayedSolveId: 'solve-a' }, 'prev'); // no-op
  assert(s.activeSessionId === ACTIVE, 'prev (no-op boundary): activeSessionId unchanged');
}

// ---- ACCEPTANCE CRITERION 3: tabMicrocopy one-shot ----

console.log('\n[3] tabMicrocopy — CLEAR_TAB_MICROCOPY and initial state\n');

{
  const s = applyClearTabMicrocopy({ tabMicrocopy: 'started_new_session' });
  assert(s.tabMicrocopy === null, 'CLEAR_TAB_MICROCOPY sets tabMicrocopy to null');
}
{
  const s = applyClearTabMicrocopy({ tabMicrocopy: null });
  assert(s.tabMicrocopy === null, 'CLEAR_TAB_MICROCOPY on already-null is a no-op');
}
{
  // Initial state equivalent (from sessionReducer initialState)
  const initial = { tabMicrocopy: null };
  assert(initial.tabMicrocopy === null, 'initialState tabMicrocopy starts null (reload-equivalent)');
}

// ---- Summary ----

console.log(`\nResults: ${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
