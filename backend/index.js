require("dotenv").config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const Anthropic = require('@anthropic-ai/sdk');
const { create, all } = require('mathjs');
const { buildProblemArtifact } = require('./artifact');
const { queryWolfram, compareWithWolfram, inferKindFromQuery } = require('./wolfram');
const { logCasEvent } = require('./casLogger');
const { runPhysicsAudit } = require('./physicsAudit');
const { insertSolve, updateSolveVerification, getUserFromToken, supabase, recomputeSessionName } = require('./supabase');
const { logEvent, newCorrelationId } = require('./eventLog');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    cb(null, allowed.includes(file.mimetype));
  },
});

const batchUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
    ];
    cb(null, allowed.includes(file.mimetype));
  },
});

const BUILD_VERSION = "v4.6.0-sidebar-optimistic";
const WOLFRAM_APP_ID = process.env.WOLFRAM_APP_ID;
const SOLUTION_MODEL = process.env.SOLUTION_MODEL || 'claude-sonnet-4-5';

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
 * Direct numeric equality check: evaluates both sides of "lhs = rhs" with math.js.
 * Returns validated/failed when both sides are fully numeric (no free variables).
 * Returns null when math.js throws (free variables present — fall through to other methods).
 */
function verifyDirectEquality(question) {
  const parts = question.split('=');
  if (parts.length !== 2) return null;
  const lhs = latexToMathjsMVP(parts[0].trim());
  const rhs = latexToMathjsMVP(parts[1].trim());
  try {
    const lhsVal = math.evaluate(lhs);
    const rhsVal = math.evaluate(rhs);
    if (!isFiniteNumber(lhsVal) || !isFiniteNumber(rhsVal)) return null;
    const residual = Math.abs(lhsVal - rhsVal);
    return residual < 1e-10
      ? { status: 'validated', meta: { type: 'numeric-expression', lhsVal, rhsVal, residual } }
      : { status: 'failed', meta: { type: 'numeric-expression', lhsVal, rhsVal, residual } };
  } catch {
    return null;
  }
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

  // Fast path: single equation where both sides are fully numeric (e.g. sin(pi/4) = sqrt(2)/2)
  const eqCount = (question.match(/=/g) || []).length;
  if (eqCount === 1) {
    const direct = verifyDirectEquality(question);
    if (direct) return direct;
  }

  // Systems check first
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

function stripLatexEnvironments(expr) {
  if (!expr) return expr;
  // \begin{cases}...\end{cases} → semicolon-separated equations the verifier can parse
  const casesMatch = expr.match(/\\begin\{cases\}([\s\S]*?)\\end\{cases\}/);
  if (casesMatch) {
    return casesMatch[1]
      .split(/\\\\/)
      .map((s) => s.trim())
      .filter(Boolean)
      .join('; ');
  }
  return expr;
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
      /^(please\s+|can you\s+|could you\s+|help me\s+|i need\s+|what is\s+|what are\s+|tell me\s+|give me\s+)+/i,
      ''
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

function sanitizeCommonTypos(input) {
  return String(input || '')
    .replace(/\ba+n+d+\b/gi, 'and')
    .replace(/\bo+r+\b/gi, 'or')
    .replace(/\bw+i+t+h+\b/gi, 'with')
    .trim();
}

const MATH_INSTRUCTION_PHRASES = [
  'find the eigenvalues', 'find the eigenvectors', 'find the inverse',
  'find the determinant', 'find the limit', 'find the roots', 'find the derivative',
  'find the integral', 'find the range', 'find the domain', 'find the zeros',
  'find the', 'compute the', 'calculate the', 'evaluate the',
  'solve for', 'factor', 'expand', 'simplify', 'differentiate', 'integrate',
  'minimize', 'maximize', 'optimize', 'prove', 'verify', 'show that',
  'determine', 'identify',
];

function detectMixedProseInput(input) {
  const lower = input.trim().toLowerCase();

  // Exempt recognized math instruction phrases — these are commands, not filler
  if (MATH_INSTRUCTION_PHRASES.some((phrase) => lower.startsWith(phrase))) {
    return false;
  }

  const hasMath = /[=+\-*/^<>]|sqrt|int|log|sin|cos|tan|\d/.test(input);
  const hasProseWords = /\b(find|solve|calculate|determine|what is|compute|evaluate|simplify)\b/i.test(input);
  const wordCount = input.trim().split(/\s+/).length;
  return hasMath && hasProseWords && wordCount > 4;
}

// Core solve logic — shared by /solve and /batch/solve.
// Returns { artifact, answer, structuredSolution, verification, mathPayload, safeMode }.
async function solveOne(rawInput, mode) {
  const question = sanitizeCommonTypos(rawInput);
  const hadTypos = question !== String(rawInput).trim();
  const isMixedProse = detectMixedProseInput(question);
  const safeMode = mode === 'physics' ? 'physics' : 'math';

  let systemPrompt;
  let temperature;

  if (safeMode === 'math') {
    systemPrompt = `You are a precise math solver. Your output is read by advanced undergrad and graduate students who are technically literate — they know the mechanics, they want the reasoning made explicit, not explained from scratch.

Rules:
- Return valid JSON only. No markdown, no code fences, no text outside the JSON.
- Never round irrational roots. Use exact form: sqrt(), fractions, or LaTeX notation.
- For any equation, move ALL terms to one side to get standard form (= 0) before solving.
- For quadratics: compute the discriminant D = b²-4ac explicitly. If D is not a perfect square, use the quadratic formula — do not guess factor pairs.
- Titles must name the operation precisely (e.g. "Factor the quadratic expression", "Apply the quadratic formula", "Isolate x") — never "Step 1", "Step 2", etc.
- explanation: state what was done and why it follows from the previous step. Assume the student knows the procedure — the explanation should justify the move, not describe it. 2–3 sentences, dense.
- concept: name the principle, then trace exactly how it maps to this specific step. Name the components — what plays the role of f, g, u, v, or whatever the principle requires — and show the substitution or mapping explicitly. End with why the result follows. 2–3 sentences.
  For steps involving composition, substitution, or multi-part rules (chain rule, quotient rule, integration by parts): always trace the component mapping.
  For direct applications of standard derivatives or identities (d/dx[cos(x)] = -sin(x), sin²+cos²=1): just name the rule and state it applies directly — no forced tracing.
  Never restate what was already shown in summary_latex. The concept field explains the why and the how, not the what.
- overview: one sentence identifying the specific expression or function being worked on and the method used.
- normalized_expression: plain math notation only — no LaTeX environments, no \\begin{cases}, no \\text{}. For systems, separate with semicolons.
- graphable: true ONLY if the result is an explicit function y=f(x), a parametric curve, or an inequality that Desmos can plot directly.
- graph_expression: if graphable, the exact Desmos-ready string. Empty string if graphable is false.
- wolfram_query: a Wolfram Alpha-ready query string for this problem, or null for equations/systems.`;
    temperature = 0.2;
  } else {
    systemPrompt = `You are a precise physics solver. Your output is read by advanced undergrad and graduate students who know introductory physics — they understand the principles, they want to see how the framework is applied, not have it explained from first principles.

Rules:
- Return valid JSON only. No markdown, no code fences, no text outside the JSON.
- Always include units in the final answer and in any intermediate results where units matter.
- Titles must name the physical operation precisely — never "Step 1", "Step 2", etc.
- summary_latex: the governing equation for this step in LaTeX, with variables defined inline if non-standard.
- explanation: state what was done, which physical constraint or conservation law drives it, and how the algebra follows. 2–3 sentences.
- concept: name the law or principle, then trace how it maps to this specific physical configuration. 2–3 sentences.
- overview: one sentence describing the specific physical scenario and what is being found.
- normalized_expression: the core governing equation in plain notation, no LaTeX environments.
- graphable: true ONLY if the result is an explicit function y=f(x). When in doubt, set false.
- graph_expression: if graphable, the Desmos-ready string. Empty string if false.`;
    temperature = 0.3;
  }

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
  "normalized_expression": "plain math only — no LaTeX environments, no \\text{}, no \\begin{cases}. Systems: semicolon-separated.",
  "wolfram_query": "Wolfram Alpha query string or null for equations/systems",
  "graphable": false,
  "graph_expression": "",
  "overview": "one sentence — problem type and method",
  "sections": [
    {
      "title": "precise operation name (not Step 1/2/3)",
      "summary_latex": "key equation for this step in LaTeX",
      "explanation": "what was done and why it follows — justify the move, not describe it. 2–3 sentences.",
      "concept": "theorem or property that licenses this step, applied directly to this problem. 1–2 sentences."
    }
  ]
}

Problem: ${modelQuestion}${discriminantHint ? `\n${discriminantHint}` : ''}
Mode: math`;

    const message = await client.messages.create({
      model: SOLUTION_MODEL,
      max_tokens: 1200,
      temperature,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    rawModelOutput = message.content[0].text || '';

    try {
      const parsed = extractJsonObject(rawModelOutput);
      normalizedExpression = (parsed && typeof parsed.normalized_expression === 'string')
        ? parsed.normalized_expression.trim() : null;

      const wolframQueryFromModel = (
        parsed && typeof parsed.wolfram_query === 'string' &&
        parsed.wolfram_query !== 'null' && parsed.wolfram_query.trim()
      ) ? parsed.wolfram_query.trim() : null;

      const normalizedSolution = normalizeStructuredSolution(parsed);
      if (normalizedSolution && normalizedSolution.final_answer_latex &&
          Array.isArray(normalizedSolution.sections) && normalizedSolution.sections.length > 0) {
        normalizedSolution.sections = (Array.isArray(parsed.sections) ? parsed.sections : []).map((sec) => ({
          title: typeof sec.title === 'string' ? sec.title.trim() : 'Explanation',
          summary_latex: typeof sec.summary_latex === 'string' ? sec.summary_latex.trim() : '',
          explanation: typeof sec.explanation === 'string' ? sec.explanation.trim() : '',
          concept: typeof sec.concept === 'string' ? sec.concept.trim() : '',
        })).filter(s => s.title || s.summary_latex || s.explanation);

        structuredSolution = normalizedSolution;
        structuredSolution.graphable = parsed?.graphable === true;
        structuredSolution.graph_expression = typeof parsed?.graph_expression === 'string' ? parsed.graph_expression.trim() : '';
        structuredSolution.wolfram_query = wolframQueryFromModel;
        answer = buildLegacyAnswerFromStructuredSolution(structuredSolution);
      } else {
        answer = rawModelOutput;
      }
    } catch {
      answer = rawModelOutput;
    }
  } else {
    const physicsUserPrompt = `Solve the following physics problem and return a JSON object with this exact structure:
{
  "final_answer_latex": "final answer in LaTeX notation, with units",
  "normalized_expression": "the core governing equation in plain notation",
  "graphable": false,
  "graph_expression": "",
  "overview": "one sentence — physical system, quantity being solved, framework used",
  "sections": [
    {
      "title": "precise physical operation (not Step 1/2/3)",
      "summary_latex": "governing equation for this step in LaTeX",
      "explanation": "what was done, which law or constraint drives it, how the math follows. 2–3 sentences.",
      "concept": "the law or principle and why it applies to this specific configuration. 1–2 sentences."
    }
  ]
}

Problem: ${question}
Mode: physics`;

    const physicsMessage = await client.messages.create({
      model: SOLUTION_MODEL,
      max_tokens: 1200,
      temperature,
      system: systemPrompt,
      messages: [{ role: 'user', content: physicsUserPrompt }],
    });

    rawModelOutput = physicsMessage.content[0].text || '';

    try {
      const parsed = extractJsonObject(rawModelOutput);
      normalizedExpression = (parsed && typeof parsed.normalized_expression === 'string')
        ? parsed.normalized_expression.trim() : null;

      if (parsed && parsed.final_answer_latex && Array.isArray(parsed.sections) && parsed.sections.length > 0) {
        structuredSolution = {
          final_answer_latex: parsed.final_answer_latex,
          overview: parsed.overview || '',
          sections: parsed.sections.map((sec) => ({
            title: typeof sec.title === 'string' ? sec.title.trim() : 'Explanation',
            summary_latex: typeof sec.summary_latex === 'string' ? sec.summary_latex.trim() : '',
            explanation: typeof sec.explanation === 'string' ? sec.explanation.trim() : '',
            concept: typeof sec.concept === 'string' ? sec.concept.trim() : '',
          })).filter(s => s.title || s.summary_latex || s.explanation),
          graphable: parsed.graphable === true,
          graph_expression: typeof parsed.graph_expression === 'string' ? parsed.graph_expression.trim() : '',
        };
        answer = buildLegacyAnswerFromStructuredSolution(structuredSolution);
      } else {
        answer = rawModelOutput;
      }
    } catch {
      answer = rawModelOutput;
    }
  }

  const normalized = extractMathPayload(question);
  const mathPayload = normalized.payload;

  let verification;
  let normalizedUsed = false;

  if (safeMode === 'math') {
    try {
      if (normalizedExpression) {
        const verifierInput = stripLatexEnvironments(normalizedExpression);
        verification = verifyMathAnswer(verifierInput, answer);
        normalizedUsed = true;
        if (verification.status === 'unavailable') {
          const rawVerification = verifyMathAnswer(mathPayload, answer);
          if (rawVerification.status !== 'unavailable') {
            verification = rawVerification;
            normalizedUsed = false;
          }
        }
      } else {
        verification = verifyMathAnswer(mathPayload, answer);
      }
    } catch {
      verification = { status: 'unavailable', reason: 'verification_error' };
    }
  } else {
    verification = { status: 'unavailable', reason: 'physics_not_supported' };
  }

  if (safeMode === 'math' && verification.status === 'unavailable') {
    if (isMixedProse) verification = { ...verification, reason: 'mixed_prose_input' };
    else if (hadTypos) verification = { ...verification, reason: 'input_may_have_typos' };
  }

  const normalizedForArtifact = { ...normalized, payload: normalizedExpression || normalized.payload };

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
    advancedVerificationUsed: false,
    casResult: null,
    auditResult: null,
  });

  return { artifact, answer, structuredSolution, verification, mathPayload, safeMode };
}

app.post('/solve', async (req, res) => {
  const { question: rawInput, mode } = req.body;

  if (!rawInput) {
    return res.status(400).json({ error: 'No question provided' });
  }

  const question = sanitizeCommonTypos(rawInput);
  const hadTypos = question !== String(rawInput).trim();
  const isMixedProse = detectMixedProseInput(question);

  const safeMode = mode === 'physics' ? 'physics' : 'math';
  const correlationId = newCorrelationId();

  let systemPrompt;
  let temperature;

    if (safeMode === 'math') {
      systemPrompt = `You are a precise math solver. Your output is read by advanced undergrad and graduate students who are technically literate — they know the mechanics, they want the reasoning made explicit, not explained from scratch.

Rules:
- Return valid JSON only. No markdown, no code fences, no text outside the JSON.
- Never round irrational roots. Use exact form: sqrt(), fractions, or LaTeX notation.
- For any equation, move ALL terms to one side to get standard form (= 0) before solving.
- For quadratics: compute the discriminant D = b²-4ac explicitly. If D is not a perfect square, use the quadratic formula — do not guess factor pairs.
- Titles must name the operation precisely (e.g. "Factor the quadratic expression", "Apply the quadratic formula", "Isolate x") — never "Step 1", "Step 2", etc.
- explanation: state what was done and why it follows from the previous step. Assume the student knows the procedure — the explanation should justify the move, not describe it. 2–3 sentences, dense.
- concept: name the principle, then trace exactly how it maps to this specific step. Name the components — what plays the role of f, g, u, v, or whatever the principle requires — and show the substitution or mapping explicitly. End with why the result follows. 2–3 sentences.
  For steps involving composition, substitution, or multi-part rules (chain rule, quotient rule, integration by parts): always trace the component mapping.
  For direct applications of standard derivatives or identities (d/dx[cos(x)] = -sin(x), sin²+cos²=1): just name the rule and state it applies directly — no forced tracing.
  Never restate what was already shown in summary_latex. The concept field explains the why and the how, not the what.
- overview: one sentence identifying the specific expression or function being worked on and the method used. Must reference the actual input — not just the problem type. Examples:
    "differentiate sin(x²) using the chain rule" NOT "differentiation of a composite function using the chain rule"
    "factor x² - 5x + 6 by finding two numbers that multiply to 6 and add to -5" NOT "factoring a quadratic expression"
    "integrate x²sin(x) by parts, letting u = x² and dv = sin(x)dx" NOT "integration using integration by parts"
  Be specific. The student already knows what type of problem this is — tell them what was done to this particular input.
- normalized_expression: plain math notation only — no LaTeX environments, no \\begin{cases}, no \\text{}. For systems, separate with semicolons: "2x + y = 7; x - y = 1". Single equations as-is.
- graphable: true ONLY if the result is an explicit function y=f(x), a parametric curve, or an inequality that Desmos can plot directly. Set false for: derivatives (dy/dx = ...), implicit expressions involving both x and y in the result, piecewise functions, vector results, matrices, and anything that is not a single Desmos-ready plotted curve. When in doubt, set false.
- graph_expression: if graphable, the exact Desmos-ready string (e.g. "y=x^2-5x+6", "x^2+y^2=25", "y=sin(x)"). Empty string if graphable is false.
- wolfram_query: a Wolfram Alpha-ready query string for this problem. This is different from normalized_expression — it must use Wolfram's query syntax, not math.js syntax. Examples:
    "differentiate x^3 * ln(x)" → "d/dx[x^3 * ln(x)]"
    "DIFERENTIATE X^3 LNX" → "d/dx[x^3 * ln(x)]"
    "integrate x^2 * sin(x) dx" → "integrate x^2 * sin(x) dx"
    "find the rate of change of x^3 at x=2" → "d/dx[x^3] at x=2"
    "simplify sin^2(x) + cos^2(x)" → "simplify sin^2(x) + cos^2(x)"
    "factor x^2 - 5x + 6" → "factor x^2 - 5x + 6"
    "x^2 - 5x + 6 = 0" → null
    "2x + y = 7; x - y = 1" → null
    "implicitly differentiate x^2 + y^2 = 25" → "implicitly differentiate x^2 + y^2 = 25 with respect to x"
    "find dy/dx for sin(xy) = x + y" → "implicitly differentiate sin(x*y) = x + y with respect to x"
  For equations and systems: always return null. Tier 1 handles those deterministically.
  Implicit differentiation exception: if the problem asks to differentiate an equation implicitly (e.g. "differentiate x^2 + y^2 = 25 implicitly", "find dy/dx for x^2 + y^2 = 1"), return a Wolfram query of the form "implicitly differentiate x^2 + y^2 = 25 with respect to x". Wolfram handles this natively. Do NOT return null for implicit differentiation.
  For everything else: return the Wolfram Alpha query string that would retrieve the correct result for this operation. Handle typos, all-caps, unusual phrasing, and LaTeX input — normalize them all to clean Wolfram syntax.`;
      temperature = 0.2;
    } else {
      temperature = 0.3;
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
  "normalized_expression": "plain math only — no LaTeX environments, no \\text{}, no \\begin{cases}. Systems: semicolon-separated e.g. '2x + y = 7; x - y = 1'. Single equations as-is.",
  "wolfram_query": "Wolfram Alpha query string for this problem, or null for equations/systems",
  "graphable": false,
  "graph_expression": "",
  "overview": "one sentence — problem type and method",
  "sections": [
    {
      "title": "precise operation name (not Step 1/2/3)",
      "summary_latex": "key equation for this step in LaTeX",
      "explanation": "what was done and why it follows — justify the move, not describe it. 2–3 sentences.",
      "concept": "theorem or property that licenses this step, applied directly to this problem. 1–2 sentences."
    }
  ]
}

Problem: ${modelQuestion}${discriminantHint ? `\n${discriminantHint}` : ''}
Mode: ${safeMode}`;

      const message = await client.messages.create({
        model: SOLUTION_MODEL,
        max_tokens: 1200,
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

        const wolframQueryFromModel = (
          parsed &&
          typeof parsed.wolfram_query === 'string' &&
          parsed.wolfram_query !== 'null' &&
          parsed.wolfram_query.trim()
        ) ? parsed.wolfram_query.trim() : null;

        console.log('[PARSE] wolfram_query:', wolframQueryFromModel);

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
          structuredSolution.graphable = parsed?.graphable === true;
          structuredSolution.graph_expression = typeof parsed?.graph_expression === 'string' ? parsed.graph_expression.trim() : '';
          structuredSolution.wolfram_query = wolframQueryFromModel;
          answer = buildLegacyAnswerFromStructuredSolution(structuredSolution);
          console.log('[PARSE] JSON parsing succeeded. normalized_expression:', normalizedExpression);
        } else {
          answer = rawModelOutput;
          console.log('[PARSE] JSON parsed but missing required fields — fell back to legacy parsing.');
        }
      } catch (parseErr) {
        console.warn('[PARSE] JSON parsing failed, fell back to legacy parsing. Error:', parseErr.message);
        answer = rawModelOutput;
        logEvent({
          kind: 'solve.model_parse_fail',
          severity: 'warn',
          correlationId,
          sessionId: req.headers['x-session-id'] || null,
          buildVersion: BUILD_VERSION,
          payload: { mode: safeMode, error_message: parseErr.message?.slice(0, 200), raw_length: rawModelOutput.length },
          message: 'Math solve: model returned non-JSON or missing fields',
        });
      }
    } else {
      // Physics: structured JSON path (mirrors math path)
      const physicsSystemPrompt = `You are a precise physics solver. Your output is read by advanced undergrad and graduate students who know introductory physics — they understand the principles, they want to see how the framework is applied, not have it explained from first principles.

Rules:
- Return valid JSON only. No markdown, no code fences, no text outside the JSON.
- Always include units in the final answer and in any intermediate results where units matter.
- Titles must name the physical operation precisely (e.g. "Apply conservation of energy", "Resolve into components", "Apply impulse-momentum theorem") — never "Step 1", "Step 2", etc.
- summary_latex: the governing equation for this step in LaTeX, with variables defined inline if non-standard.
- explanation: state what was done, which physical constraint or conservation law drives it, and how the algebra follows. Write for someone who can set up the problem themselves — justify the approach, don't walk through it. 2–3 sentences.
- concept: name the law or principle, then trace how it maps to this specific physical configuration. Name the specific quantities involved (which variable is the force, which is the mass, what the system boundary is), and show why the law applies to this setup rather than a different one. 2–3 sentences.
  For direct applications of standard equations (F=ma, V=IR): name the law, identify the quantities, state the result directly.
  Never restate what was already shown in summary_latex.
- overview: one sentence describing the specific physical scenario and what is being found. Reference the actual values or configuration given. Examples:
    "find the maximum height of a ball thrown upward at 20 m/s using kinematics" NOT "projectile motion using kinematic equations"
    "find the current through a 4Ω resistor connected to a 12V battery using Ohm's law" NOT "applying Ohm's law to a resistive circuit"
  Be specific to the given problem, not generic to the problem type.
- normalized_expression: the core governing equation in plain notation, no LaTeX environments.
- graphable: true ONLY if the result is an explicit function y=f(x), a parametric curve, or an inequality that Desmos can plot directly. Set false for: derivatives (dy/dx = ...), implicit expressions involving both x and y in the result, piecewise functions, vector results, matrices, and anything that is not a single Desmos-ready plotted curve. When in doubt, set false.
- graph_expression: if graphable, the exact Desmos-ready string (e.g. "y=x^2-5x+6", "x^2+y^2=25", "y=sin(x)"). Empty string if graphable is false.
- Never use "Step 1", "Step 2", etc. in titles or explanations.`;

      const physicsUserPrompt = `Solve the following physics problem and return a JSON object with this exact structure:
{
  "final_answer_latex": "final answer in LaTeX notation, with units",
  "normalized_expression": "the core governing equation in plain notation",
  "graphable": false,
  "graph_expression": "",
  "overview": "one sentence — physical system, quantity being solved, framework used",
  "sections": [
    {
      "title": "precise physical operation (not Step 1/2/3)",
      "summary_latex": "governing equation for this step in LaTeX",
      "explanation": "what was done, which law or constraint drives it, how the math follows. 2–3 sentences.",
      "concept": "the law or principle and why it applies to this specific configuration. 1–2 sentences."
    }
  ]
}

Problem: ${question}
Mode: physics`;

      const physicsMessage = await client.messages.create({
        model: SOLUTION_MODEL,
        max_tokens: 1200,
        temperature,
        system: physicsSystemPrompt,
        messages: [{ role: 'user', content: physicsUserPrompt }],
      });

      rawModelOutput = physicsMessage.content[0].text || '';

      console.log('\n=== CLAUDE RAW RESPONSE (PHYSICS) ===');
      console.log(rawModelOutput);
      console.log('=== END RAW RESPONSE ===\n');

      try {
        const parsed = extractJsonObject(rawModelOutput);
        normalizedExpression = (parsed && typeof parsed.normalized_expression === 'string')
          ? parsed.normalized_expression.trim()
          : null;

        if (
          parsed &&
          parsed.final_answer_latex &&
          Array.isArray(parsed.sections) &&
          parsed.sections.length > 0
        ) {
          structuredSolution = {
            final_answer_latex: parsed.final_answer_latex,
            overview: parsed.overview || '',
            sections: parsed.sections.map((sec) => ({
              title: typeof sec.title === 'string' ? sec.title.trim() : 'Explanation',
              summary_latex: typeof sec.summary_latex === 'string' ? sec.summary_latex.trim() : '',
              explanation: typeof sec.explanation === 'string' ? sec.explanation.trim() : '',
              concept: typeof sec.concept === 'string' ? sec.concept.trim() : '',
            })).filter(s => s.title || s.summary_latex || s.explanation),
            graphable: parsed.graphable === true,
            graph_expression: typeof parsed.graph_expression === 'string' ? parsed.graph_expression.trim() : '',
          };
          answer = buildLegacyAnswerFromStructuredSolution(structuredSolution);
          console.log('[PARSE] Physics JSON parsing succeeded.');
        } else {
          answer = rawModelOutput;
          console.log('[PARSE] Physics JSON parsed but missing required fields — fell back to raw.');
        }
      } catch (parseErr) {
        console.warn('[PARSE] Physics JSON parsing failed, fell back to raw. Error:', parseErr.message);
        answer = rawModelOutput;
        logEvent({
          kind: 'solve.model_parse_fail',
          severity: 'warn',
          correlationId,
          sessionId: req.headers['x-session-id'] || null,
          buildVersion: BUILD_VERSION,
          payload: { mode: 'physics', error_message: parseErr.message?.slice(0, 200), raw_length: rawModelOutput.length },
          message: 'Physics solve: model returned non-JSON or missing fields',
        });
      }
    }

    const normalized = extractMathPayload(question);
    const mathPayload = normalized.payload;

    let verification;
    let normalizedUsed = false;

    if (safeMode === 'math') {
      try {
        // Primary: use model's normalized_expression if available — more reliable than raw input
        if (normalizedExpression) {
          const verifierInput = stripLatexEnvironments(normalizedExpression);
          verification = verifyMathAnswer(verifierInput, answer);
          normalizedUsed = true;

          // Fallback: if normalized_expression also fails, try raw input
          // Note: if AI normalization failed, regex on raw input is unlikely to succeed —
          // this is a safety net, not a real recovery path
          if (verification.status === 'unavailable') {
            const rawVerification = verifyMathAnswer(mathPayload, answer);
            if (rawVerification.status !== 'unavailable') {
              verification = rawVerification;
              normalizedUsed = false;
            }
          }
        } else {
          // No normalized_expression returned by model — fall back to raw input only
          verification = verifyMathAnswer(mathPayload, answer);
        }
      } catch (verifyErr) {
        verification = { status: 'unavailable', reason: 'verification_error' };
        logEvent({
          kind: 'solve.verify_fail',
          severity: 'warn',
          correlationId,
          sessionId: req.headers['x-session-id'] || null,
          buildVersion: BUILD_VERSION,
          payload: {
            mode: safeMode,
            error_message: verifyErr.message?.slice(0, 200),
            normalized_used: !!normalizedExpression,
            problem_kind: normalized?.kind || 'unknown',
          },
          message: 'Verifier threw during /solve',
        });
      }
    } else {
      verification = { status: 'unavailable', reason: 'physics_not_supported' };
    }

    // Enrich verification reason for input quality issues (math only, unavailable only)
    if (safeMode === 'math' && verification.status === 'unavailable') {
      if (isMixedProse) {
        verification = { ...verification, reason: 'mixed_prose_input' };
      } else if (hadTypos) {
        verification = { ...verification, reason: 'input_may_have_typos' };
      }
    }

    // Store normalized_expression in normalized payload
    const normalizedForArtifact = {
      ...normalized,
      payload: normalizedExpression || normalized.payload,
    };

    // CAS and audit now run in the /verify endpoint — not here
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
      advancedVerificationUsed: false,
      casResult: null,
      auditResult: null,
    });

    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const user = token ? getUserFromToken(token) : null;
    const anonSessionId = req.headers['x-session-id'] || null;

    let solveRow = null;
    try {
      solveRow = await insertSolve({
        userId: user?.id || null,
        anonSessionId,
        rawInput: rawInput,
        mode: safeMode,
        artifact,
      });
    } catch (dbErr) {
      console.error('[solve] DB log failed (non-fatal):', dbErr.message);
      logEvent({
        kind: 'solve.exception',
        severity: 'error',
        correlationId,
        userId: user?.id || null,
        sessionId: anonSessionId,
        buildVersion: BUILD_VERSION,
        payload: { phase: 'db_insert', error_message: dbErr.message?.slice(0, 200) },
        message: 'insertSolve threw — response degraded to no solve_id/cluster_session_id',
      });
    }

    res.json({
      correlation_id: correlationId,
      solve_id: solveRow?.id || null,
      cluster_session_id: solveRow?.cluster_session_id || null,
      created_at: solveRow?.created_at || null,
      session: solveRow?.session || null,
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
    logEvent({
      kind: 'solve.exception',
      severity: 'error',
      correlationId,
      sessionId: req.headers['x-session-id'] || null,
      buildVersion: BUILD_VERSION,
      payload: { phase: 'handler', error_message: err.message?.slice(0, 200) },
      message: 'Uncaught exception in /solve',
    });
    res.status(500).json({
      correlation_id: correlationId,
      solve_id: null,
      cluster_session_id: null,
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

// ---- /verify — CAS (math) or audit (physics) decoupled from /solve ----
app.post('/verify', async (req, res) => {
  const { mode, wolfram_query, final_answer_latex, question, structured_solution, correlation_id } = req.body;
  const correlationId = correlation_id || null;
  const safeMode = mode === 'physics' ? 'physics' : 'math';

  try {
    if (safeMode === 'math') {
      if (!wolfram_query || !final_answer_latex) {
        logEvent({
          kind: 'verify.cas_skipped',
          severity: 'info',
          correlationId,
          buildVersion: BUILD_VERSION,
          payload: { has_query: !!wolfram_query, has_answer: !!final_answer_latex },
          message: 'CAS skipped: null wolfram_query or missing final_answer_latex',
        });
        return res.json({
          cas: { verdict: 'unavailable', wolfram_result: null, expression_checked: null, used: true }
        });
      }

      const wolframKind = inferKindFromQuery(wolfram_query);
      console.log('[/verify] wolfram_query:', wolfram_query);
      console.log('[/verify] kind:', wolframKind);

      const wolframResult = await queryWolfram(wolfram_query, wolframKind);
      console.log('[/verify] wolfram result:', wolframResult.result);

      if (!wolframResult.success) {
        logEvent({
          kind: 'verify.cas_timeout',
          severity: 'warn',
          correlationId,
          buildVersion: BUILD_VERSION,
          payload: { kind: wolframKind, wolfram_query: wolfram_query?.slice(0, 200) },
          message: 'Wolfram API call returned no usable result',
        });
      }

      let verdict = 'unavailable';
      if (wolframResult.success && wolframResult.result) {
        verdict = await compareWithWolfram(final_answer_latex, wolframResult.result, wolframKind);
        if (verdict === 'unavailable') {
          logEvent({
            kind: 'verify.compare_unavailable',
            severity: 'info',
            correlationId,
            buildVersion: BUILD_VERSION,
            payload: {
              kind: wolframKind,
              wolfram_result_length: wolframResult.result?.length || 0,
              claude_answer_length: final_answer_latex?.length || 0,
            },
            message: 'compareWithWolfram fell through both numeric and model tiers',
          });
        }
      }

      const casResult = {
        verdict,
        wolfram_result: wolframResult.result || null,
        expression_checked: wolfram_query,
        used: true,
      };

      logCasEvent({
        build_version: BUILD_VERSION,
        question: question || '',
        mode: safeMode,
        wolfram_query: wolfram_query || null,
        wolfram_kind: wolframKind,
        wolfram_success: !!(wolframResult.result),
        wolfram_result: wolframResult.result || null,
        claude_answer: final_answer_latex || '',
        verdict,
      });

      return res.json({ cas: casResult });

    } else {
      if (!question || !structured_solution) {
        return res.json({
          audit: { agrees: false, audit_answer: null, method: null,
                   confidence: 'low', note: null, dimensional: false, used: true }
        });
      }

      console.log('[/verify] Running physics audit...');
      const auditRaw = await runPhysicsAudit(question, structured_solution);
      if (auditRaw.confidence === 'low' && (auditRaw.note?.includes('unparseable') || auditRaw.note?.includes('failed'))) {
        logEvent({
          kind: 'audit.parse_fail',
          severity: 'warn',
          correlationId,
          buildVersion: BUILD_VERSION,
          payload: { note: auditRaw.note?.slice(0, 200) },
          message: 'Physics audit returned unparseable output or internal error',
        });
      }
      return res.json({ audit: { ...auditRaw, used: true } });
    }

  } catch (err) {
    console.error('[/verify] error:', err.message);
    logEvent({
      kind: 'solve.exception',
      severity: 'error',
      correlationId,
      buildVersion: BUILD_VERSION,
      payload: { phase: 'verify_handler', mode: safeMode, error_message: err.message?.slice(0, 200) },
      message: 'Uncaught exception in /verify',
    });
    const fallback = safeMode === 'math'
      ? { cas: { verdict: 'unavailable', wolfram_result: null, expression_checked: null, used: true } }
      : { audit: { agrees: false, audit_answer: null, method: null,
                   confidence: 'low', note: null, dimensional: false, used: true } };
    return res.json(fallback);
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

// ---- /extract-problem — vision-based problem extraction from image ----
app.post('/extract-problem', upload.single('image'), async (req, res) => {
  const correlationId = newCorrelationId();

  // OBSERVATION 1 — entry
  logEvent({
    kind: 'debug.observation',
    severity: 'info',
    correlationId,
    sessionId: req.headers['x-session-id'] || null,
    buildVersion: BUILD_VERSION,
    payload: {
      _diag_session: 'jpeg_bug_2026_05',
      where: 'extract_problem.entry',
      has_file: !!req.file,
      file_mimetype: req.file?.mimetype || null,
      file_size_bytes: req.file?.size || null,
      file_original_name: req.file?.originalname || null,
      content_type_header: req.headers['content-type']?.slice(0, 120) || null,
      content_length_header: req.headers['content-length'] || null,
    },
    message: 'extract-problem: handler entry',
  });

  if (!req.file) {
    logEvent({
      kind: 'extract.unsupported_mimetype',
      severity: 'warn',
      correlationId,
      sessionId: req.headers['x-session-id'] || null,
      buildVersion: BUILD_VERSION,
      payload: { content_type_header: req.headers['content-type']?.slice(0, 100) },
      message: 'File rejected by multer fileFilter (unsupported mimetype) or no file uploaded',
    });
    return res.status(400).json({ error: 'No image file provided' });
  }

  const systemPrompt = `You are a math problem extractor. Your only job is to read an image and extract math problems from it.

Rules:
- Extract only math/physics/engineering problems. Ignore all other text.
- Return each problem as a clean, self-contained statement suitable for a math solver.
- Preserve mathematical notation but write it in plain text (x^2 not x², sqrt(x) not √x).
- Do not solve anything. Do not explain. Only extract.
- If there are no math problems in the image, return an empty array.
- Return ONLY a JSON array of strings. No other text. No markdown fences.

Example (one problem): ["differentiate x^3 * ln(x)"]
Example (multiple): ["integrate sin(x) dx", "solve x^2 - 5x + 6 = 0"]
Example (no math): []`;

  const base64Image = req.file.buffer.toString('base64');
  const mediaType = req.file.mimetype;

  // OBSERVATION 2 — pre-API
  logEvent({
    kind: 'debug.observation',
    severity: 'info',
    correlationId,
    sessionId: req.headers['x-session-id'] || null,
    buildVersion: BUILD_VERSION,
    payload: {
      _diag_session: 'jpeg_bug_2026_05',
      where: 'extract_problem.pre_api',
      media_type_sent_to_anthropic: mediaType,
      base64_length: base64Image.length,
      base64_first_24_chars: base64Image.slice(0, 24),
      buffer_size_bytes: req.file.buffer.length,
    },
    message: 'extract-problem: about to call Claude vision',
  });

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: [{
          type: 'image',
          source: { type: 'base64', media_type: mediaType, data: base64Image },
        }],
      }],
    });

    const rawText = response.content?.[0]?.text?.trim() || '';
    const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

    // OBSERVATION 3 — model response
    logEvent({
      kind: 'debug.observation',
      severity: 'info',
      correlationId,
      sessionId: req.headers['x-session-id'] || null,
      buildVersion: BUILD_VERSION,
      payload: {
        _diag_session: 'jpeg_bug_2026_05',
        where: 'extract_problem.model_response',
        media_type_sent_to_anthropic: mediaType,
        raw_response_length: rawText.length,
        raw_response_text: rawText.slice(0, 5000),
        cleaned_response_length: cleaned.length,
        cleaned_response_text: cleaned.slice(0, 5000),
        response_stop_reason: response?.stop_reason || null,
        response_usage: response?.usage || null,
      },
      message: 'extract-problem: raw response from Claude vision',
    });

    let problems = [];
    try {
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) {
        problems = parsed.filter(p => typeof p === 'string' && p.trim().length > 0);
      }
    } catch {
      console.warn('[extract-problem] Non-JSON response:', rawText.slice(0, 100));
    }

    // OBSERVATION 4 — after parse
    logEvent({
      kind: 'debug.observation',
      severity: 'info',
      correlationId,
      sessionId: req.headers['x-session-id'] || null,
      buildVersion: BUILD_VERSION,
      payload: {
        _diag_session: 'jpeg_bug_2026_05',
        where: 'extract_problem.post_parse',
        problems_count: problems.length,
        problems_preview: problems.slice(0, 5).map(p => typeof p === 'string' ? p.slice(0, 200) : '[non-string]'),
        parse_succeeded: problems.length > 0 || cleaned === '[]',
      },
      message: 'extract-problem: parsed problems array',
    });

    if (problems.length === 0) {
      logEvent({
        kind: 'extract.no_problems_found',
        severity: 'info',
        correlationId,
        sessionId: req.headers['x-session-id'] || null,
        buildVersion: BUILD_VERSION,
        payload: { mimetype: req.file?.mimetype, buffer_size: req.file?.size },
        message: 'Vision model returned empty array',
      });
      return res.json({ mode: 'none', message: 'No math problems found in this image.' });
    }
    if (problems.length === 1) {
      return res.json({ mode: 'single', problem: problems[0] });
    }
    return res.json({ mode: 'multiple', problems });
  } catch (err) {
    console.error('[extract-problem] Error:', err.message);
    // OBSERVATION 5 — outer catch
    logEvent({
      kind: 'debug.observation',
      severity: 'warn',
      correlationId,
      sessionId: req.headers['x-session-id'] || null,
      buildVersion: BUILD_VERSION,
      payload: {
        _diag_session: 'jpeg_bug_2026_05',
        where: 'extract_problem.outer_catch',
        file_mimetype: req.file?.mimetype || null,
        file_size_bytes: req.file?.size || null,
        error_name: err?.name || null,
        error_message: err?.message?.slice(0, 500) || null,
        error_status: err?.status || null,
        error_type: err?.type || null,
        is_anthropic_error: err?.constructor?.name?.includes('Anthropic') || err?.constructor?.name === 'APIError',
      },
      message: 'extract-problem: outer catch — exception during processing',
    });
    logEvent({
      kind: 'extract.exception',
      severity: 'error',
      correlationId,
      sessionId: req.headers['x-session-id'] || null,
      buildVersion: BUILD_VERSION,
      payload: { mimetype: req.file?.mimetype, buffer_size: req.file?.size, error_message: err.message?.slice(0, 200) },
      message: 'Uncaught exception in /extract-problem',
    });
    res.status(500).json({ error: 'Failed to extract problems from image.' });
  }
});

// ---- /history/list — last 100 solves for authenticated user ----
app.get('/history/list', async (req, res) => {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const user = getUserFromToken(token);
  if (!user) return res.status(401).json({ error: 'Invalid token' });

  try {
    const { data, error } = await supabase
      .from('solves')
      .select('id, created_at, raw_input, mode, badge, problem_kind')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;

    const items = (data || []).map(row => ({
      id: row.id,
      created_at: row.created_at,
      raw_input: row.raw_input.length > 80 ? row.raw_input.slice(0, 80) + '…' : row.raw_input,
      mode: row.mode,
      badge: row.badge,
      problem_kind: row.problem_kind,
    }));

    res.json({ solves: items });
  } catch (err) {
    console.error('[history/list] error:', err.message);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// ---- /history/get/:id — load a historical solve with lazy Tier 1 revalidation ----
app.get('/history/get/:id', async (req, res) => {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const user = getUserFromToken(token);
  if (!user) return res.status(401).json({ error: 'Invalid token' });

  const { id } = req.params;

  try {
    const { data, error } = await supabase
      .from('solves')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (error || !data) return res.status(404).json({ error: 'Not found' });

    let artifact = data.artifact;
    let revalidated = false;
    let badgeChanged = false;

    // Lazy Tier 1 revalidation — only for math, only if build_version is stale
    const isStale = data.build_version !== BUILD_VERSION;
    const npType = artifact?.normalized_payload?.type;
    const canRevalidate = data.mode === 'math' && npType && npType !== 'unknown' && npType !== null;

    if (isStale && canRevalidate) {
      try {
        const payload = artifact.normalized_payload.payload;
        const answerText = artifact.solution?.final_answer_latex || '';
        const newVerification = verifyMathAnswer(payload, answerText);

        // Map status → badge (mirrors mapVerificationToBadge in artifact.js)
        let newBadge;
        if (newVerification.status === 'validated') newBadge = 'verified';
        else if (newVerification.status === 'failed') newBadge = 'discrepancy_detected';
        else if (newVerification.status === 'unavailable') newBadge = npType === 'unknown' ? 'not_verified' : 'checked';
        else newBadge = 'not_verified';

        const oldBadge = artifact.verification.badge;
        badgeChanged = newBadge !== oldBadge;

        // Update artifact verification field
        artifact = {
          ...artifact,
          verification: {
            ...artifact.verification,
            badge: newBadge,
          },
        };

        revalidated = true;

        // Persist update (fire-and-forget)
        supabase.from('solves').update({
          artifact,
          badge: newBadge,
          last_revalidated_at: new Date().toISOString(),
          last_revalidated_build_version: BUILD_VERSION,
          badge_changed: badgeChanged,
        }).eq('id', id).then(() => {}).catch(err => {
          console.error('[history/get] revalidation update failed:', err.message);
        });
      } catch (revalErr) {
        console.error('[history/get] revalidation error (non-fatal):', revalErr.message);
        logEvent({
          kind: 'history.revalidation_failed',
          severity: 'warn',
          userId: user.id,
          buildVersion: BUILD_VERSION,
          payload: {
            solve_id: id,
            stored_version: data.build_version,
            current_version: BUILD_VERSION,
            error_message: revalErr.message?.slice(0, 200),
          },
          message: 'Lazy Tier 1 revalidation threw during /history/get',
        });
        // Still return artifact as-is on revalidation error
        supabase.from('solves').update({
          last_revalidated_at: new Date().toISOString(),
          last_revalidated_build_version: BUILD_VERSION,
        }).eq('id', id).then(() => {}).catch(() => {});
      }
    } else if (isStale) {
      // Can't revalidate (physics or unknown kind) — still stamp the revalidation date
      supabase.from('solves').update({
        last_revalidated_at: new Date().toISOString(),
        last_revalidated_build_version: BUILD_VERSION,
      }).eq('id', id).then(() => {}).catch(() => {});
    }

    res.json({
      artifact,
      raw_input: data.raw_input,
      mode: data.mode,
      created_at: data.created_at,
      revalidated,
      badge_changed: badgeChanged,
      last_revalidated_at: revalidated ? new Date().toISOString() : data.last_revalidated_at,
      last_revalidated_build_version: revalidated ? BUILD_VERSION : data.last_revalidated_build_version,
    });
  } catch (err) {
    console.error('[history/get] error:', err.message);
    res.status(500).json({ error: 'Failed to fetch solve' });
  }
});

// ---- /auth/merge-session — merge anonymous solves + sessions into authenticated user ----
app.post('/auth/merge-session', async (req, res) => {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const user = getUserFromToken(token);
  if (!user) return res.status(401).json({ error: 'Invalid token' });

  const { session_id } = req.body;
  if (!session_id) return res.status(400).json({ error: 'session_id required' });

  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // 1. Re-own solves (anon_session_id column — post-migration schema)
    const { data, error } = await supabase
      .from('solves')
      .update({ user_id: user.id, anon_session_id: null })
      .eq('anon_session_id', session_id)
      .is('user_id', null)
      .gte('created_at', cutoff)
      .select('id');

    if (error) throw error;

    // 2. Re-own the corresponding sessions rows so history reads by user_id find them
    // Known v1 edge case: concurrent authenticated + anonymous solves in the same window
    // may produce two sessions in one window. Self-corrects on the next solve via clustering.
    const { error: sessErr } = await supabase
      .from('sessions')
      .update({ user_id: user.id, anon_session_id: null })
      .eq('anon_session_id', session_id)
      .is('user_id', null);

    if (sessErr) {
      console.error('[auth/merge-session] sessions re-own error (non-fatal):', sessErr.message);
    }

    res.json({ merged: (data || []).length });
  } catch (err) {
    console.error('[auth/merge-session] error:', err.message);
    logEvent({
      kind: 'auth.merge_failed',
      severity: 'warn',
      userId: user?.id || null,
      buildVersion: BUILD_VERSION,
      payload: { session_id: session_id?.slice(0, 40), error_message: err.message?.slice(0, 200) },
      message: 'Anonymous session merge failed',
    });
    res.status(500).json({ error: 'Merge failed' });
  }
});

// ---- GET /sessions — grouped sessions with nested solves for the owner ----
app.get('/sessions', async (req, res) => {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const user = token ? getUserFromToken(token) : null;
  const anonSessionId = req.headers['x-session-id'] || null;

  if (!user && !anonSessionId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Fetch sessions owned by this owner
    let sessQuery = supabase
      .from('sessions')
      .select('id, name, source, created_at, last_solve_at');

    if (user) {
      sessQuery = sessQuery.eq('user_id', user.id);
    } else {
      sessQuery = sessQuery.eq('anon_session_id', anonSessionId);
    }

    sessQuery = sessQuery.order('last_solve_at', { ascending: false });

    const { data: sessions, error: sessErr } = await sessQuery;
    if (sessErr) throw sessErr;

    if (!sessions || sessions.length === 0) {
      return res.json({ sessions: [] });
    }

    const sessionIds = sessions.map(s => s.id);

    // Fetch solves for all sessions in one query
    const { data: solves, error: solvesErr } = await supabase
      .from('solves')
      .select('id, created_at, raw_input, mode, badge, problem_kind, cluster_session_id')
      .in('cluster_session_id', sessionIds)
      .order('created_at', { ascending: false });

    if (solvesErr) throw solvesErr;

    // Group solves by session
    const solvesBySession = {};
    for (const solve of (solves || [])) {
      const sid = solve.cluster_session_id;
      if (!solvesBySession[sid]) solvesBySession[sid] = [];
      solvesBySession[sid].push({
        id: solve.id,
        created_at: solve.created_at,
        raw_input: solve.raw_input.length > 80 ? solve.raw_input.slice(0, 80) + '…' : solve.raw_input,
        mode: solve.mode,
        badge: solve.badge,
        problem_kind: solve.problem_kind,
      });
    }

    const result = sessions.map(s => ({
      id: s.id,
      name: s.name,
      source: s.source,
      created_at: s.created_at,
      last_solve_at: s.last_solve_at,
      solve_count: (solvesBySession[s.id] || []).length,
      solves: solvesBySession[s.id] || [],
    }));

    res.json({ sessions: result });
  } catch (err) {
    console.error('[/sessions] error:', err.message);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

// ---- PATCH /sessions/:id/rename — rename a session (sets source = 'renamed') ----
app.patch('/sessions/:id/rename', async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;

  // Validate name
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'name is required and must be a non-empty string' });
  }
  const trimmedName = name.trim().slice(0, 200);

  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const user = token ? getUserFromToken(token) : null;
  const anonSessionId = req.headers['x-session-id'] || null;

  if (!user && !anonSessionId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Fetch session to verify ownership
    const { data: session, error: fetchErr } = await supabase
      .from('sessions')
      .select('id, user_id, anon_session_id')
      .eq('id', id)
      .single();

    if (fetchErr || !session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Ownership check
    const ownerOk = user
      ? session.user_id === user.id
      : session.anon_session_id === anonSessionId;

    if (!ownerOk) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Rename
    const { error: updateErr } = await supabase
      .from('sessions')
      .update({ name: trimmedName, source: 'renamed' })
      .eq('id', id);

    if (updateErr) throw updateErr;

    logEvent({
      kind: 'session.renamed',
      severity: 'info',
      sessionId: id,
      userId: user?.id || null,
      buildVersion: BUILD_VERSION,
      payload: {
        session_id: id,
        owner_type: user ? 'authenticated' : 'anonymous',
        new_name_length: trimmedName.length,
      },
      message: 'User renamed a session',
    });

    res.json({ ok: true, name: trimmedName });
  } catch (err) {
    console.error('[/sessions/rename] error:', err.message);
    res.status(500).json({ error: 'Failed to rename session' });
  }
});

// ---- /batch/extract — parse text or document into array of problems ----
app.post('/batch/extract', batchUpload.single('file'), async (req, res) => {
  if (!isBatchAllowed(req)) {
    return res.status(403).json({ error: 'Batch solve requires Pro.' });
  }
  const { mode, text } = req.body;
  const file = req.file;

  try {
    let sourceText = '';

    if (file) {
      const mimetype = file.mimetype;
      const buf = file.buffer;

      if (mimetype === 'application/pdf') {
        const pdfParse = require('pdf-parse');
        const data = await pdfParse(buf);
        sourceText = data.text || '';
      } else if (mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
                 mimetype === 'application/msword') {
        const mammoth = require('mammoth');
        const result = await mammoth.extractRawText({ buffer: buf });
        sourceText = result.value || '';
      } else if (mimetype.startsWith('image/')) {
        const b64 = buf.toString('base64');
        const message = await client.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1024,
          system: 'You are a math problem extractor. Extract all math/physics problems from the image as a JSON array of strings. Return ONLY the JSON array, no other text.',
          messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: mimetype, data: b64 } }] }],
        });
        const raw = message.content[0].text?.trim() || '[]';
        try {
          const problems = JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim());
          return res.json({ problems: Array.isArray(problems) ? problems.slice(0, 50) : [], truncated: Array.isArray(problems) && problems.length > 50 });
        } catch {
          return res.json({ problems: [], truncated: false });
        }
      } else {
        return res.status(400).json({ error: 'Unsupported document type' });
      }
    } else if (text) {
      sourceText = text;
    } else {
      return res.status(400).json({ error: 'No file or text provided' });
    }

    if (!sourceText.trim()) return res.json({ problems: [], truncated: false });

    // Ask Claude to split the text into individual problems
    const safeMode = mode === 'physics' ? 'physics' : 'math';
    const splitMessage = await client.messages.create({
      model: SOLUTION_MODEL,
      max_tokens: 2048,
      temperature: 0,
      system: `You split ${safeMode} problem sets into individual problems. Return a JSON array of strings — one string per problem. Each string should be a complete, self-contained problem statement. Remove numbering prefixes (1., 2., a), b), etc.). Return ONLY the JSON array, no other text, no markdown fences.`,
      messages: [{ role: 'user', content: `Split these into individual problems:\n\n${sourceText.slice(0, 8000)}` }],
    });

    const rawSplit = splitMessage.content[0].text?.trim() || '[]';
    let problems = [];
    try {
      const cleaned = rawSplit.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) {
        problems = parsed.filter(p => typeof p === 'string' && p.trim().length > 0).map(p => p.trim());
      }
    } catch {
      // Fall back: split by newlines, filter non-empty
      problems = sourceText.split('\n').map(l => l.trim()).filter(l => l.length > 4);
    }

    const truncated = problems.length > 50;
    res.json({ problems: problems.slice(0, 50), truncated });
  } catch (err) {
    console.error('[batch/extract] error:', err.message);
    logEvent({
      kind: 'batch.extract_failed',
      severity: 'error',
      sessionId: req.headers['x-session-id'] || null,
      buildVersion: BUILD_VERSION,
      payload: { input_type, mimetype, error_message: err.message?.slice(0, 200) },
      message: 'Batch extraction failed',
    });
    res.status(500).json({ error: 'Extraction failed' });
  }
});

