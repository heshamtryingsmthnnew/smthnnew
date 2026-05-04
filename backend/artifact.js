function extractFinalMathLine(aiAnswerText) {
  const text = String(aiAnswerText || "");
  const blockMatches = [...text.matchAll(/\$\$(.*?)\$\$/gs)];

  if (blockMatches.length > 0) {
    return blockMatches[blockMatches.length - 1][1].trim();
  }

  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .pop() || "";
}
function extractIntroAndSections(aiAnswerText) {
  const text = String(aiAnswerText || "").trim();
  if (!text) {
    return {
      intro: "",
      sections: [],
    };
  }

  // Remove the final $$...$$ block, because that is usually the final answer
  const blockMatches = [...text.matchAll(/\$\$([\s\S]*?)\$\$/g)];
  let workingText = text;

  if (blockMatches.length > 0) {
    const lastFullMatch = blockMatches[blockMatches.length - 1][0];
    workingText = workingText.replace(lastFullMatch, "").trim();
  }

  if (!workingText) {
    return {
      intro: "",
      sections: [],
    };
  }

  // Split into paragraphs using blank lines first
  const paragraphs = workingText
    .split(/\n\s*\n/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  // If the model only returned one paragraph, try splitting by transition phrases
  let sectionChunks = paragraphs;

  if (sectionChunks.length <= 1) {
    sectionChunks = workingText
      .split(/\n(?=(?:First|Next|Then|Now|Finally|After that|Therefore|So)\b)/i)
      .map((chunk) => chunk.trim())
      .filter(Boolean);
  }

  // If still only one chunk, keep it as one section
  if (sectionChunks.length === 0) {
    sectionChunks = [workingText];
  }

  // First chunk becomes intro if there is more than one chunk
  let intro = "";
  let bodyChunks = sectionChunks;

  if (sectionChunks.length > 1) {
    intro = sectionChunks[0];
    bodyChunks = sectionChunks.slice(1);
  }

  // Build section objects
  const sections = bodyChunks.map((chunk, index) => {
    const lines = chunk
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const preview = lines[0] || chunk;

    // A very simple heading heuristic for now
    let heading = `Section ${index + 1}`;

    const lowerPreview = preview.toLowerCase();

    if (
      lowerPreview.includes("simplify") ||
      lowerPreview.includes("expand")
    ) {
      heading = "Simplify the expression";
    } else if (
      lowerPreview.includes("solve") ||
      lowerPreview.includes("isolate") ||
      lowerPreview.includes("divide")
    ) {
      heading = "Solve for the variable";
    } else if (
      lowerPreview.includes("check") ||
      lowerPreview.includes("verify") ||
      lowerPreview.includes("substitute")
    ) {
      heading = "Check the result";
    } else if (
      lowerPreview.includes("set up") ||
      lowerPreview.includes("start")
    ) {
      heading = "Set up the problem";
    }

    const expanded =
      lines.length > 1 ? lines.slice(1).join("\n") : chunk;

    return {
      heading,
      preview,
      expanded,
    };
  });

  return {
    intro,
    sections,
  };
}
function extractStructuredSteps(aiAnswerText) {
  const text = String(aiAnswerText || "").trim();
  if (!text) return [];

  // Remove the last $$...$$ block if present, because that is usually the final answer
  const blockMatches = [...text.matchAll(/\$\$([\s\S]*?)\$\$/g)];
  let workingText = text;

  if (blockMatches.length > 0) {
    const lastFullMatch = blockMatches[blockMatches.length - 1][0];
    workingText = workingText.replace(lastFullMatch, "").trim();
  }

  if (!workingText) return [];

  const normalized = workingText.replace(/\r\n/g, "\n").trim();

  // Helper: clean chunk text
  const cleanChunks = (chunks) =>
    chunks
      .map((chunk) => chunk.trim())
      .filter(Boolean)
      .map((chunk) => chunk.replace(/\n{3,}/g, "\n\n").trim());

  // 1) Best case: explicit numbered steps already exist
  // Examples:
  // Step 1:
  // 1.
  // 2)
  const explicitStepChunks = cleanChunks(
    normalized.split(/\n(?=(?:Step\s*\d+[:.)-]?|\d+[.)])\s*)/i)
  );

  if (explicitStepChunks.length >= 2) {
    return explicitStepChunks;
  }

  // 2) Next best: paragraph-based structure
  // Only split on blank lines, not every single line
  const paragraphChunks = cleanChunks(normalized.split(/\n\s*\n/));

  if (paragraphChunks.length >= 2) {
    return paragraphChunks;
  }

  // 3) Transitional words as soft step boundaries
  // This catches outputs like:
  // "First, ..."
  // "Next, ..."
  // "Then, ..."
  // "Finally, ..."
  const transitionChunks = cleanChunks(
    normalized.split(
      /\n(?=(?:First|Next|Then|Now|Finally|After that|So,|Therefore)\b)/i
    )
  );

  if (transitionChunks.length >= 2) {
    return transitionChunks;
  }

  // 4) If no real structure exists, keep it as ONE step
  // This avoids turning every line into a separate fake step.
  return [normalized];
}

