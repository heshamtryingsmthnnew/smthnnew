'use strict';

// Regression harness for compareWithWolfram.
// Run with: node backend/wolfram_compare_test.js
// Requires ANTHROPIC_API_KEY in backend/.env for model equivalence tier (B1/B2 cases).

require('dotenv').config();
const { compareWithWolfram } = require('./wolfram');

const TEST_CASES = [
  // --- WORKING: regression guards ---
  {
    label: 'Differentiation: sin(sin(x²)) — confirmed',
    claudeAnswer: '\\cos(\\sin(x^2)) \\cdot \\cos(x^2) \\cdot 2x',
    wolframResult: '2 x cos(x^2) cos(sin(x^2))',
    kind: 'differentiation',
    expectedVerdict: 'confirmed',
    category: 'WORKING',
    notes: 'Clean case from production logs. Numeric sampling handles this.',
  },
  {
    label: 'Integration: polynomial — confirmed',
    claudeAnswer: '\\frac{x^4}{4} - \\frac{x^3}{3} + \\frac{x^2}{2} - x',
    wolframResult: 'x^4/4 - x^3/3 + x^2/2 - x',
    kind: 'integration',
    expectedVerdict: 'confirmed',
    category: 'WORKING',
    notes: 'Polynomial integration, no special functions.',
  },

  // --- B2: log(x) as natural log in Wolfram output ---
  {
    label: 'Differentiation: 5^x * cos(x) — log(5) is natural log',
    claudeAnswer: '5^x \\ln(5) \\cos(x) - 5^x \\sin(x)',
    wolframResult: '5^x (log(5) cos(x) - sin(x))',
    kind: 'differentiation',
    expectedVerdict: 'confirmed',
    category: 'B2',
    notes: 'Wolfram uses log() to mean natural log. Claude writes ln(). Production failure case.',
  },
  {
    label: 'Integration: x*ln(x) — log in result',
    claudeAnswer: '\\frac{x^2}{2} \\ln(x) - \\frac{x^2}{4}',
    wolframResult: 'x^2 log(x)/2 - x^2/4',
    kind: 'integration',
    expectedVerdict: 'confirmed',
    category: 'B2',
    notes: 'Wolfram log = natural log. Confirms B2 category behavior.',
  },

  // --- B1: inverse trig notation ---
  {
    label: 'Integration: arctan(x) — tan^(-1) notation',
    claudeAnswer: 'x \\arctan(x) - \\frac{1}{2} \\ln(x^2 + 1)',
    wolframResult: 'x tan^(-1)(x) - 1/2 log(x^2 + 1)',
    kind: 'integration',
    expectedVerdict: 'confirmed',
    category: 'B1',
    notes: 'Wolfram writes tan^(-1)(x) for arctan(x). Production failure case.',
  },
  {
    label: 'Integration: arcsin(x) — sin^(-1) notation',
    claudeAnswer: 'x \\arcsin(x) + \\sqrt{1 - x^2}',
    wolframResult: 'x sin^(-1)(x) + sqrt(1 - x^2)',
    kind: 'integration',
    expectedVerdict: 'confirmed',
    category: 'B1',
    notes: 'Same inverse trig pattern with sin^(-1).',
  },

  // --- B3: nested trig shorthands (known limitation, expect unavailable) ---
  {
    label: 'Differentiation: sec(tan(x)) — nested unsupported function',
    claudeAnswer: '\\sec^2(x) \\sec(\\tan(x)) \\tan(\\tan(x))',
    wolframResult: 'sec(tan(x)) tan(tan(x)) sec^2(x)',
    kind: 'differentiation',
    expectedVerdict: 'confirmed',
    category: 'B3',
    notes: 'Nested sec() — numeric sampling fails (single-depth expansion). Model tier correctly identifies equivalence.',
  },

  // --- CORRECT_DISCREPANCY: genuine answer errors ---
  {
    label: 'Simplification: log(x²/5x) — Claude wrong',
    claudeAnswer: '\\frac{1}{x} - \\frac{1}{5}',
    wolframResult: '1/x',
    kind: 'simplification',
    expectedVerdict: 'discrepancy',
    category: 'CORRECT_DISCREPANCY',
    notes: 'Direct from production. Claude answer is wrong, CAS should catch it.',
  },
  {
    label: 'Differentiation: deliberately wrong answer',
    claudeAnswer: '2x + 1',
    wolframResult: '3*x^2',
    kind: 'differentiation',
    expectedVerdict: 'discrepancy',
    category: 'CORRECT_DISCREPANCY',
    notes: 'Synthetic wrong answer. Confirms discrepancy detection working.',
  },

  // --- CORRECT_UNAVAILABLE: Wolfram returned nothing ---
  {
    label: 'Unavailable: empty wolfram result',
    claudeAnswer: 'x^2 + 1',
    wolframResult: '',
    kind: 'simplification',
    expectedVerdict: 'unavailable',
    category: 'CORRECT_UNAVAILABLE',
    notes: 'Empty Wolfram result — should return unavailable immediately.',
  },
];

async function runTests() {
  console.log('=== compareWithWolfram regression harness ===\n');

  let passed = 0;
  let failed = 0;
  const failures = [];
  const categoryTotals = {};
  const categoryPassed = {};

  for (const tc of TEST_CASES) {
    categoryTotals[tc.category] = (categoryTotals[tc.category] || 0) + 1;

    // compareWithWolfram is async after Part B
    const actual = await compareWithWolfram(tc.claudeAnswer, tc.wolframResult, tc.kind);
    const pass = actual === tc.expectedVerdict;

    if (pass) {
      passed++;
      categoryPassed[tc.category] = (categoryPassed[tc.category] || 0) + 1;
      console.log(`  ✓  ${tc.label}`);
    } else {
      failed++;
      failures.push({ label: tc.label, expected: tc.expectedVerdict, actual, category: tc.category });
      console.log(`  ✗  ${tc.label}`);
      console.log(`     expected: ${tc.expectedVerdict}  got: ${actual}`);
    }
  }

  console.log('\n--- Results ---');
  console.log(`${passed} passed / ${failed} failed / ${passed + failed} total\n`);

  console.log('--- By category ---');
  for (const cat of Object.keys(categoryTotals).sort()) {
    const p = categoryPassed[cat] || 0;
    const t = categoryTotals[cat];
    console.log(`  ${cat}: ${p}/${t}`);
  }

  if (failures.length > 0) {
    console.log('\n--- Failures ---');
    for (const f of failures) {
      console.log(`  [${f.category}] ${f.label}: expected ${f.expected}, got ${f.actual}`);
    }
  }
}

runTests().catch(console.error);
