require('dotenv').config();
const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');
const { create, all } = require('mathjs');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Math.js instance (for future verification)
const math = create(all);

// OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Simple health check
app.get('/', (req, res) => {
  res.send('Backend is running!');
});

// ----- Verification helpers -----

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Try to evaluate the student's original question with math.js
 * as a pure numeric expression (no "=").
 */
function tryEvaluateQuestion(question) {
  try {
    const result = math.evaluate(question);
    if (isFiniteNumber(result)) {
      return result;
    }
    return null;
  } catch (err) {
    return null;
  }
}

/**
 * Parse a simple token that might involve pi:
 *  - "\\pi"
 *  - "2\\pi"
 *  - "-3.5\\pi"
 *  - plain numbers like "5" or "-0.25"
 */
function parsePiOrNumber(str) {
  if (!str) return NaN;
  let s = str.trim();
  if (!s) return NaN;

  // Normalize Unicode \u03c0 to \pi
  s = s.replace(/\u03c0/g, "\\pi");

  if (s.includes("\\pi")) {
    const m = s.match(/^([+-]?\d*\.?\d*)\s*\\pi$/);
    if (!m) return NaN;

    let coeffStr = m[1];
    if (coeffStr === "" || coeffStr === "+") coeffStr = "1";
    if (coeffStr === "-") coeffStr = "-1";

    const coeff = Number(coeffStr);
    if (!Number.isFinite(coeff)) return NaN;

    return coeff * Math.PI;
  }

  const num = Number(s);
  return Number.isFinite(num) ? num : NaN;
}

/**
 * Extract a numeric result from the AI answer, with handling for:
 *  - \\frac{\\pi}{6}, \\frac{5\\pi}{6}
 *  - \\pi/6, 5\\pi/6, -\\pi/4 (as long as they appear as "coeff \\pi / denom")
 *  - plain numeric literals
 */
function extractNumericResultFromAnswer(text) {
  if (!text) return null;

  const blockMatches = [...text.matchAll(/\$\$(.*?)\$\$/gs)];
  let searchSpace = text;
  if (blockMatches.length > 0) {
    searchSpace = blockMatches[blockMatches.length - 1][1]; // inside last $$...$$
  }

  // Normalize Unicode \u03c0 to \pi in the block
  searchSpace = searchSpace.replace(/\u03c0/g, "\\pi");

  // 1) Try LaTeX fraction: \\frac{...}{...}
  const fracMatch = searchSpace.match(/\\frac\s*{([^}]+)}\s*{([^}]+)}/);
  if (fracMatch) {
    const numStr = fracMatch[1].trim();
    const denStr = fracMatch[2].trim();

    const numVal = parsePiOrNumber(numStr);
    const denVal = parsePiOrNumber(denStr);

    if (isFiniteNumber(numVal) && isFiniteNumber(denVal) && denVal !== 0) {
      return {
        raw: fracMatch[0],
        value: numVal / denVal,
      };
    }
  }

  // 2) Try pi-expression without \\frac, like "\\pi/6", "5\\pi/6", "-\\pi/4"
  const piMatch = searchSpace.match(
    /([+-]?\d*\.?\d*)\s*\\pi\s*(?:\/\s*([0-9]+))?/
  );
  if (piMatch) {
    let coeffStr = piMatch[1];
    const denomStr = piMatch[2] || "1";

    if (coeffStr === "" || coeffStr === "+") coeffStr = "1";
    if (coeffStr === "-") coeffStr = "-1";

    const coeff = Number(coeffStr);
    const denom = Number(denomStr);

    if (Number.isFinite(coeff) && Number.isFinite(denom) && denom !== 0) {
      return {
        raw: piMatch[0],
        value: (coeff * Math.PI) / denom,
      };
    }
  }

  // 3) Fallback: last plain numeric literal (decimal / scientific)
  const matches = searchSpace.match(/-?\d+(\.\d+)?([eE][+-]?\d+)?/g);
  if (!matches || matches.length === 0) return null;

  const raw = matches[matches.length - 1];
  const value = Number(raw);
  if (!isFiniteNumber(value)) return null;

  return { raw, value };
}