// ---- /batch/solve — SSE streaming batch solve ----
const PRO_BATCH_CAP = 50;
const DAILY_QUOTA = 15;

/**
 * Batch gate — returns true if the request is allowed to use batch endpoints.
 *
 * Phase 6 will replace this with a real Pro flag check on the user record.
 * For now: dev env flag bypasses, all other requests rejected.
 *
 * Tested locally by setting BATCH_DEV_ALLOW=true in backend/.env.
 */
function isBatchAllowed(req) {
  if (process.env.BATCH_DEV_ALLOW === 'true') return true;
  // TODO Phase 6: replace with `return user?.is_pro === true;`
  return false;
}

async function getDailyUsage(userId, anonSessionId) {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  let query = supabase.from('solves').select('id', { count: 'exact', head: true }).gte('created_at', cutoff);
  if (userId) query = query.eq('user_id', userId);
  else if (anonSessionId) query = query.eq('anon_session_id', anonSessionId);
  else return 0;
  const { count } = await query;
  return count || 0;
}

app.post('/batch/solve', async (req, res) => {
  if (!isBatchAllowed(req)) {
    return res.status(403).json({ error: 'Batch solve requires Pro.' });
  }
  const { problems, mode } = req.body;
  if (!Array.isArray(problems) || problems.length === 0) {
    return res.status(400).json({ error: 'No problems provided' });
  }

  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const user = token ? getUserFromToken(token) : null;
  const anonSessionId = req.headers['x-session-id'] || null;

  // Server-side cap — Pro users only past the gate above, so single cap applies
  if (problems.length > PRO_BATCH_CAP) {
    return res.status(400).json({ error: `Batch capped at ${PRO_BATCH_CAP} problems.` });
  }

  // Quota check
  try {
    const used = await getDailyUsage(user?.id, anonSessionId);
    const remaining = DAILY_QUOTA - used;
    if (remaining < problems.length) {
      return res.status(429).json({ error: `This batch requires ${problems.length} solves but you have ${Math.max(0, remaining)} remaining today.` });
    }
  } catch (err) {
    console.warn('[batch] quota check failed (non-fatal):', err.message);
  }

  // SSE setup
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (obj) => {
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify(obj)}\n\n`);
      if (typeof res.flush === 'function') res.flush();
    }
  };

  let cancelled = false;
  req.on('close', () => { cancelled = true; });

  const summary = { verified: 0, checked: 0, discrepancy: 0, not_verified: 0, failed: 0 };
  const CHUNK = 3;

  for (let i = 0; i < problems.length && !cancelled; i += CHUNK) {
    const chunk = problems.slice(i, Math.min(i + CHUNK, problems.length));
    const chunkIndices = chunk.map((_, j) => i + j);

    // Announce all in chunk as started
    for (const idx of chunkIndices) {
      if (!cancelled) send({ type: 'problem_started', index: idx });
    }

    // Process chunk in parallel
    await Promise.all(chunk.map(async (problem, j) => {
      const idx = chunkIndices[j];
      if (cancelled) return;
      try {
        const result = await solveOne(problem, mode);
        const badge = result.artifact?.verification?.badge || 'not_verified';
        if (badge === 'verified') summary.verified++;
        else if (badge === 'checked') summary.checked++;
        else if (badge === 'discrepancy_detected') summary.discrepancy++;
        else summary.not_verified++;

        send({ type: 'problem_completed', index: idx, artifact: result.artifact });

        // Fire-and-forget DB log per problem
        insertSolve({ userId: user?.id || null, anonSessionId, rawInput: problem, mode: result.safeMode, artifact: result.artifact })
          .catch(err => console.error('[batch] DB log failed:', err.message));
      } catch (err) {
        summary.failed++;
        send({ type: 'problem_failed', index: idx, error: err.message });
        logEvent({
          kind: 'batch.problem_failed',
          severity: 'warn',
          userId: user?.id || null,
          sessionId: anonSessionId,
          buildVersion: BUILD_VERSION,
          payload: { problem_index: idx, mode, error_message: err.message?.slice(0, 200) },
          message: 'Single problem failed during batch solve',
        });
      }
    }));
  }

  if (!cancelled) {
    send({ type: 'batch_completed', summary });
  }
  res.end();
});

// ---- POST /events — frontend event logging (fire-and-forget; never blocks caller) ----
// Accepts frontend-originated events (frontend.*, session.loaded_without_new_solve, etc.).
// All kinds must be registered in eventKinds.js.
app.post('/events', (req, res) => {
  const { kind, severity, correlation_id, session_id, payload, message } = req.body;

  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const user = token ? getUserFromToken(token) : null;

  try {
    logEvent({
      kind,
      severity: severity || 'info',
      correlationId: correlation_id || null,
      userId: user?.id || null,
      sessionId: session_id || req.headers['x-session-id'] || null,
      buildVersion: BUILD_VERSION,
      payload: payload || null,
      message: message || null,
    });
  } catch (err) {
    console.warn('[/events] logEvent failed (non-fatal):', err.message);
  }

  res.json({ ok: true });
});

if (process.env.RUN_VALIDATION_TESTS === "true") {
  runValidationTests();
  process.exit(0);
}
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Build version: ${BUILD_VERSION}`);
});



