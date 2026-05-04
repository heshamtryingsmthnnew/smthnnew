'use strict';

const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, '..', 'logs', 'cas-events.jsonl');
const N = parseInt(process.argv[2], 10) || 10;

function trunc(str, len) {
  if (!str) return '—';
  return str.length > len ? str.slice(0, len) + '…' : str;
}

if (!fs.existsSync(LOG_FILE)) {
  console.log('No log file found at:', LOG_FILE);
  console.log('Run the backend with advanced verification enabled to generate events.');
  process.exit(0);
}

const lines = fs.readFileSync(LOG_FILE, 'utf8').split('\n').filter(Boolean);
const events = [];

for (const line of lines) {
  try {
    events.push(JSON.parse(line));
  } catch {
    console.warn('[warn] Skipping malformed line:', trunc(line, 60));
  }
}

if (events.length === 0) {
  console.log('Log file exists but contains no valid events.');
  process.exit(0);
}

// Verdict breakdown
const verdicts = { confirmed: 0, discrepancy: 0, unavailable: 0 };
const kinds = {};
for (const e of events) {
  verdicts[e.verdict] = (verdicts[e.verdict] || 0) + 1;
  const k = e.wolfram_kind || 'skip';
  kinds[k] = (kinds[k] || 0) + 1;
}

console.log('\n=== CAS Event Log ===');
console.log(`Total events: ${events.length}`);
console.log(`Build: ${events[events.length - 1]?.build_version ?? '?'}\n`);

console.log('Verdict breakdown:');
for (const [v, count] of Object.entries(verdicts)) {
  console.log(`  ${v.padEnd(12)} ${count}`);
}

console.log('\nKind breakdown:');
for (const [k, count] of Object.entries(kinds)) {
  console.log(`  ${k.padEnd(18)} ${count}`);
}

console.log(`\nLast ${Math.min(N, events.length)} events:\n`);
const slice = events.slice(-N);
for (const e of slice) {
  console.log(`[${e.timestamp}] ${e.mode} | ${(e.wolfram_kind || 'skip').padEnd(16)} | ${e.verdict}`);
  console.log(`  Q:       ${trunc(e.question, 80)}`);
  console.log(`  Answer:  ${trunc(e.claude_answer, 80)}`);
  console.log(`  Wolfram: ${trunc(e.wolfram_result, 80)}`);
  console.log('');
}
