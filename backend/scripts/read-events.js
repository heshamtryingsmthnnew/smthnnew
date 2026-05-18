#!/usr/bin/env node
// Usage: node backend/scripts/read-events.js [--kind=X] [--severity=Y] [--correlation=Z] [--since=ISO] [--limit=N]

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { supabase } = require('../supabase');

function parseArgs() {
  const args = {};
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(/^--(\w+)=(.+)$/);
    if (match) args[match[1]] = match[2];
  }
  return args;
}

async function main() {
  const args = parseArgs();
  let q = supabase.from('events').select('*').order('created_at', { ascending: false });

  if (args.kind)        q = q.eq('kind', args.kind);
  if (args.severity)    q = q.eq('severity', args.severity);
  if (args.correlation) q = q.eq('correlation_id', args.correlation);
  if (args.since)       q = q.gte('created_at', args.since);

  const limit = parseInt(args.limit || '50', 10);
  q = q.limit(limit);

  const { data, error } = await q;
  if (error) {
    console.error('Query failed:', error.message);
    process.exit(1);
  }

  console.log(`\n=== ${data.length} events ===\n`);
  for (const e of data) {
    const ts = new Date(e.created_at).toISOString();
    const cid = e.correlation_id ? ` [${e.correlation_id.slice(0, 12)}]` : '';
    console.log(`${ts}  ${e.severity.toUpperCase().padEnd(5)} ${e.kind.padEnd(32)}${cid}  ${e.message || ''}`);
    if (e.payload && Object.keys(e.payload).length > 0) {
      console.log(`    payload: ${JSON.stringify(e.payload).slice(0, 200)}`);
    }
  }

  // Aggregates
  const byKind = {};
  const bySeverity = {};
  for (const e of data) {
    byKind[e.kind] = (byKind[e.kind] || 0) + 1;
    bySeverity[e.severity] = (bySeverity[e.severity] || 0) + 1;
  }
  console.log('\n=== By kind ===');
  Object.entries(byKind).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${v.toString().padStart(4)}  ${k}`));
  console.log('\n=== By severity ===');
  Object.entries(bySeverity).forEach(([k, v]) => console.log(`  ${v.toString().padStart(4)}  ${k}`));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
