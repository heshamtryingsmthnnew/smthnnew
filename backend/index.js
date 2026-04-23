require("dotenv").config();
const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
const { create, all } = require('mathjs');
const { buildProblemArtifact } = require('./artifact');

const BUILD_VERSION = "v2.0.0-claude-migration";

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Math.js instance
const math = create(all);

// Anthropic client
const client = process.env.RUN_VALIDATION_TESTS === "true"
  ? null
  : new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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
    let expr = String(question || "").trim();
    expr = expr.replace(/^\s*(please\s+)?(evaluate|compute|calculate|find)\b[:\s]*/i, "");
    expr = expr.split(":").pop().trim();
    expr = expr
      .replace(/\\left|\\right/g, "")
      .replace(/\\cdot|\\times/g, "*")
      .replace(/\\pi/g, "pi")
      .replace(/\\sqrt\{([^}]*)\}/g, "sqrt($1)")
      .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, "($1)/($2)")
      .replace(/\^\{([^}]*)\}/g, "^($1)")
      .replace(/\\/g, "")
      .replace(/\{/g, "(")
      .replace(/\}/g, ")");
    const result = math.evaluate(expr);
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

  const lastLine = String(text || "")
    .split("\n")
    .map(l => l.trim())
    .filter(Boolean)
    .pop() || "";

  const fracLatex = lastLine.match(/\\frac\{\s*(-?\d+)\s*\}\{\s*(-?\d+)\s*\}/);
  if (fracLatex) {
    const a = Number(fracLatex[1]);
    const b = Number(fracLatex[2]);
    if (b !== 0) return { value: a / b };
    return null;
  }

  const fracSimple = lastLine.match(/(-?\d+)\s*\/\s*(-?\d+)/);
  if (fracSimple) {
    const a = Number(fracSimple[1]);
    const b = Number(fracSimple[2]);
    if (b !== 0) return { value: a / b };
    return null;
  }

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

  // 3) Safe fallback: only allow plain numeric literal if expression is purely numeric
  const rawBlock = searchSpace.trim();

  // If contains letters (except scientific e/E), LaTeX commands, equals, or sqrt/fraction,
  // do NOT fallback to a random trailing number.
  if (
    /[a-df-zA-DF-Z]/.test(rawBlock) ||   // letters except e/E
    /\\sqrt|\\frac|\\pm/.test(rawBlock) ||
    /=/.test(rawBlock)
  ) {
    return null;
  }

  const matches = rawBlock.match(/-?\d+(\.\d+)?([eE][+-]?\d+)?/g);
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

function latexToMathjsMVP(expr) {
  let s = String(expr || "")
    .replace(/\\left|\\right/g, "")
    .replace(/\\quad|\\,|\\;|\\:|\\!/g, " ")
    .replace(/\\cdot|\\times/g, "*")
    .replace(/\\pi/g, "pi")
    .replace(/\\sqrt\{([^}]*)\}/g, "sqrt($1)")
    .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, "($1)/($2)")
    .replace(/\^\{([^}]*)\}/g, "^($1)")
    .replace(/\\/g, "")
    .replace(/\{/g, "(")
    .replace(/\}/g, ")")
    .replace(/\u00b2/g, "^2")
    .replace(/\s+/g, " ")
    .trim();

  s = s
    .replace(/(\d)([a-zA-Z(])/g, "$1*$2")
    .replace(/([a-zA-Z\)])(\d)/g, "$1*$2")
    .replace(/(\))([a-zA-Z(])/g, "$1*$2")
    .replace(/(^|[^a-zA-Z])([a-zA-Z])\(/g, "$1$2*(");

  return s;
}

function extractFinalMathLine(aiAnswerText) {
  const text = String(aiAnswerText || "");
  const blockMatches = [...text.matchAll(/\$\$(.*?)\$\$/gs)];
  if (blockMatches.length > 0) {
    return blockMatches[blockMatches.length - 1][1];
  }

  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .pop() || "";
}