function mapVerificationToBadge(verification, mode, normalizedKind) {
  if (!verification) return "not_verified";

  if (verification.status === "validated") {
    return "verified";
  }

  if (verification.status === "failed") {
    return "discrepancy_detected";
  }

  if (mode === "physics") {
    return "not_verified";
  }

  if (verification.status === "unavailable") {
    if (normalizedKind === "unknown") {
      return "not_verified";
    }
    return "checked";
  }

  return "not_verified";
}

function mapVerificationToCertainty(verification, mode, normalizedKind) {
  if (!verification) return "none";

  if (verification.status === "validated") {
    return "confirmed";
  }

  if (verification.status === "failed") {
    return "none";
  }

  if (mode === "physics") {
    return "none";
  }

  if (verification.status === "unavailable") {
    if (normalizedKind === "unknown") {
      return "none";
    }
    return "low";
  }

  return "none";
}

function mapVerificationToReasonCode(verification, mode, normalizedKind) {
  if (!verification) return "VALIDATION_INCONCLUSIVE";

  if (verification.status === "validated") {
    return null;
  }

  if (verification.status === "failed") {
    return "VALIDATION_FAILED";
  }

  if (mode === "physics") {
    return "UNSUPPORTED_PROBLEM_TYPE";
  }

  if (verification.reason === "input_may_have_typos") {
    return "PARSER_FAILED";
  }

  if (verification.reason === "mixed_prose_input") {
    return "PARSER_AMBIGUOUS";
  }

  if (normalizedKind === "unknown") {
    return "PARSER_FAILED";
  }

  if (verification.reason === "physics_not_supported") {
    return "UNSUPPORTED_PROBLEM_TYPE";
  }

  return "VALIDATION_INCONCLUSIVE";
}

function buildUserReason({ badge, mode, normalizedKind, verification }) {
  if (badge === "verified") {
    if (verification?.meta?.type === "system-substitution") {
      return "Checked by substituting the solution back into the system.";
    }

    if (verification?.meta?.type === "equation-substitution") {
      return "Checked by substituting the answer back into the equation.";
    }

    if (verification?.meta?.type === "inequality") {
      return "Checked by testing values inside and outside the solution region.";
    }

    if (verification?.meta?.type === "inequality-mvp") {
      return "Checked numerically across the solution regions.";
    }

    if (verification?.meta?.type === "system") {
      return "Checked by evaluating the equations with the reported solution.";
    }

    return "Checked independently against the problem.";
  }

  if (badge === "discrepancy_detected") {
    return "The answer may not match the problem as interpreted.";
  }

  if (mode === "physics") {
    return "Use Cross-Method Audit for an independent check.";
  }

  if (normalizedKind === "unknown") {
    return "I couldn't extract a clean math expression from the input.";
  }

  return "Deterministic verification not available for this problem type. Use Advanced Verification for a deeper check.";
}

