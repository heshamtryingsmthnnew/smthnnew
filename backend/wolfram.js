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
 * Ask the model whether two math expressions are mathematically equivalent.
 * Returns 'confirmed' | 'discrepancy' | 'unavailable'
 *
 * Uses claude-haiku for cost efficiency. Temperature 0 — deterministic classification.
 * 8s timeout. On timeout or API error → 'unavailable'. Never throws.
 *
 * This is NOT a correctness check. Wolfram is still the answer authority.
 * The model only reconciles notation differences (tan^(-1) vs arctan, log vs ln, etc.).
 */
async function checkEquivalenceWithModel(claudeAnswer, wolframResult, kind) {
  if (!claudeAnswer || !wolframResult) return 'unavailable';

  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const prompt = `You are a mathematical equivalence checker. Your only job is to determine whether two math expressions are equivalent.

Expression A (from primary solver, may use LaTeX notation):
${claudeAnswer}

Expression B (from Wolfram Alpha, uses plaintext notation):
${wolframResult}

Problem kind: ${kind}

Are these mathematically equivalent? Consider:
- Different notation for the same function (arctan vs tan^(-1), ln vs log when context is natural log)
- Different but algebraically equivalent forms (factored vs expanded)
- Integration constants are ignored (C is not a real difference)
- Sign conventions and branch cuts: if genuinely ambiguous, return unsure

Respond with ONLY a JSON object, no other text, no markdown:
{"equivalent": true, "reason": "one sentence"}
or
{"equivalent": false, "reason": "one sentence"}
or
{"equivalent": "unsure", "reason": "one sentence"}`;

  try {
    const response = await Promise.race([
      client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 100,
        temperature: 0,
        messages: [{ role: 'user', content: prompt }],
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('equivalence check timeout')), 8000)
      ),
    ]);

    const text = response.content?.[0]?.text?.trim() || '';
    // Strip markdown code fences the model sometimes wraps JSON in
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      console.warn('[CAS equivalence] Non-JSON response from model:', text.slice(0, 100));
      return 'unavailable';
    }

    if (parsed.equivalent === true) return 'confirmed';
    if (parsed.equivalent === false) return 'discrepancy';
    return 'unavailable'; // 'unsure' or any unexpected value
  } catch (err) {
    console.warn('[CAS equivalence] Model check failed:', err.message);
    return 'unavailable';
  }
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
    differentiation:          ['Derivative', 'Derivative of input'],
    implicit_differentiation: ['Result', 'Derivative', 'Derivative of input'],
    integration:              ['Indefinite integral', 'Antiderivative'],
    simplification:           ['Result', 'Simplification'],
    equation:                 ['Result', 'Solution', 'Solutions'],
    limit:                    ['Limit', 'Value', 'Limit result'],
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
 * Two-tier strategy:
 * Tier A: Numeric sampling — deterministic, zero cost, handles clean cases
 * Tier B: Model equivalence check — handles notation differences (tan^(-1),
 *         log as natural log, algebraically equivalent forms) that numeric
 *         sampling cannot resolve. Replaces the removed string normalization tier.
 * Tier C: unavailable — never false-positive as discrepancy
 *
 * compareWithWolfram is async because Tier B makes an API call.
 */
async function compareWithWolfram(claudeAnswerLatex, wolframResult, kind) {
  if (!claudeAnswerLatex || !wolframResult) return 'unavailable';

  const { create, all } = require('mathjs');
  const math = create(all);

  function toMathjs(latex) {
    let s = String(latex || '');
    s = s.replace(/\+\s*C\b/gi, '').replace(/\+\s*constant\b/gi, '');
    s = s.replace(/∞/g, 'Infinity').replace(/\binfinity\b/gi, 'Infinity');
    s = stripLatexForWolfram(s);
    if (s.includes('=')) {
      s = s.split('=').pop().trim();
    }
    s = expandTrigShorthands(s);
    // Handle Wolfram's space-separated implicit mult: "x^2 log(x)" → "x^2*log(x)"
    // stripLatexForWolfram only handles adjacent (no-space) cases.
    s = s.replace(/(\^\d+)\s+([a-zA-Z])/g, '$1*$2');
    s = s.replace(/(\d)\s+(log|sin|cos|tan|exp|sqrt|ln)\(/g, '$1*$2(');
    s = s.replace(/([a-zA-Z\)])\s+(log|sin|cos|tan|exp|sqrt|ln)\(/g, '$1*$2(');
    // math.js uses log() for natural log, not ln() — convert after stripping
    s = s.replace(/\bln\(/g, 'log(');
    return s;
  }

  function tryNumericSample(exprA, exprB) {
    // 5 sample points — more attempts before falling through to model tier
    // reduces unnecessary API calls on evaluable expressions
    const samplePoints = [
      { x: 1.3, t: 0.7, n: 2 },
      { x: -0.8, t: 1.5, n: 3 },
      { x: 2.1, t: 2.3, n: -1 },
      { x: 0.5, t: 1.1, n: 4 },
      { x: 3.7, t: 0.3, n: -2 },
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

    if (attemptCount === 0) return null;
    if (matchCount === attemptCount) return true;
    if (matchCount === 0) return false;
    return null; // partial match — inconclusive
  }

  const claudeClean = toMathjs(claudeAnswerLatex);
  const wolframClean = toMathjs(wolframResult);

  // Tier A: numeric sampling (deterministic, zero cost)
  const numericResult = tryNumericSample(claudeClean, wolframClean);
  if (numericResult === true) return 'confirmed';
  if (numericResult === false) return 'discrepancy';

  // Tier B: model equivalence check (handles notation differences numeric can't resolve)
  const modelVerdict = await checkEquivalenceWithModel(claudeAnswerLatex, wolframResult, kind);
  return modelVerdict;
}

/**
 * Infer Wolfram query kind from the query string the model generated.
 * The model writes the query, so we read what it wrote to determine the kind.
 * This is reliable because we control the output format via the prompt.
 */
function inferKindFromQuery(query) {
  const q = String(query || '').toLowerCase().trim();

  // Implicit differentiation — Result pod first (where Wolfram places dy/dx answer)
  // Must check before the plain differentiation check to avoid misclassifying
  if (
    q.includes('implicit') ||
    q.includes('implicitly') ||
    (q.includes('dy/dx') && q.includes('='))
  ) return 'implicit_differentiation';

  if (q.startsWith('d/dx') || q.includes('derivative')) return 'differentiation';
  if (q.startsWith('integrate') || q.startsWith('integral of') || q.startsWith('antiderivative')) return 'integration';
  if (q.startsWith('simplify') || q.startsWith('expand') || q.startsWith('factor')) return 'simplification';

  // Limit — before equation check because limit queries can contain '=' in piecewise conditions
  if (
    q.startsWith('lim') ||
    q.includes('limit of') ||
    q.includes('limit as') ||
    q.includes('as x approaches') ||
    q.includes('as x →') ||
    q.includes('as x->') ||
    q.includes('as x ->')
  ) return 'limit';

  if (q.startsWith('solve') || (q.includes('=') && !q.startsWith('d/dx'))) return 'equation';

  // Default: simplification — Wolfram returns Result pod for most bare expressions
  return 'simplification';
}

module.exports = { queryWolfram, compareWithWolfram, inferKindFromQuery, checkEquivalenceWithModel };