/**
 * Extract multiple variable assignments from the AI answer, e.g.:
 *  - "x = 2, y = 1"
 *  - "x = \\frac{1}{2}, y = \\frac{3\\pi}{4}"
 *
 * Only handles simple patterns in the final $$...$$ block.
 * Returns an object like { x: 2, y: 1 }, or null if nothing is found.
 */
function extractVariableAssignmentsFromAnswer(text) {
  if (!text) return null;

  const blockMatches = [...text.matchAll(/\$\$(.*?)\$\$/gs)];
  let searchSpace = text;
  if (blockMatches.length > 0) {
    searchSpace = blockMatches[blockMatches.length - 1][1]; // inside last $$...$$
  }

  // Normalize Unicode \u03c0 to \pi
  searchSpace = searchSpace.replace(/\u03c0/g, "\\pi");

  // Find patterns like: x = <value>
  // We stop the value at comma, semicolon, or line break.
  const regex = /([a-zA-Z])\s*=\s*([^,;\n]+)/g;
  const scope = {};
  let match;

  while ((match = regex.exec(searchSpace)) !== null) {
    const variable = match[1];
    const valueStr = match[2].trim();

    let value = NaN;

    // Try LaTeX fraction inside this value first
    const fracMatch = valueStr.match(/\\frac\s*{([^}]+)}\s*{([^}]+)}/);
    if (fracMatch) {
      const numStr = fracMatch[1].trim();
      const denStr = fracMatch[2].trim();

      const numVal = parsePiOrNumber(numStr);
      const denVal = parsePiOrNumber(denStr);

      if (isFiniteNumber(numVal) && isFiniteNumber(denVal) && denVal !== 0) {
        value = numVal / denVal;
      }
    } else {
      // Try pi-expression or plain number
      value = parsePiOrNumber(valueStr);
      if (!Number.isFinite(value)) {
        const plain = Number(valueStr);
        if (Number.isFinite(plain)) {
          value = plain;
        }
      }
    }

    if (isFiniteNumber(value)) {
      scope[variable] = value;
    }
  }

  return Object.keys(scope).length > 0 ? scope : null;
}

/**
 * Validate a system of equations:
 *  - Extract multiple variable values from AI's answer (x, y, z, ...)
 *  - Find all lines in the question containing "="
 *  - For each equation, evaluate (lhs - rhs) with the extracted scope
 *  - If all residuals are near zero -> validated
 */
function verifySystemOfEquations(question, aiAnswerText) {
  if (!question.includes("=")) return null;

  const eqCount = (question.match(/=/g) || []).length;
  if (eqCount < 2) return null;

  const rawLines = question
    .split(/\r?\n|;/)
    .map((line) => line.trim())
    .filter(Boolean);
  const eqLines = rawLines.filter((line) => line.includes("="));
  if (eqLines.length < 2) return null;

  const scope = extractVariableAssignmentsFromAnswer(aiAnswerText);
  if (!scope || Object.keys(scope).length === 0) {
    return { status: "unavailable" };
  }

  const residuals = [];
  let maxResidual = 0;

  for (const line of eqLines) {
    const parts = line.split("=");
    if (parts.length !== 2) continue;

    const lhs = parts[0].trim();
    const rhs = parts[1].trim();
    if (!lhs || !rhs) continue;

    const expr = `(${lhs}) - (${rhs})`;
    let residual;
    try {
      residual = math.evaluate(expr, scope);
    } catch (err) {
      return { status: "unavailable" };
    }

    if (!isFiniteNumber(residual)) {
      return { status: "unavailable" };
    }

    residuals.push(residual);
    maxResidual = Math.max(maxResidual, Math.abs(residual));
  }

  if (residuals.length === 0) {
    return { status: "unavailable" };
  }

  const tolerance = 1e-6;
  if (maxResidual <= tolerance) {
    return {
      status: "validated",
      meta: {
        type: "system-substitution",
        scope,
        residuals,
        maxResidual,
      },
    };
  }

  return {
    status: "failed",
    meta: {
      type: "system-substitution",
      scope,
      residuals,
      maxResidual,
    },
  };
}

