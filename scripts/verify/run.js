// Verification suite runner — accumulates per-brief check scripts.
// Run: node scripts/verify/run.js
'use strict';

const { execSync } = require('child_process');
const path = require('path');

const tests = [
  'scripts/verify/sessionTab.test.js',
];

let allPassed = true;

for (const test of tests) {
  const label = path.basename(test);
  console.log(`\n--- ${label} ---`);
  try {
    execSync(`node ${test}`, { stdio: 'inherit', cwd: path.resolve(__dirname, '../..') });
  } catch {
    allPassed = false;
  }
}

if (!allPassed) {
  console.error('\n[run] One or more tests FAILED.\n');
  process.exit(1);
} else {
  console.log('\n[run] All tests passed.\n');
}
