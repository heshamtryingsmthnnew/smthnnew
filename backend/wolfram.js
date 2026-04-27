const WOLFRAM_APP_ID = process.env.WOLFRAM_APP_ID;

function stripLatexForWolfram(latex) {
  return String(latex || '')
    .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '($1)/($2)')
    .replace(/\\sqrt\{([^}]+)\}/g, 'sqrt($1)')
    .replace(/\\text\{[^}]*\}/g, '')
    .replace(/\\left|\\right/g, '')
    .replace(/\\quad|\\qquad/g, ' ')
    .replace(/\\implies/g, '')
    .replace(/\\cdot/g, '*')
    .replace(/\\pm/g, '±')
    .replace(/\\\\/g, '')
    .replace(/\\[a-zA-Z]+/g, '')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
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
      (p) => p.id === 'Result' || p.title === 'Result'
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
