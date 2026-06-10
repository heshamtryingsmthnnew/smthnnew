// Acceptance criterion 1 for PHASE_5A_BRIEF_05_1 — Session Tab → Notch
// Guards against re-introducing a session-switcher trigger inside the notch,
// and pins the opaque-notch / arrows-outside structure shipped in this brief.
// Run: node scripts/verify/sessionNotch.test.js

'use strict';

const fs = require('fs');
const path = require('path');

const pagePath = path.resolve(__dirname, '../../frontend/src/app/page.tsx');
const source = fs.readFileSync(pagePath, 'utf8');

const startMarker = '{/* Session Tab — top-center';
const endMarker = '{/* Sticky answer bar';

const startIdx = source.indexOf(startMarker);
const endIdx = source.indexOf(endMarker, startIdx);

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

console.log('\n[1] Session Tab block — switcher removed, notch opaque, arrows present\n');

assert(startIdx !== -1, 'Session Tab block found in page.tsx');
assert(endIdx > startIdx, 'Sticky answer bar block found after Session Tab block');

const block = source.slice(startIdx, endIdx);

// Acceptance criterion 1: no session-switcher trigger anywhere in the notch block
assert(!/switcher/i.test(block), 'no "switcher" trigger present in Session Tab block');

// Regression: nav arrows still present (only prev/next affordance, unchanged wiring)
assert(block.includes('aria-label="Older solve"'), 'prev (older) arrow present');
assert(block.includes('aria-label="Newer solve"'), 'next (newer) arrow present');
assert((block.match(/aria-label="Older solve"/g) || []).length === 1, 'exactly one prev arrow (no duplicate/orphaned control)');
assert((block.match(/aria-label="Newer solve"/g) || []).length === 1, 'exactly one next arrow (no duplicate/orphaned control)');

// Notch is opaque, not the old 8-12% ghost watermark
assert(!/text-white\/\[0\.10\]/.test(block), 'wordmark no longer rendered at 10% ghost opacity');
assert(/bg-zinc-900/.test(block), 'notch has an opaque zinc fill');

// Notch border: bottom + sides only (no top border) — flush to top edge
assert(/border-x border-b border-white\/\[0\.08\]/.test(block), 'notch has bottom+side border only (white/[0.08] family)');
assert(!/border border-white\/\[0\.06\]/.test(block), 'old all-around low-opacity frame border removed');

console.log(`\nResults: ${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