function cleanInlineLatexText(s) {
  return String(s || "")
    .replace(/\\quad|\\,|\\;|\\:|\\!/g, " ")
    .replace(/\\text\{[^}]*\}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function verifySystemOfEquationsMVP(question, aiAnswerText) {
  if (!question || !aiAnswerText) return { status: "unavailable" };

  const normalized = String(question || "")
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const eqRegex = /([^=]+)=([^=]+)(?=$|\band\b|,|;)/gi;
  const equations = [];
  let m;
  while ((m = eqRegex.exec(normalized)) !== null) {
  let lhs = m[1].trim();
  let rhs = m[2].trim();

 // strip common trailing punctuation that breaks mathjs (esp. ; from system join)
 rhs = rhs.replace(/[.?!;,:\s]+$/g, "").trim();

  // Remove text before colon (e.g., "Solve the system:")
  if (lhs.includes(":")) lhs = lhs.split(":").pop().trim();

  // Remove command verbs
  lhs = lhs.replace(/^(solve|find|determine|calculate|compute)\b[:\s]*/i, "").trim();

  // NEW FIX: remove leading "and"
  lhs = lhs.replace(/^(and)\s+/i, "").trim();

  lhs = lhs.replace(/[.?!;,:\s]+$/g, "").trim();

  if (lhs && rhs) {
    equations.push({ lhs, rhs });
  }
}

  let assignmentText = cleanInlineLatexText(extractFinalMathLine(aiAnswerText));
  assignmentText = assignmentText.replace(/([a-zA-Z]\s*=\s*[^,]+?)\s+(?=[a-zA-Z]\s*=)/g, "$1, ");

  const scope = {};
  const assignRegex = /([a-zA-Z])\s*=\s*([^,]+)(?:,|$)/g;
  let a;
  while ((a = assignRegex.exec(assignmentText)) !== null) {
    const variable = a[1];
    const rhsExpr = latexToMathjsMVP(a[2].trim());

    let value;
    try {
      value = math.evaluate(rhsExpr);
    } catch (err) {
      return { status: "unavailable" };
    }

    if (!isFiniteNumber(value)) {
      return { status: "unavailable" };
    }
    scope[variable] = value;
  }

  if (Object.keys(scope).length < 2) {
    return { status: "unavailable" };
  }

  if (equations.length < 2) {
    return { status: "unavailable" };
  }

  const tol = 1e-6;
  const residuals = [];
  for (const eq of equations) {
    let lhsVal;
    let rhsVal;
    try {
      lhsVal = math.evaluate(latexToMathjsMVP(eq.lhs), scope);
      rhsVal = math.evaluate(latexToMathjsMVP(eq.rhs), scope);
    } catch (err) {
      return { status: "unavailable" };
    }

    if (!isFiniteNumber(lhsVal) || !isFiniteNumber(rhsVal)) {
      return { status: "unavailable" };
    }
    residuals.push(Math.abs(lhsVal - rhsVal));
  }

  if (residuals.length < 2) {
    return { status: "unavailable" };
  }

  const ok = residuals.every((r) => r <= tol);
  if (ok) {
    return { status: "validated", meta: { type: "system", residuals } };
  }

  return { status: "failed", meta: { type: "system", residuals } };
}

function verifyInequalityMVP(question, aiAnswerText) {
  if (!question || !aiAnswerText) return { status: "unavailable" };

  const compare = (lhs, rhs, op) => {
    switch (op) {
      case "<":
        return lhs < rhs;
      case "<=":
        return lhs <= rhs;
      case ">":
        return lhs > rhs;
      case ">=":
        return lhs >= rhs;
      default:
        return false;
    }
  };

  let normalized = normalizeInequalityOperators(String(question || ""));
  if (normalized.includes(":")) normalized = normalized.split(":").pop();
  normalized = normalized.replace(/\s+/g, " ").trim();

  const opMatch = normalized.match(/<=|>=|<|>/);
  if (!opMatch) return { status: "unavailable" };
  const op = opMatch[0];
  const idx = normalized.indexOf(op);
  if (idx === -1) return { status: "unavailable" };

  const qLhs = normalized.slice(0, idx).trim();
  const qRhs = normalized.slice(idx + op.length).trim();
  if (!qLhs || !qRhs) return { status: "unavailable" };

  const exprVars = `${qLhs} ${qRhs}`;
  let variable = null;
  if (/\bx\b/.test(exprVars)) variable = "x";
  else if (/\by\b/.test(exprVars)) variable = "y";
  else return { status: "unavailable" };

  const rawSolution = extractFinalMathLine(aiAnswerText).replace(/\\text\{\s*or\s*\}/gi, " or ");
   let solutionText = cleanInlineLatexText(rawSolution);
  solutionText = normalizeInequalityOperators(solutionText)
    .replace(/\bor\b/gi, " or ")
    .replace(/\s+/g, " ")
    .trim();

  if (!solutionText) return { status: "unavailable" };

  const regionParts = solutionText.split(/\s+or\s+/i).map((p) => p.trim()).filter(Boolean);
  if (regionParts.length === 0 || regionParts.length > 2) {
    return { status: "unavailable" };
  }

  const regions = [];
  for (const part of regionParts) {
    const rm = part.match(/^([a-zA-Z])\s*(<=|>=|<|>)\s*(.+)$/);
    if (!rm) return { status: "unavailable" };

    const varName = rm[1];
    const regionOp = rm[2];
    const boundExpr = latexToMathjsMVP(rm[3].trim());

    if (varName !== variable) return { status: "unavailable" };

    let bound;
    try {
      bound = math.evaluate(boundExpr);
    } catch (err) {
      return { status: "unavailable" };
    }
    if (!isFiniteNumber(bound)) return { status: "unavailable" };

    regions.push({ op: regionOp, bound });
  }

  const insidePoints = [];
  const outsidePoints = [];
  for (const region of regions) {
    if (region.op === "<" || region.op === "<=") {
      insidePoints.push(region.bound - 1);
      outsidePoints.push(region.bound + 1);
    } else if (region.op === ">" || region.op === ">=") {
      insidePoints.push(region.bound + 1);
      outsidePoints.push(region.bound - 1);
    } else {
      return { status: "unavailable" };
    }
  }

  if (regions.length === 2) {
    outsidePoints.push((regions[0].bound + regions[1].bound) / 2);
  }

  const lhsExpr = latexToMathjsMVP(qLhs);
  const rhsExpr = latexToMathjsMVP(qRhs);

  const testAt = (xVal) => {
    let lhsVal;
    let rhsVal;
    try {
      lhsVal = math.evaluate(lhsExpr, { [variable]: xVal });
      rhsVal = math.evaluate(rhsExpr, { [variable]: xVal });
    } catch (err) {
      return null;
    }
    if (!isFiniteNumber(lhsVal) || !isFiniteNumber(rhsVal)) return null;
    return compare(lhsVal, rhsVal, op);
  };

  const insideResults = [];
  for (const p of insidePoints) {
    const ok = testAt(p);
    if (ok === null) return { status: "unavailable" };
    insideResults.push({ x: p, ok });
  }

  const outsideResults = [];
  for (const p of outsidePoints) {
    const ok = testAt(p);
    if (ok === null) return { status: "unavailable" };
    outsideResults.push({ x: p, ok });
  }

  const allInsidePass = insideResults.every((r) => r.ok === true);
  const allOutsideFail = outsideResults.every((r) => r.ok === false);

  if (allInsidePass && allOutsideFail) {
    return {
      status: "validated",
      meta: { type: "inequality-mvp", regions, insideResults, outsideResults }
    };
  }

  return {
    status: "failed",
    meta: { type: "inequality-mvp", regions, insideResults, outsideResults }
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
    if (sys && sys.status !== "unavailable") return sys;

    const sysMVP = verifySystemOfEquationsMVP(question, aiAnswerText);
    if (sysMVP && sysMVP.status !== "unavailable") return sysMVP;
  }

  // Inequality check
  if (
    question.includes(">") ||
    question.includes("<") ||
    /\u2265|\u2264|\\ge|\\le/.test(question)
  ) {
    const ineq = verifyInequalitySolution(question, aiAnswerText);
if (ineq) {
  if (ineq.status === "validated") return ineq;

  if (ineq.status === "failed") {
    // If answer contains union-style solution, basic parser is too limited—try MVP
    const finalMath = cleanInlineLatexText(extractFinalMathLine(aiAnswerText));
    const unionLike = /\bor\b|\\cup|∪/i.test(finalMath);
    if (!unionLike) return ineq;
    // else fall through to MVP
  }

  // if unavailable, fall through to MVP
}

const ineqMVP = verifyInequalityMVP(question, aiAnswerText);
if (ineqMVP && ineqMVP.status !== "unavailable") return ineqMVP;

// If basic explicitly failed and MVP couldn't validate, return that failure
if (ineq && ineq.status === "failed") return ineq;
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
  // Prefer math-engine parsing when the AI clearly provides "x = ..." (prevents numeric-literal mis-extraction like 22 from sqrt{22})
  const finalMath = cleanInlineLatexText(extractFinalMathLine(aiAnswerText));
  if (/[a-zA-Z]\s*=/.test(finalMath)) {
  const eng = verifyWithMathEngine(question, aiAnswerText, "math");
  if (eng && (eng.status === "validated" || eng.status === "failed")) {
    return eng;
  }
  // If unavailable, fall through to other methods
}


  const eqCheck = verifyEquationSolutionBySubstitution(question, aiAnswerText);
  if (eqCheck) {
    return eqCheck;
  }

  return { status: "unavailable" };
}

function verifyWithMathEngine(question, aiAnswerText, mode) {
  if (mode !== "math") {
    return { status: "unavailable", reason: "physics_not_supported" };
  }

  const tol = 1e-6;

  function lastNonEmptyLine(text) {
    const lines = String(text || "")
      .split("\n")
      .map(l => l.trim())
      .filter(Boolean);
    return lines.length ? lines[lines.length - 1] : "";
  }

  function stripLatexDelimiters(s) {
    let t = String(s || "").trim();
    if (t.startsWith("$$") && t.endsWith("$$") && t.length > 4) {
      t = t.slice(2, -2).trim();
    }
    return t;
  }

  function extractSolution(finalLine) {
    const line = stripLatexDelimiters(finalLine);
    const match = line.match(/([a-zA-Z])\s*=\s*(.+)$/);
    if (!match) return null;
    return {
      variable: match[1],
      rhs: match[2].trim()
    };
  }

  function expandPlusMinus(expr) {
    const plusMinusChar = "\u00b1";
    if (expr.includes("\\pm") || expr.includes(plusMinusChar)) {
      const token = expr.includes("\\pm") ? "\\pm" : plusMinusChar;
      const idx = expr.indexOf(token);
      const plus = expr.slice(0, idx) + "+" + expr.slice(idx + token.length);
      const minus = expr.slice(0, idx) + "-" + expr.slice(idx + token.length);
      return [plus.trim(), minus.trim()];
    }
    return [expr.trim()];
  }

  function latexToMathjs(expr) {
    let s = String(expr)
      .replace(/\\left|\\right/g, "")
      .replace(/\\quad|\\,|\\;|\\:|\\!/g, "")
      .replace(/\\cdot|\\times/g, "*")
      .replace(/\\pi/g, "pi")
      .replace(/\\sqrt\{([^}]*)\}/g, "sqrt($1)")
      .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, "($1)/($2)")
      .replace(/\^\{([^}]*)\}/g, "^($1)")
      .replace(/\\/g, "")
      .replace(/\{/g, "(")
      .replace(/\}/g, ")")
      .replace(/\u00b2/g, "^2")
      .replace(/\s+/g, "")
      .trim();

    s = s
      .replace(/(\d)([a-zA-Z(])/g, "$1*$2")
      .replace(/([a-zA-Z\)])(\d)/g, "$1*$2")
      .replace(/(\))([a-zA-Z(])/g, "$1*$2")
      .replace(/(^|[^a-zA-Z])([a-zA-Z])\(/g, "$1$2*(");

    return s;
  }

  function extractEquation(q) {
    const idx = q.indexOf("=");
    if (idx === -1) return null;
    return {
      lhs: q.slice(0, idx).replace(/^(solve|find)\s*/i, "").trim(),
      rhs: q.slice(idx + 1).trim()
    };
  }

  const finalLine = lastNonEmptyLine(aiAnswerText);
  const parsed = extractSolution(finalLine);
  if (!parsed) {
    return { status: "unavailable", reason: "no_solution_extracted" };
  }

  const eq = extractEquation(question);
  if (!eq) {
    return { status: "unavailable", reason: "no_equation_found" };
  }

  function normalizeSolutionChunk(chunk, variable) {
    let t = String(chunk || "").trim();

    t = t.replace(/\\quad|\\,|\\;|\\:|\\!/g, "");

    const m = t.match(new RegExp(String(variable) + "\\s*=\\s*(.+)$"));
    if (m) t = m[1].trim();

    return t;
  }

  let rhsBody = parsed.rhs.trim();
  if (rhsBody.startsWith("{") && rhsBody.endsWith("}")) {
    rhsBody = rhsBody.slice(1, -1).trim();
  }

  const solutionsRaw = rhsBody
    .split(",")
    .map(s => normalizeSolutionChunk(s, parsed.variable))
    .flatMap(s => expandPlusMinus(s))
    .filter(Boolean);

  const lhsExpr = latexToMathjs(eq.lhs);
  const rhsExpr = latexToMathjs(eq.rhs);

  const residuals = [];

  for (const sol of solutionsRaw) {
    const solExpr = latexToMathjs(sol);

    let xVal;
    try {
      xVal = math.evaluate(solExpr);
    } catch {
      return { status: "unavailable", reason: "solution_eval_failed" };
    }

    let lhsVal, rhsVal;
    try {
      lhsVal = math.evaluate(lhsExpr, { [parsed.variable]: xVal });
      rhsVal = math.evaluate(rhsExpr, { [parsed.variable]: xVal });
    } catch {
      return { status: "unavailable", reason: "substitution_failed" };
    }

    const residual = math.abs(lhsVal - rhsVal);
    residuals.push(residual);

    if (residual > tol) {
      return {
        status: "failed",
        reason: "residual_too_large",
        details: { residuals, tol }
      };
    }
  }

  return {
    status: "validated",
    details: { residuals, tol }
  };
}

