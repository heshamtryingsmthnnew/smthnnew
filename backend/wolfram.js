const WOLFRAM_APP_ID = process.env.WOLFRAM_APP_ID;

function stripLatexForWolfram(latex) {
  let s = String(latex || '')
    // Named functions — must convert BEFORE catch-all strips them
    .replace(/\\ln\b/g, 'ln')
    .replace(/\\log\b/g, 'log')
    .replace(/\\sin\b/g, 'sin')
    .replace(/\\cos\b/g, 'cos')
    .replace(/\\tan\b/g, 'tan')
    .replace(/\\exp\b/g, 'exp')
    // Structure
    .replace(/\\sqrt\{([^}]+)\}/g, 'sqrt($1)')
    .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '($1)/($2)')
    .replace(/\^\{([^}]+)\}/g, '^($1)')
    // Cleanup
    .replace(/\\text\{[^}]*\}/g, '')
    .replace(/\\left|\\right/g, '')
    .replace(/\\quad|\\qquad/g, ' ')
    .replace(/\\implies/g, '')
    .replace(/\\cdot/g, '*')
    .replace(/\\times/g, '*')
    .replace(/\\pm/g, '±')
    .replace(/\\\\/g, '')
    // Catch-all for remaining LaTeX commands (runs AFTER named function replacements)
    .replace(/\\[a-zA-Z]+/g, '')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Implicit multiplication
  // Order matters — more specific rules run first.
  // 1. letter→known function: xsin( → x*sin(. Run before digit rules to avoid double-insertion.
  // 2. digit→letter/paren NOT after ^: 3x→3*x, 2(→2*(. Lookbehind protects ^2( (power notation).
  // 3. ^digit→letter (not paren): x^2ln→x^2*ln. Handles power followed by function name.
  //    Does NOT match ^digit( because the alternation requires [a-zA-Z] not (.
  // 4. letter/paren→digit: x2→x*2.
  // 5. paren→paren: )( → )*(
  s = s
    .replace(/([a-zA-Z])(sin|cos|tan|ln|log|exp|sqrt)\(/g, '$1*$2(')
    .replace(/(?<!\^)(\d)([a-zA-Z(])/g, '$1*$2')
    .replace(/(\^\d+)([a-zA-Z])/g, '$1*$2')
    .replace(/([a-zA-Z\)])(\d)/g, '$1*$2')
    .replace(/\)\s+\(/g, ')*(')
    .replace(/\)\(/g, ')*(');

  return s;
}

/**
 * Expand trig shorthands that Wolfram uses but math.js does not support.
 * Must be called after stripLatexForWolfram() has removed LaTeX notation.
 *
 * Known limitation: regex only handles single-depth parens — nested args like
 * sec(cos(x)) will not expand and will fall through to unavailable (acceptable).
 */
function expandTrigShorthands(s) {
  return String(s || '')
    .replace(/\bsec\(([^)]+)\)/g, '(1/cos($1))')
    .replace(/\bcsc\(([^)]+)\)/g, '(1/sin($1))')
    .replace(/\bcot\(([^)]+)\)/g, '(cos($1)/sin($1))');
}

/**
 * Build a Wolfram Alpha query from the original question.
 * Returns { query: string, kind: string } or null if unsupported.
 *
 * kind values:
 *   'differentiation' → d/dx[...] query
 *   'integration'     → integrate ... query (constant C stripped)
 *   'simplification'  → bare expression (Wolfram handles natively)
 *   'equation'        → solve ... (only when Tier 1 unavailable)
 */
function buildWolframQuery(question, kind) {
  const q = String(question || '').trim();
  const stripped = stripLatexForWolfram(q);

  if (kind === 'differentiation') {
    const match = q.match(
      /(?:differentiate|find\s+(?:the\s+)?derivative\s+of|d\/dx\s+of)\s+(.+)/i
    );
    const expr = match
      ? stripLatexForWolfram(match[1].trim())
      : stripped;
    return { query: `d/dx[${expr}]`, kind: 'differentiation' };
  }

  if (kind === 'integration') {
    const match = q.match(
      /(?:integrate|find\s+(?:the\s+)?integral\s+of|antiderivative\s+of)\s+(.+)/i
    );
    let expr = match
      ? stripLatexForWolfram(match[1].trim())
      : stripped;
    // Remove integration variable at end: "x^2 * sin(x) dx" → "x^2 * sin(x)"
    expr = expr.replace(/\s+d[a-zA-Z]$/, '').trim();
    return { query: `integrate ${expr}`, kind: 'integration' };
  }

  if (kind === 'simplification') {
    return { query: stripped, kind: 'simplification' };
  }

  if (kind === 'equation') {
    return { query: `solve ${stripped}`, kind: 'equation' };
  }

  return null;
}