function buildSuggestions(reasonCode) {
  switch (reasonCode) {
    case "PARSER_FAILED":
    case "PARSER_AMBIGUOUS":
      return [
        {
          action: "OPEN_MATH_KEYBOARD",
          label: "Try the math keyboard for cleaner input.",
        },
        {
          action: "SHOW_FORMAT_EXAMPLE",
          label: "Try rewriting the problem with clearer formatting.",
        },
      ];

    case "DOMAIN_AMBIGUITY":
      return [
        {
          action: "SIMPLIFY_WORDING",
          label: "Try specifying the domain or constraints more clearly.",
        },
      ];

    case "VALIDATION_FAILED":
      return [
        {
          action: "RUN_ADVANCED_VERIFICATION",
          label: "Run advanced verification.",
        },
        {
          action: "SHOW_FORMAT_EXAMPLE",
          label: "Double-check the formatting of the problem.",
        },
      ];

    case "VALIDATION_INCONCLUSIVE":
      return [
        {
          action: "RUN_ADVANCED_VERIFICATION",
          label: "Run advanced verification for a deeper check.",
        },
      ];

    case "UNSUPPORTED_PROBLEM_TYPE":
      return [];

    case "NUMERIC_CHECK_ONLY":
      return [];

    default:
      return [];
  }
}

