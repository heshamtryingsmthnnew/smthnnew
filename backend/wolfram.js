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

  // Implicit multiplication: 3x → 3*x, 2(x) → 2*(x), (a)(b) → (a)*(b)
  // Note: letter-before-paren (e.g. ln(), sin()) is a function call, NOT implicit mult — skip that case
  s = s
    .replace(/(\d)([a-zA-Z(])/g, '$1*$2')
    .replace(/([a-zA-Z\)])(\d)/g, '$1*$2')
    .replace(/\)\(/g, ')*(');

  return s;
}

async function queryWolfram(expression) {
  if (!WOLFRAM_APP_ID) {
    return { success: false, result: null, raw: null };
  }

  const stripped = stripLatexForWolfram(expression);
  console.log('[Wolfram] raw expression:', expression);
  console.log('[Wolfram] stripped for query:', stripped);

  const url = new URL('https://api.wolframalpha.com/v2/query');
  url.searchParams.set('input', stripped);
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

  try {
    const pods = raw?.queryresult?.pods;
    if (!Array.isArray(pods)) {
      return { success: false, result: null, raw };
    }

    const resultPod = pods.find(
      (p) => p.id === 'Result' || p.title === 'Result' ||
             p.id === 'Solution' || p.title === 'Solution'
    );
    if (!resultPod) {
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

module.exports = { queryWolfram };