async function queryWolfram(expression, kind = 'simplification') {
  if (!WOLFRAM_APP_ID) {
    return { success: false, result: null, raw: null };
  }

  console.log('[Wolfram] raw expression:', expression);
  console.log('[Wolfram] kind:', kind);

  const url = new URL('https://api.wolframalpha.com/v2/query');
  url.searchParams.set('input', expression);
  url.searchParams.set('appid', WOLFRAM_APP_ID);
  url.searchParams.set('output', 'JSON');
  url.searchParams.set('format', 'plaintext');
  url.searchParams.set('podstate', 'Result');

  let raw;
  try {
    const response = await fetch(url.toString());
    if (!response.ok) {
      return { success: false, result: null, raw: null };
    }
    raw = await response.json();
  } catch (err) {
    console.error('[Wolfram] fetch error:', err.message);
    return { success: false, result: null, raw: null };
  }

  // Pod lookup varies by query kind
  const podTargets = {
    differentiation: ['Derivative', 'Derivative of input'],
    integration: ['Indefinite integral', 'Antiderivative'],
    simplification: ['Result', 'Simplification'],
    equation: ['Result', 'Solution', 'Solutions'],
  };

  const targets = podTargets[kind] || podTargets['simplification'];

  try {
    const pods = raw?.queryresult?.pods;
    if (!Array.isArray(pods)) {
      return { success: false, result: null, raw };
    }

    const resultPod = pods.find(
      (p) => targets.some(
        (t) => p.id === t || p.title === t ||
               p.id?.toLowerCase().includes(t.toLowerCase()) ||
               p.title?.toLowerCase().includes(t.toLowerCase())
      )
    );

    if (!resultPod) {
      const podTitles = pods.map(p => p.title || p.id).join(', ');
      console.log(`[Wolfram] No matching pod found. Available pods: ${podTitles}`);
      return { success: false, result: null, raw };
    }

    const subpods = resultPod.subpods;
    if (!Array.isArray(subpods) || subpods.length === 0) {
      return { success: false, result: null, raw };
    }

    const plaintext = subpods[0]?.plaintext;
    if (typeof plaintext !== 'string' || !plaintext.trim()) {
      return { success: false, result: null, raw };
    }

    return { success: true, result: plaintext.trim(), raw };
  } catch (err) {
    console.error('[Wolfram] parse error:', err.message);
    return { success: false, result: null, raw };
  }
}

/**
 * Compare Claude's answer to Wolfram's result.
 * Returns 'confirmed' | 'discrepancy' | 'unavailable'
 *
 * Three-tier strategy:
 * 1. Numeric sampling — evaluate both at sampled points, check residuals
 * 2. Normalized string compare — strict equality only, no .includes()
 * 3. Inconclusive — 'unavailable' (never false-positive as discrepancy)
 */
function compareWithWolfram(claudeAnswerLatex, wolframResult, kind) {
  if (!claudeAnswerLatex || !wolframResult) return 'unavailable';

  const { create, all } = require('mathjs');
  const math = create(all);

  function toMathjs(latex) {
    let s = String(latex || '');
    // Strip integration constant before comparing
    s = s.replace(/\+\s*C\b/gi, '').replace(/\+\s*constant\b/gi, '');
    // Strip LaTeX environments and convert to plain math
    s = stripLatexForWolfram(s);
    // If the expression is an equation (A = B), extract the RHS — the final form.
    // Handles model writing simplification steps as "intermediate = final", and
    // Wolfram prefixing results with "d/dx(...) =" or "integral ... =".
    if (s.includes('=')) {
      s = s.split('=').pop().trim();
    }
    // Expand trig shorthands that math.js doesn't support
    s = expandTrigShorthands(s);
    // math.js uses log() for natural log, not ln() — convert after stripping
    s = s.replace(/\bln\(/g, 'log(');
    return s;
  }

  function tryNumericSample(exprA, exprB) {
    const samplePoints = [
      { x: 1.3, t: 0.7, n: 2 },
      { x: -0.8, t: 1.5, n: 3 },
      { x: 2.1, t: 2.3, n: -1 },
    ];

    let matchCount = 0;
    let attemptCount = 0;

    for (const scope of samplePoints) {
      try {
        const a = math.evaluate(exprA, scope);
        const b = math.evaluate(exprB, scope);
        if (
          typeof a === 'number' && typeof b === 'number' &&
          Number.isFinite(a) && Number.isFinite(b)
        ) {
          attemptCount++;
          if (Math.abs(a - b) < 1e-6) matchCount++;
        }
      } catch {
        // Skip — singularity or parse error at this point
      }
    }

    if (attemptCount === 0) return null;           // Can't evaluate — inconclusive
    if (matchCount === attemptCount) return true;  // All sampled points match
    if (matchCount === 0) return false;            // All sampled points disagree
    return null;                                   // Partial match — inconclusive
  }

  const claudeClean = toMathjs(claudeAnswerLatex);
  const wolframClean = toMathjs(wolframResult);

  // Tier A: numeric sampling
  const numericResult = tryNumericSample(claudeClean, wolframClean);
  if (numericResult === true) return 'confirmed';
  if (numericResult === false) return 'discrepancy';

  // Tier B: normalized string compare (strict — no .includes())
  const normalize = (s) =>
    s.replace(/\s+/g, '').replace(/\*/g, '').toLowerCase();
  const normA = normalize(claudeClean);
  const normB = normalize(wolframClean);
  if (normA === normB) return 'confirmed';

  // Tier C: inconclusive — do not call it a discrepancy
  return 'unavailable';
}

/**
 * Infer Wolfram query kind from the query string the model generated.
 * The model writes the query, so we read what it wrote to determine the kind.
 * This is reliable because we control the output format via the prompt.
 */
function inferKindFromQuery(query) {
  const q = String(query || '').toLowerCase().trim();

  if (q.startsWith('d/dx') || q.includes('derivative')) return 'differentiation';
  if (q.startsWith('integrate') || q.startsWith('integral of') || q.startsWith('antiderivative')) return 'integration';
  if (q.startsWith('simplify') || q.startsWith('expand') || q.startsWith('factor')) return 'simplification';
  if (q.startsWith('solve') || (q.includes('=') && !q.startsWith('d/dx'))) return 'equation';

  // Default: simplification — Wolfram returns Result pod for most bare expressions
  return 'simplification';
}

module.exports = { queryWolfram, buildWolframQuery, compareWithWolfram, inferKindFromQuery };