/**
 * Normalize various inequality notations to simple ASCII:
 * - ≥ (\\u2265), \\ge, \\geq  -> >=
 * - ≤ (\\u2264), \\le, \\leq  -> <=
 */
function normalizeInequalityOperators(str) {
  if (!str) return "";
  return str
    .replace(/\u2265/g, ">=")
    .replace(/\u2264/g, "<=")
    .replace(/\\geq/g, ">=")
    .replace(/\\ge/g, ">=")
    .replace(/\\leq/g, "<=")
    .replace(/\\le/g, "<=");
}

/**
 * Parse a single-variable inequality from the question, e.g.:
 *  "2x + 3 > 7"
 *  "3x - 1 <= 5"
 *
 * Returns { variable, lhs, rhs, op } or null if not recognized.
 * Does NOT handle compound inequalities like "-1 < x < 3" yet.
 */
function parseInequalityQuestion(question) {
  if (!question) return null;

  // Normalize operators first
  let normalized = normalizeInequalityOperators(question);

  // Heuristic: if there's a colon, assume the math part is after the last colon.
  // This handles prompts like "Solve the inequality: 2x + 3 > 7"
  const colonParts = normalized.split(':');
  if (colonParts.length > 1) {
    normalized = colonParts[colonParts.length - 1];
  }

  normalized = normalized.trim();

  const ops = [">=", "<=", ">", "<"];
  let foundOp = null;
  let idx = -1;

  for (const op of ops) {
    const i = normalized.indexOf(op);
    if (i !== -1) {
      foundOp = op;
      idx = i;
      break;
    }
  }

  if (!foundOp) return null;

  // If there is more than one inequality symbol, treat as unsupported (compound)
  const rest = normalized.slice(idx + foundOp.length);
  if (rest.includes(">") || rest.includes("<")) {
    return null;
  }

  const lhs = normalized.slice(0, idx).trim();
  const rhs = normalized.slice(idx + foundOp.length).trim();
  if (!lhs || !rhs) return null;

  let variable = "x";
  const preferredVars = ["x", "y", "z", "t"];
  for (const v of preferredVars) {
    if (lhs.includes(v) || rhs.includes(v)) {
      variable = v;
      break;
    }
  }

  return { variable, lhs, rhs, op: foundOp };
}

/**
 * Extract an inequality description from the AI's final answer, e.g.:
 *  "x > 2"
 *  "x \le \frac{\pi}{6}"
 *
 * Returns { variable, boundary, op } or null.
 */
function extractInequalityFromAnswer(text) {
  if (!text) return null;

  const blockMatches = [...text.matchAll(/\$\$(.*?)\$\$/gs)];
  let searchSpace = text;

  if (blockMatches.length > 0) {
    // Prefer the last LaTeX block that actually contains an inequality
    let chosen = "";
    for (let i = blockMatches.length - 1; i >= 0; i--) {
      const block = blockMatches[i][1];
      if (/[><]=?/.test(block)) {
        chosen = block;
        break;
      }
    }
    // Fallback: if none of the blocks contain an inequality, use the last block
    searchSpace = chosen || blockMatches[blockMatches.length - 1][1];
  }

  // Normalize pi and inequality operators
  searchSpace = searchSpace.replace(/\u03c0/g, "\\pi");
  searchSpace = normalizeInequalityOperators(searchSpace);

  const regex = /([a-zA-Z])\s*(>=|<=|>|<)\s*([^,;\n]+)/;
  const m = searchSpace.match(regex);
  if (!m) return null;

  const variable = m[1];
  const op = m[2];
  const valueStr = m[3].trim();

  let boundary = NaN;

  const fracMatch = valueStr.match(/\\frac\s*{([^}]+)}\s*{([^}]+)}/);
  if (fracMatch) {
    const numStr = fracMatch[1].trim();
    const denStr = fracMatch[2].trim();

    const numVal = parsePiOrNumber(numStr);
    const denVal = parsePiOrNumber(denStr);

    if (isFiniteNumber(numVal) && isFiniteNumber(denVal) && denVal !== 0) {
      boundary = numVal / denVal;
    }
  } else {
    // Try simple pi/number parsing
    boundary = parsePiOrNumber(valueStr);
    if (!Number.isFinite(boundary)) {
      const plain = Number(valueStr);
      if (Number.isFinite(plain)) {
        boundary = plain;
      }
    }
  }

  if (!isFiniteNumber(boundary)) {
    return null;
  }

  return { variable, boundary, op };
}