function extractMathPayload(question) {
  const original = String(question || "");
  const s = original.replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return { payload: original, kind: "unknown", reason: "empty" };

  // Helper: remove easy leading verbs (optional)
  const stripLeadVerbs = (t) =>
    t.replace(/^(please\s+)?(solve|find|determine|calculate|compute|evaluate|simplify)\b[:\s]*/i, "").trim();

  const cleaned = stripLeadVerbs(s);

  // 1) Extract relation chunks (equations/inequalities) anywhere inside the string
  // Captures "something = something", "something > something", "something <= something", etc.
  const relRegex = /([^\s].*?)(<=|>=|=|<|>)(.*?)(?=(?:\band\b|\bor\b|,|;|$))/g;
  const rels = [];
  let m;
  while ((m = relRegex.exec(cleaned)) !== null) {
    let lhs = (m[1] || "").trim();
    let op = m[2];
    let rhs = (m[3] || "").trim();

    // Trim trailing punctuation/prose tail
    rhs = rhs.replace(/([.?!]).*$/g, "").trim();
    rhs = rhs.replace(/[,:\s]+$/g, "").trim();

    // Keep only the last mathy chunk on lhs (drops arbitrary prose before it)
    const lhsTail = lhs.match(/([0-9a-zA-Z\(][0-9a-zA-Z\(\)\s^*+\-\/\\\.{}]+)$/);
    if (lhsTail) lhs = lhsTail[1].trim();

    // Remove leading filler if it survived in the lhs tail
    lhs = lhs.replace(/^(given\s+that|given|assuming|suppose|let|where|if)\b[:\s]*/i, "").trim();
    lhs = stripLeadVerbs(lhs);
    lhs = lhs.replace(/^for\s+[a-zA-Z]\b[:\s]*/i, "").trim();
    lhs = lhs.replace(/[,:\s]+$/g, "").trim();

    if (lhs && rhs) rels.push({ lhs, op, rhs });
  }

  // Classify if we found relations
  if (rels.length > 0) {
    const eqs = rels.filter(r => r.op === "=");
    const ineqs = rels.filter(r => r.op !== "=");

    // Prefer system if we have 2+ equations
    if (eqs.length >= 2) {
      const payload = eqs.map(r => `${r.lhs} = ${r.rhs}`).join("; ");
      return { payload, kind: "system", reason: "system_extracted" };
    }

    // Single inequality
    if (ineqs.length >= 1) {
      const r = ineqs[0];
      return { payload: `${r.lhs} ${r.op} ${r.rhs}`, kind: "inequality", reason: "inequality_extracted" };
    }

    // Single equation
    if (eqs.length === 1) {
      const r = eqs[0];
      return { payload: `${r.lhs} = ${r.rhs}`, kind: "equation", reason: "equation_extracted" };
    }
  }

  // 2) No relation: try to extract a pure expression for numeric validation
  let t = stripLeadVerbs(cleaned);
  // Take last mathy chunk (functions, numbers, parentheses, operators)
  const exprMatch = t.match(/([a-zA-Z]+\s*\([^)]*\)|[0-9a-zA-Z\(\)\s^*+\-\/\\.,]+)$/);
  if (exprMatch) t = exprMatch[1].trim();
  t = t.replace(/[,:\s]+$/g, "").trim();

  if (/[0-9a-zA-Z\(\)]/.test(t)) {
    return { payload: t, kind: "expression", reason: "expression_extracted" };
  }

  return { payload: original, kind: "unknown", reason: "no_math_found" };
}

