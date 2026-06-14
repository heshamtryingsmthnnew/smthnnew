// Acceptance criteria 1-3 for PHASE_5A_BRIEF_06_1 — Freeze Reopened Session Names
// Mirrors backend/supabase.js recomputeSessionName()'s branching against an in-memory
// session + solves stand-in (no live DB). Keep in sync with supabase.js.
// Criterion 4 (SessionMeta accepts 'reopened'; tsc --noEmit clean) is verified via
// `npx tsc --noEmit` in the frontend, not here.
// Run: node scripts/verify/reopenedNames.test.js

'use strict';

// ---- Inline the logic under test (mirrors backend/supabase.js recomputeSessionName) ----

const KIND_LABELS = {
  equation:        'Algebra',
  system:          'Systems',
  inequality:      'Inequalities',
  expression:      'Expressions',
  calculus:        'Calculus',
  differentiation: 'Calculus',
  integration:     'Calculus',
  physics:         'Physics',
  unknown:         'Mixed',
};

function kindDisplayLabel(kind) {
  return KIND_LABELS[kind] || (kind ? kind.charAt(0).toUpperCase() + kind.slice(1) : 'Mixed');
}

function sessionDateLabel(createdAt) {
  const d = new Date(createdAt);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

// session: { source, created_at, name }; solves: [{ problem_kind }]
function recomputeSessionName(session, solves, viaActivation = false) {
  // Freeze: a deliberate reopen-and-append turns an auto-label into a landmark.
  // Flip source before the auto-rename guard so the rename is naturally skipped.
  if (viaActivation && session.source === 'auto') {
    return { ...session, source: 'reopened' }; // name/created_at unchanged
  }

  // renamed/batch/reopened: skip recompute
  if (session.source !== 'auto') {
    return { ...session };
  }

  if (!solves || solves.length === 0) return { ...session };

  const counts = {};
  for (const row of solves) counts[row.problem_kind] = (counts[row.problem_kind] || 0) + 1;
  const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!dominant) return { ...session };

  const newName = `${kindDisplayLabel(dominant)}, ${sessionDateLabel(session.created_at)}`;
  return { ...session, name: newName };
}

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

// ---- ACCEPTANCE CRITERION 1: via_activation append to 'auto' session freezes it ----

console.log('\n[1] via_activation append to an \'auto\' session — flips source to \'reopened\', name frozen\n');

{
  const session = { source: 'auto', created_at: '2026-06-07T01:00:00Z', name: 'Calculus, Jun 7' };
  // Dominant kind would shift to physics (3 vs 2) if recomputed
  const solves = [
    { problem_kind: 'calculus' }, { problem_kind: 'calculus' },
    { problem_kind: 'physics' }, { problem_kind: 'physics' }, { problem_kind: 'physics' },
  ];
  const result = recomputeSessionName(session, solves, true);
  assert(result.source === 'reopened', 'source flips from \'auto\' to \'reopened\'');
  assert(result.name === 'Calculus, Jun 7', 'name unchanged despite dominant kind shifting to physics');
}

// ---- ACCEPTANCE CRITERION 2: normal (non-activation) append to 'auto' session still recomputes ----

console.log('\n[2] normal append to an \'auto\' session — still recomputes/renames (regression)\n');

{
  const session = { source: 'auto', created_at: '2026-06-07T01:00:00Z', name: 'Calculus, Jun 7' };
  const solves = [
    { problem_kind: 'physics' }, { problem_kind: 'physics' }, { problem_kind: 'calculus' },
  ];
  const result = recomputeSessionName(session, solves, false);
  assert(result.source === 'auto', 'source remains \'auto\' on normal clustering append');
  assert(result.name === 'Physics, Jun 7', 'name recomputes to dominant kind (Physics)');
}

// ---- ACCEPTANCE CRITERION 3: append to a 'renamed' session leaves source and name unchanged ----

console.log('\n[3] append to a \'renamed\' session — source and name unchanged (regression)\n');

{
  const session = { source: 'renamed', created_at: '2026-06-07T01:00:00Z', name: 'My Exam Prep' };
  const solves = [{ problem_kind: 'physics' }];

  const viaClustering = recomputeSessionName(session, solves, false);
  assert(viaClustering.source === 'renamed', 'source unchanged on normal append to renamed session');
  assert(viaClustering.name === 'My Exam Prep', 'name unchanged on normal append to renamed session');

  const viaActivation = recomputeSessionName(session, solves, true);
  assert(viaActivation.source === 'renamed', 'source unchanged on activation append to renamed session');
  assert(viaActivation.name === 'My Exam Prep', 'name unchanged on activation append to renamed session');
}

// ---- Extra regression: a session already 'reopened' stays frozen on further activation appends ----

console.log('\n[4] append to an already-\'reopened\' session — stays frozen (regression)\n');

{
  const session = { source: 'reopened', created_at: '2026-06-07T01:00:00Z', name: 'Calculus, Jun 7' };
  const solves = [{ problem_kind: 'physics' }, { problem_kind: 'physics' }];
  const result = recomputeSessionName(session, solves, true);
  assert(result.source === 'reopened', 'source remains \'reopened\'');
  assert(result.name === 'Calculus, Jun 7', 'name remains frozen');
}

// ---- Summary ----

console.log(`\nResults: ${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