/**
 * Validate a single-variable inequality solution.
 *
 * Strategy:
 *  - Parse the inequality from the QUESTION.
 *  - Parse the solution form (e.g. "x > 2") from the AI ANSWER.
 *  - Pick one point inside the claimed solution set, one point outside.
 *  - Check the original inequality at both points:
 *      inside  -> must satisfy inequality
 *      outside -> must NOT satisfy inequality
 */
function verifyInequalitySolution(question, aiAnswerText) {
  const parsedQ = parseInequalityQuestion(question);
  if (!parsedQ) return null; // Not a supported inequality format

  const parsedA = extractInequalityFromAnswer(aiAnswerText);
  if (!parsedA) {
    return { status: "unavailable" };
  }

  // Variable consistency
  if (parsedQ.variable !== parsedA.variable) {
    return { status: "unavailable" };
  }

  const variable = parsedA.variable;
  const boundary = parsedA.boundary;
  const ansOp = parsedA.op;
  const qOp = parsedQ.op;

  // Choose step size for sampling
  const step = Math.max(1, Math.abs(boundary)) * 0.1;

  let insideX;
  let outsideX;

  if (ansOp === ">" || ansOp === ">=") {
    insideX = boundary + step;
    outsideX = boundary - step;
  } else if (ansOp === "<" || ansOp === "<=") {
    insideX = boundary - step;
    outsideX = boundary + step;
  } else {
    return { status: "unavailable" };
  }

  const compare = (lhs, rhs, op) => {
    switch (op) {
      case ">":
        return lhs > rhs;
      case "<":
        return lhs < rhs;
      case ">=":
        return lhs >= rhs;
      case "<=":
        return lhs <= rhs;
      default:
        return false;
    }
  };

  const testPoint = (xVal) => {
    const scope = { [variable]: xVal };
    let lhsVal;
    let rhsVal;
    try {
      lhsVal = math.evaluate(parsedQ.lhs, scope);
      rhsVal = math.evaluate(parsedQ.rhs, scope);
    } catch (err) {
      return null;
    }
    if (!isFiniteNumber(lhsVal) || !isFiniteNumber(rhsVal)) {
      return null;
    }
    return compare(lhsVal, rhsVal, qOp);
  };

  const insideOk = testPoint(insideX);
  const outsideOk = testPoint(outsideX);

  if (insideOk === null || outsideOk === null) {
    return { status: "unavailable" };
  }

  if (insideOk === true && outsideOk === false) {
    return {
      status: "validated",
      meta: {
        type: "inequality",
        variable,
        boundary,
        questionOp: qOp,
        answerOp: ansOp,
        insideX,
        outsideX,
      },
    };
  }

  return {
    status: "failed",
    meta: {
      type: "inequality",
      variable,
      boundary,
      questionOp: qOp,
      answerOp: ansOp,
      insideX,
      outsideX,
      insideOk,
      outsideOk,
    },
  };
}