function extractJsonObject(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;

  // First try direct parse
  try {
    return JSON.parse(raw);
  } catch (_) {}

  // Remove ```json ... ``` fences if present
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch (_) {}
  }

  // Fallback: find the first {...} block
  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const candidate = raw.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(candidate);
    } catch (_) {}
  }

  return null;
}

function normalizeStructuredSolution(parsed) {
  const safe = parsed && typeof parsed === 'object' ? parsed : {};

  const finalAnswerLatex =
    typeof safe.final_answer_latex === 'string'
      ? safe.final_answer_latex.trim()
      : '';

  const overview =
    typeof safe.overview === 'string'
      ? safe.overview.trim()
      : '';

  const sections = Array.isArray(safe.sections)
    ? safe.sections
        .map((section) => ({
          title:
            typeof section?.title === 'string' && section.title.trim()
              ? section.title.trim()
              : 'Explanation',
          summary_latex:
            typeof section?.summary_latex === 'string'
              ? section.summary_latex.trim()
              : '',
          explanation:
            typeof section?.explanation === 'string'
              ? section.explanation.trim()
              : '',
        }))
        .filter(
          (section) =>
            section.title || section.summary_latex || section.explanation
        )
    : [];

  return {
    final_answer_latex: finalAnswerLatex,
    overview,
    sections,
  };
}