function buildProblemArtifact({
  question,
  mode,
  buildVersion,
  normalized,
  answer,
  structuredSolution,
  verification,
  llmCalls = 1,
  normalizedUsed = false,
  advancedVerificationUsed = false,
  casResult = null,
  auditResult = null,
}) {
  const badge = mapVerificationToBadge(
  verification,
  mode,
  normalized?.kind || "unknown"
);

const certainty = mapVerificationToCertainty(
  verification,
  mode,
  normalized?.kind || "unknown"
);

  const reasonCode = mapVerificationToReasonCode(
    verification,
    mode,
    normalized?.kind || "unknown"
  );

  const userReason = buildUserReason({
    badge,
    mode,
    normalizedKind: normalized?.kind || "unknown",
    verification,
  });

  const suggestions = buildSuggestions(reasonCode);

  // Guard: reject final_answer_latex that looks like leaked JSON (model failed to parse its own output)
  const rawFinalAnswer = typeof structuredSolution?.final_answer_latex === 'string'
    ? structuredSolution.final_answer_latex.trim()
    : '';
  const finalAnswerIsClean = rawFinalAnswer.length > 0
    && !rawFinalAnswer.startsWith('{')
    && !rawFinalAnswer.startsWith('[')
    && !rawFinalAnswer.includes('"final_answer_latex"');

  let graphable = structuredSolution?.graphable === true;
  let graphExpression = typeof structuredSolution?.graph_expression === 'string'
    ? structuredSolution.graph_expression.trim()
    : '';
  if (graphable && !graphExpression) {
    graphable = false;
  }
  // Guard: dy/dx results and unresolved implicit expressions are not plottable
  if (
    graphable &&
    graphExpression &&
    (graphExpression.includes('dy/dx') ||
     graphExpression.includes('dy') ||
     (graphExpression.includes('=') && graphExpression.includes('y') && graphExpression.includes('x') &&
      !graphExpression.trim().startsWith('y=')))
  ) {
    graphable = false;
    graphExpression = '';
  }

  const fallbackFinalAnswer = extractFinalMathLine(answer);
  const { intro, sections: legacySections } = extractIntroAndSections(answer);

  const solution =
    structuredSolution &&
    finalAnswerIsClean &&
    Array.isArray(structuredSolution.sections) &&
    structuredSolution.sections.length > 0
      ? {
          final_answer_latex: structuredSolution.final_answer_latex || "",
          overview: structuredSolution.overview || "",
          sections: structuredSolution.sections.map((section) => ({
            title: section.title || "Explanation",
            summary_latex: section.summary_latex || "",
            explanation: section.explanation || "",
            concept: section.concept || "",
          })),
          wolfram_query: structuredSolution?.wolfram_query || null,
        }
      : {
          final_answer_latex: fallbackFinalAnswer || "",
          overview: intro || "",
          sections: (legacySections || []).map((section) => ({
            title: section.heading || "Explanation",
            summary_latex: section.preview || "",
            explanation: section.expanded || "",
          })),
        };

  // Badge overrides: reflect CAS (math) or audit (physics) result when run
  let finalBadge = badge;
  let finalCertainty = certainty;
  let finalReasonCode = reasonCode;
  let finalMethod = verification?.meta?.type || verification?.reason || null;
  let finalUserReason = userReason;

  if (mode === 'math' && casResult && casResult.used) {
    if (casResult.verdict === 'confirmed') {
      finalBadge = 'verified';
      finalCertainty = 'confirmed';
      finalReasonCode = null;
      finalMethod = 'wolfram_cas';
      finalUserReason = 'Confirmed by Wolfram Alpha.';
    } else if (casResult.verdict === 'discrepancy') {
      finalBadge = 'discrepancy_detected';
      finalCertainty = 'none';
      finalReasonCode = 'VALIDATION_FAILED';
      finalMethod = 'wolfram_cas';
      finalUserReason = 'Wolfram Alpha returned a different result — review recommended.';
    }
    // verdict === 'unavailable': keep Tier 1 badge/reason unchanged
  }

  if (mode === 'physics' && auditResult && auditResult.used) {
    finalBadge = 'checked';
    finalCertainty = 'low';
    finalReasonCode = null;
    finalMethod = 'cross_method_audit';
    finalUserReason = auditResult.agrees
      ? 'Audited via alternative method — results consistent.'
      : 'Alternative method returned a different result — review recommended.';
  }

  return {
    id: `artifact_${Date.now()}`,
    build_version: buildVersion,
    original_input: String(question || ""),
    mode: mode === "physics" ? "physics" : "math",

    normalized_payload: {
      type: normalized?.kind || null,
      payload: normalized?.payload || null,
      variables: [],
      domain: null,
      extraction_reason: normalized?.reason || null,
    },

    problem_type: normalized?.kind || null,
    variables: [],

    solution,

    verification: {
      badge: finalBadge,
      certainty: finalCertainty,
      reason_code: finalReasonCode,
      method: finalMethod,
      meta: verification?.meta || null,
      user_reason: finalUserReason,
    },

    suggestions,

    cas: casResult
      ? {
          verdict: casResult.verdict,
          wolfram_result: casResult.wolfram_result || null,
          expression_checked: casResult.expression_checked || null,
          used: true,
        }
      : { verdict: null, wolfram_result: null, expression_checked: null, used: false },

    audit: auditResult
      ? {
          verdict: auditResult.agrees === true ? 'consistent' : auditResult.agrees === false ? 'inconsistent' : null,
          audit_answer: auditResult.audit_answer || null,
          method: auditResult.method || null,
          confidence: auditResult.confidence || null,
          note: auditResult.note || null,
          dimensional: auditResult.dimensional || { units_present: false, units_consistent: null },
          used: true,
        }
      : {
          verdict: null,
          audit_answer: null,
          method: null,
          confidence: null,
          note: null,
          dimensional: null,
          used: false,
        },

    graph: {
      graphable,
      expression: graphExpression,
    },

    graph_spec: {
      expressions: [],
      sliders: [],
      viewport: null,
    },

    cost_meta: {
      llm_calls: llmCalls,
      model: process.env.SOLUTION_MODEL || 'claude-sonnet-4-5',
      normalized_used: normalizedUsed,
      advanced_verification_used: advancedVerificationUsed,
      cas_used: casResult !== null,
      audit_used: auditResult !== null,
    },
  };
}

module.exports = {
  buildProblemArtifact,
};