/**
 * General equation validation by substitution:
 *  - Look for "lhs = rhs" in the question.
 *  - Choose a reasonable variable name (prefer x if present).
 *  - Build f(var) = lhs - rhs.
 *  - Extract the numeric value reported by the AI.
 *  - Evaluate f(reported).
 *    - If it's ~0, we consider the solution valid.
 *
 * Works for linear, quadratic, trig, etc. as long as math.js
 * can evaluate the expressions numerically.
 */
function verifyEquationSolutionBySubstitution(question, aiAnswerText) {
  if (!question.includes("=")) return null;

  let variable = "x";
  const preferredVars = ["x", "y", "z", "t"];
  for (const v of preferredVars) {
    if (question.includes(v)) {
      variable = v;
      break;
    }
  }

  const parts = question.split("=");
  if (parts.length !== 2) return null;

  const lhs = parts[0].trim();
  const rhs = parts[1].trim();
  if (!lhs || !rhs) return null;

  const expr = `(${lhs}) - (${rhs})`;

  const extracted = extractNumericResultFromAnswer(aiAnswerText);
  if (!extracted) {
    return { status: "unavailable" };
  }

  const reported = extracted.value;

  let residual;
  try {
    residual = math.evaluate(expr, { [variable]: reported });
  } catch (err) {
    return { status: "unavailable" };
  }

  if (!isFiniteNumber(residual)) {
    return { status: "unavailable" };
  }

  const tolerance = 1e-6;
  if (Math.abs(residual) <= tolerance) {
    return {
      status: "validated",
      meta: {
        type: "equation-substitution",
        variable,
        reported,
        residual,
      },
    };
  }

  return {
    status: "failed",
    meta: {
      type: "equation-substitution",
      variable,
      reported,
      residual,
    },
  };
}

/**
 * Math-mode verification:
 * 1) Try system-of-equations (>= 2 "=" signs).
 * 2) Try inequalities.
 * 3) Try pure numeric-expression validation (no "=").
 * 4) Try single-equation validation by substitution.
 */
function verifyMathAnswer(question, aiAnswerText) {
  if (!question) return { status: "unavailable" };

  // Systems check first
  const eqCount = (question.match(/=/g) || []).length;
  if (eqCount >= 2) {
    const sys = verifySystemOfEquations(question, aiAnswerText);
    if (sys) return sys;
  }

  // Inequality check
  if (
    question.includes(">") ||
    question.includes("<") ||
    /\u2265|\u2264|\\ge|\\le/.test(question)
  ) {
    const ineq = verifyInequalitySolution(question, aiAnswerText);
    if (ineq) return ineq;
  }

  // Pure numeric expression (no "=")
  if (!question.includes("=")) {
    const numericExpected = tryEvaluateQuestion(question);
    if (numericExpected !== null) {
      const extracted = extractNumericResultFromAnswer(aiAnswerText);
      if (!extracted) {
        return { status: "unavailable" };
      }

      const reported = extracted.value;
      const tolerance = Math.max(1e-6, Math.abs(numericExpected) * 1e-6);

      if (Math.abs(numericExpected - reported) <= tolerance) {
        return {
          status: "validated",
          meta: {
            type: "numeric",
            expected: numericExpected,
            reported,
          },
        };
      }

      return {
        status: "failed",
        meta: {
          type: "numeric",
          expected: numericExpected,
          reported,
        },
      };
    }
  }

  // Single equation by substitution
  const eqCheck = verifyEquationSolutionBySubstitution(question, aiAnswerText);
  if (eqCheck) {
    return eqCheck;
  }

  return { status: "unavailable" };
}

function verifyWithMathEngine(question, aiAnswerText, mode) {
  if (!question || !aiAnswerText) {
    return { status: "unavailable" };
  }

  if (mode === "math") {
    return verifyMathAnswer(question, aiAnswerText);
  }

  return { status: "unavailable" };
}