function buildLegacyAnswerFromStructuredSolution(solution) {
  const lines = [];

  if (solution.overview) {
    lines.push(solution.overview);
    lines.push('');
  }

  for (const section of solution.sections) {
    if (section.title) {
      lines.push(section.title);
    }

    if (section.summary_latex) {
      lines.push(`$$${section.summary_latex}$$`);
    }

    if (section.explanation) {
      lines.push(section.explanation);
    }

    lines.push('');
  }

  if (solution.final_answer_latex) {
    lines.push(`$$${solution.final_answer_latex}$$`);
  }

  return lines.join('\n').trim();
}

function normalizeQuestionForModel(question) {
  return question
    .replace(
      /^(please\s+)?(factor|expand|simplify|differentiate|integrate|compute|evaluate|calculate|determine)\b[:\s]*/i,
      'Solve: '
    )
    .trim();
}

function getDiscriminantHint(normalizedQuestion) {
  // Matches: [coeff]x^2 [+/-] [coeff]x [+/-] [const] = 0
  const core = normalizedQuestion.replace(/^Solve:\s*/i, '').trim();
  const m = core.match(/^([+-]?\d*\.?\d*)\s*x\s*\^\s*2\s*([+-]\s*\d*\.?\d*)\s*x\s*([+-]\s*\d+\.?\d*)\s*=\s*0$/i);
  if (!m) return null;

  const a = m[1] === '' || m[1] === '+' ? 1 : m[1] === '-' ? -1 : Number(m[1]);
  const bRaw = m[2].replace(/\s/g, '');
  const b = bRaw === '+' || bRaw === '' ? 1 : bRaw === '-' ? -1 : Number(bRaw);
  const c = Number(m[3].replace(/\s/g, ''));

  if (!isFiniteNumber(a) || !isFiniteNumber(b) || !isFiniteNumber(c)) return null;

  const D = b * b - 4 * a * c;
  const sqrtD = Math.sqrt(Math.abs(D));
  const isPerfectSquare = D >= 0 && Number.isInteger(sqrtD);

  if (isPerfectSquare) return null;

  if (D < 0) return `Note: D = ${b}²-4(${a})(${c}) = ${D} < 0, no real solutions.`;
  return `Note: D = ${b}²-4(${a})(${c}) = ${D}. √${D} ≈ ${sqrtD.toFixed(4)} is irrational — use the quadratic formula, do not attempt factoring.`;
}

function preNormalizeEquation(question) {
  // Strip leading "Solve: " prefix for processing, reattach after
  const prefix = /^Solve:\s*/i.test(question) ? 'Solve: ' : '';
  const core = question.replace(/^Solve:\s*/i, '').trim();

  // Only attempt single-equation inputs
  const parts = core.split('=');
  if (parts.length !== 2) return question;

  const lhs = parts[0].trim();
  const rhs = parts[1].trim();

  if (rhs === '0') return question;

  try {
    const simplified = math.simplify(`(${lhs})-(${rhs})`).toString();
    return `${prefix}${simplified} = 0`;
  } catch {
    return question;
  }
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
  systemPrompt = `You are a precise math and physics solver. You solve problems accurately and return structured JSON only.
-Never include markdown, code fences, or explanation outside the JSON structure.
-Return valid JSON that exactly matches the schema provided.
-Never round irrational roots. Always express exact answers using sqrt notation or fractions.
-For any equation, move ALL terms to the left side to get standard form (= 0) first. Verify this rearrangement before solving.
-When solving a quadratic ax^2+bx+c=0, compute the discriminant D=b^2-4ac first. If D is not a perfect square, you MUST use the quadratic formula. Never guess integer factor pairs without verifying they multiply to c and sum to b exactly.`;

    temperature = 0.2;
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
    let rawModelOutput = '';
    let structuredSolution = { final_answer_latex: '', overview: '', sections: [] };
    let answer = '';
    let normalizedExpression = null;

    if (safeMode === 'math') {
      const modelQuestion = preNormalizeEquation(normalizeQuestionForModel(question));
      const discriminantHint = getDiscriminantHint(modelQuestion);
      const userPrompt = `Solve the following problem and return a JSON object with this exact structure:
{
  "final_answer_latex": "final answer in LaTeX notation",
  "normalized_expression": "clean math expression from the problem, no prose, standard notation",
  "overview": "1-2 sentence problem overview",
  "sections": [
    {
      "title": "descriptive title (not Step 1/2/3)",
      "summary_latex": "key equation for this step in LaTeX",
      "explanation": "what this step does and why",
      "concept": "underlying mathematical principle, 1-2 sentences"
    }
  ]
}

Problem: ${modelQuestion}${discriminantHint ? `\n${discriminantHint}` : ''}
Mode: ${safeMode}`;

      const message = await client.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 2048,
        temperature,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      });

      rawModelOutput = message.content[0].text || '';

      console.log('\n=== CLAUDE RAW RESPONSE ===');
      console.log(rawModelOutput);
      console.log('=== END RAW RESPONSE ===\n');

      try {
        const parsed = extractJsonObject(rawModelOutput);
        normalizedExpression = (parsed && typeof parsed.normalized_expression === 'string')
          ? parsed.normalized_expression.trim()
          : null;

        const normalizedSolution = normalizeStructuredSolution(parsed);
        if (
          normalizedSolution &&
          normalizedSolution.final_answer_latex &&
          Array.isArray(normalizedSolution.sections) &&
          normalizedSolution.sections.length > 0
        ) {
          // Preserve concept field per section
          normalizedSolution.sections = (Array.isArray(parsed.sections) ? parsed.sections : []).map((sec) => ({
            title: typeof sec.title === 'string' ? sec.title.trim() : 'Explanation',
            summary_latex: typeof sec.summary_latex === 'string' ? sec.summary_latex.trim() : '',
            explanation: typeof sec.explanation === 'string' ? sec.explanation.trim() : '',
            concept: typeof sec.concept === 'string' ? sec.concept.trim() : '',
          })).filter(s => s.title || s.summary_latex || s.explanation);

          structuredSolution = normalizedSolution;
          answer = buildLegacyAnswerFromStructuredSolution(structuredSolution);
          console.log('[PARSE] JSON parsing succeeded. normalized_expression:', normalizedExpression);
        } else {
          answer = rawModelOutput;
          console.log('[PARSE] JSON parsed but missing required fields — fell back to legacy parsing.');
        }
      } catch (parseErr) {
        console.warn('[PARSE] JSON parsing failed, fell back to legacy parsing. Error:', parseErr.message);
        answer = rawModelOutput;
      }
    } else {
      // Physics: use legacy prompt via Claude
      const message = await client.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 2048,
        temperature,
        system: systemPrompt,
        messages: [{ role: 'user', content: `Solve this ${safeMode} problem and explain according to your rules:\n\n${question}` }],
      });
      rawModelOutput = message.content[0].text || '';
      answer = rawModelOutput;
    }

    const normalized = extractMathPayload(question);
    const mathPayload = normalized.payload;

    let verification;
    let normalizedUsed = false;

    if (safeMode === 'math') {
      try {
        verification = verifyMathAnswer(mathPayload, answer);

        // Normalization retry: if raw input fails and we have a normalized_expression, retry with it
        if (verification.status === 'unavailable' && normalizedExpression) {
          const retryVerification = verifyMathAnswer(normalizedExpression, answer);
          if (retryVerification.status !== 'unavailable') {
            verification = retryVerification;
            normalizedUsed = true;
          }
        }
      } catch (verifyErr) {
        verification = { status: 'unavailable', reason: 'verification_error' };
      }
    } else {
      verification = { status: 'unavailable', reason: 'physics_not_supported' };
    }

    // Store normalized_expression in normalized payload
    const normalizedForArtifact = {
      ...normalized,
      payload: normalizedExpression || normalized.payload,
    };

    const artifact = buildProblemArtifact({
      question,
      mode: safeMode,
      buildVersion: BUILD_VERSION,
      normalized: normalizedForArtifact,
      answer,
      structuredSolution,
      verification,
      llmCalls: 1,
      normalizedUsed,
    });

    res.json({
      answer,
      verificationStatus: verification.status,
      verificationDetails: verification.details || verification.meta || null,
      verificationReason: verification.reason || null,
      extractedMathPayload: mathPayload,
      structuredSolution,
      artifact,
    });
  } catch (err) {
    console.error('Solve error:', err);
    res.status(500).json({
      answer: '',
      verificationStatus: 'unavailable',
      verificationDetails: null,
      verificationReason: 'internal_error',
      extractedMathPayload: null,
      structuredSolution: null,
      artifact: null,
    });
  }
});