app.post('/solve', async (req, res) => {
  const { question, detailLevel, mode } = req.body;

  if (!question) {
    return res.status(400).json({ error: 'No question provided' });
  }

  const safeMode = mode === 'physics' ? 'physics' : 'math';

  let systemPrompt;
  let temperature;

  if (safeMode === 'math') {
    // ---------- MATH MODE PROMPTS ----------
    switch (detailLevel) {
      case 'simple':
        systemPrompt = `
You are an engineering mathematics professor (algebra and calculus) who explains extremely concisely.

You MUST follow this exact structure, but WITHOUT any headings, labels, markdown, or bullet points.

STRUCTURE:
1. First line: Rewrite the problem in one short sentence. No label.
2. Second line: State the main approach in ONE sentence (e.g. "Rewrite as a quadratic and solve using the quadratic formula.").
3. Then give 2–4 numbered steps only. Each step MUST:
   - start with "Step 1:", "Step 2:", etc. (no bullets, no dashes)
   - include a short explanation
   - put the key equation on its own line in LaTeX using $$...$$.
4. Final line: ONLY the final solution in LaTeX as a single standalone equation.
   - No leading text. No "Answer:", "Final Answer:", or anything else.

HARD RULES:
- Do NOT use markdown: no **bold**, no *, no bullet lists, no "Section".
- Do NOT write headings like "Problem Restatement", "Approach", "Solution".
- The answer MUST look like plain text with numbered steps and LaTeX equations only.
- All equations MUST be written in LaTeX.
- Use $$...$$ for standalone equations and $...$ only when necessary inline.
- Tone: fast, sharp, precise, minimal.
`;
        temperature = 0.2;
        break;

      case 'detailed':
        systemPrompt = `
You are an engineering mathematics professor (algebra and calculus) known for clear, rigorous explanations.

You MUST follow this structure, WITHOUT headings, markdown, or bullet lists.

FORMAT:
1. First line: Rewrite the problem in one clear sentence in your own words. No label.
2. Second line: One or two sentences describing the overall mathematical strategy. No label.
3. Next lines: Numbered steps, starting strictly with "Step 1:", "Step 2:", etc.
   - Each step has a short explanation.
   - Put important equations on their own line in LaTeX using $$...$$.
4. Final line: ONLY the final result, written as a standalone LaTeX equation (or equations), for example:
   $$x = \\frac{5 \\pm i\\sqrt{431}}{76}$$
   Do NOT prefix it with any words.

ABSOLUTE RULES:
- Do NOT output the words "Solution" or "Section".
- Do NOT use markdown (no **bold**, no lists).
- Do NOT use headings or labels like "Problem Summary", "Step-by-Step Algebra", etc.
- The only allowed numbered items are "Step 1:", "Step 2:", etc.
- All mathematical expressions MUST be in LaTeX.
- Use $$...$$ for block equations and $...$ for inline math when needed.
- Tone: professional, concise, professor-level; no fluff.
`;
        temperature = 0.35;
        break;

      default:
        systemPrompt = `
You are a university-level engineering mathematics professor (algebra and calculus) who explains clearly and efficiently.

Follow this structure, WITHOUT any visible labels, headings, markdown, or bullet lists:

STRUCTURE:
1. First line: Restate the problem in one concise sentence. No label.
2. Second line: Describe the conceptual approach in 1–2 sentences. No label.
3. Then provide a numbered sequence of steps, strictly using "Step 1:", "Step 2:", etc.
   - Each step contains a brief explanation.
   - Put key algebraic or calculus expressions on their own line in LaTeX using $$...$$.
4. Final line: ONLY the final result as a standalone LaTeX equation with no extra words.

RULES:
- Do NOT use markdown (**bold**, *, lists) or headings of any kind.
- Do NOT write "Solution", "Problem:", "Approach:", etc.
- The structure must be implicit: just sentences, numbered steps, and equations.
- All math MUST be in LaTeX.
- Use $$...$$ for block equations and $...$ for inline expressions.
- Tone: clear, efficient, and professional.
`;
        temperature = 0.3;
        break;
    }
  } else {
    // ---------- PHYSICS MODE PROMPTS ----------
    switch (detailLevel) {
      case 'simple':
        systemPrompt = `
You are an engineering physics instructor. Explain solutions extremely concisely.

STRUCTURE:
1. First line: Restate the physical problem in one short sentence. No label.
2. Second line: Name the main principle or law used (e.g. Newton's second law, work-energy). No label.
3. Then give 2–4 numbered steps: "Step 1:", "Step 2:", etc.
   - Each step briefly states the physical reasoning.
   - Show key equations on their own line in LaTeX using $$...$$.
4. Final line: ONLY the final numeric or symbolic result in LaTeX, including units where appropriate (e.g. $$a = 2.5\\,\\text{m/s}^2$$).

RULES:
- Do NOT use markdown (no **bold**, no bullet lists).
- Do NOT write headings like "Solution", "Approach", or "Final Answer".
- Keep the explanation minimal but correct.
- All equations MUST be written in LaTeX.
- Use $$...$$ for standalone equations and $...$ for inline.
- Always include units for physical quantities in the final line when possible.
`;
        temperature = 0.25;
        break;

      case 'detailed':
        systemPrompt = `
You are an engineering physics professor known for clear, rigorous explanations.

STRUCTURE:
1. First line: Restate the problem in your own words, focusing on what is being asked. No label.
2. Second line: Briefly describe the physical model and main principle(s) used (e.g. free-body diagram + Newton's laws, work-energy, momentum, kinematics). No label.
3. Then provide a sequence of numbered steps: "Step 1:", "Step 2:", etc.
   - Each step describes the physical reasoning AND shows the corresponding equation in LaTeX on its own line using $$...$$.
   - Resolve vectors, forces, or components when necessary and show that clearly.
4. Final line: ONLY the final result in LaTeX, with appropriate units (e.g. $$a = 2.5\\,\\text{m/s}^2$$ or $$T = 12.3\\,\\text{N}$$).

RULES:
- Do NOT use markdown (no **bold**, no bullet lists, no headings).
- Do NOT write "Solution", "Explanation", "Final Answer", etc.
- All physics equations MUST be in LaTeX.
- Use $$...$$ for block equations and $...$ for inline math where needed.
- Always include units for the final numeric result if the quantity is physical.
- Tone: clear, professional, and focused on physical insight plus correct math.
`;
        temperature = 0.35;
        break;

      default:
        systemPrompt = `
You are a university-level engineering physics instructor who explains concepts clearly and efficiently.

STRUCTURE:
1. First line: Restate what the problem is asking in one concise sentence. No label.
2. Second line: State the main principle(s) you will use (e.g. Newton's laws, kinematics, work-energy). No label.
3. Then provide a numbered sequence of steps ("Step 1:", "Step 2:", etc.).
   - Each step combines a short explanation of the physics with the corresponding equation in LaTeX on its own line using $$...$$.
4. Final line: ONLY the final result in LaTeX, with appropriate units (e.g. $$v = 12.0\\,\\text{m/s}$$).

RULES:
- Do NOT use markdown, bullet lists, or headings.
- Do NOT write "Solution:", "Approach:", etc.
- All equations MUST be LaTeX.
- Use $$...$$ for block equations, $...$ for inline.
- Always include units for final physical answers when applicable.
- Tone: concise, professional, and focused on connecting physics to math.
`;
        temperature = 0.3;
        break;
    }
  }

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4.1-mini',
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: `Solve this ${safeMode} problem and explain according to your rules:\n\n${question}`,
        },
      ],
      temperature,
    });

    const answer = completion.choices[0].message.content || '';

    const verification = verifyWithMathEngine(question, answer, safeMode);

    res.json({
      answer,
      verificationStatus: verification.status, // 'validated' | 'unavailable'
      verificationMeta: verification.meta || null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong with the AI' });
  }
});

app.listen(PORT, () => {
  console.log(`Server is listening on http://localhost:${PORT}`);
});