function runValidationTests() {
  console.log("=== RUNNING VALIDATION TESTS ===");

  const testCases = [
    {
      name: "Quadratic with prose",
      question: "Please solve for x and show steps clearly: x^2 + 6x - 5 = 8",
      aiAnswer: "$$x = -3 + \\sqrt{22}, \\quad x = -3 - \\sqrt{22}$$",
      expected: "validated"
    },
    {
      name: "Simple linear",
      question: "2x + 3 = 7",
      aiAnswer: "$$x = 2$$",
      expected: "validated"
    },
    {
      name: "Numeric sin(pi/6)",
      question: "sin(pi/6)",
      aiAnswer: "$$\\frac{1}{2}$$",
      expected: "validated"
    },
    {
      name: "Numeric simple fraction",
      question: "Evaluate 3/4",
      aiAnswer: "$$3/4$$",
      expected: "validated"
    },
    {
      name: "System of equations",
      question: "Solve the system: x + y = 3 and 2x - y = 0",
      aiAnswer: "$$x = 1, \\quad y = 2$$",
      expected: "validated"
    },
    {
      name: "Inequality",
      question: "Solve the inequality: x^2 - 4x + 3 > 0",
      aiAnswer: "$$x < 1 \\quad \\text{or} \\quad x > 3$$",
      expected: "validated"
    }
  ];

  for (const test of testCases) {
    const extracted = extractMathPayload(test.question);
    const verification = verifyMathAnswer(extracted.payload, test.aiAnswer);

    const status = verification.status;
    const pass = status === test.expected;

    console.log({
      test: test.name,
      extractedPayload: extracted.payload,
      status,
      expected: test.expected,
      pass,
      details: verification.details || verification.meta || null,
      reason: verification.reason || null
    });
  }

  console.log("=== TESTS COMPLETE ===");
}

if (process.env.RUN_VALIDATION_TESTS === "true") {
  runValidationTests();
  process.exit(0);
}
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Build version: ${BUILD_VERSION}`);
});



