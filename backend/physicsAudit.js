const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function checkDimensional(finalAnswerLatex) {
  if (!finalAnswerLatex) return { units_present: false, units_consistent: null };

  const unitPatterns = [
    /\\text\{[a-zA-Z]+\}/,
    /\b(m|kg|s|N|J|W|Pa|K|mol|A|V|C|Hz|rad|sr)\b/,
    /\b(km|cm|mm|nm|ms|μs|ns|kJ|MJ|kW|MW|kN|MN)\b/,
    /\/s\b|\/s\^|\\mathrm\{/,
    /\bm\/s\b|\bm\/s\^2\b|\bkg\s*m\b|\bN\s*m\b/,
  ];

  const units_present = unitPatterns.some((p) => p.test(finalAnswerLatex));
  return { units_present, units_consistent: units_present ? null : null };
}

async function runPhysicsAudit(question, structuredSolution) {
  const firstAnswer = structuredSolution?.final_answer_latex || '';

  const systemPrompt = `You are auditing a physics solution by solving the same problem using a genuinely different physical method or framework than you would normally default to.

Rules:
- Return valid JSON only. No markdown, no code fences, no text outside the JSON.
- You will be given the original problem and the first solution's final answer.
- Choose a different physical framework or method than the most obvious one. For example: if the problem is naturally solved with kinematics, solve it using energy conservation. If it uses Newton's laws, try work-energy theorem or impulse-momentum theorem.
- Your goal is to independently arrive at an answer and compare it to the first solution's answer.
- Be honest: if your method reaches the same answer, agrees = true. If it reaches a different answer, agrees = false.
- confidence: "high" if your method is well-suited; "medium" if there is ambiguity; "low" if you had to make assumptions.
- note: one sentence on what you found or any important caveat.`;

  const userPrompt = `Audit the following physics problem by solving it using a DIFFERENT physical method than the most natural one.

Problem: ${question}

First solution's final answer: ${firstAnswer}

Return a JSON object with this exact structure:
{
  "agrees": true or false,
  "audit_answer_latex": "your answer in LaTeX notation, with units",
  "method_used": "brief name of the physical method you used (e.g. Energy Conservation, Impulse-Momentum Theorem)",
  "confidence": "high" or "medium" or "low",
  "note": "one sentence on what you found or any important caveat"
}`;

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 512,
      temperature: 0.3,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const raw = message.content[0]?.text || '';
    let parsed;

    try {
      const direct = JSON.parse(raw);
      parsed = direct;
    } catch (_) {
      const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
      if (fenced) {
        try { parsed = JSON.parse(fenced[1].trim()); } catch (_) {}
      }
      if (!parsed) {
        const braceMatch = raw.match(/\{[\s\S]*\}/);
        if (braceMatch) {
          try { parsed = JSON.parse(braceMatch[0]); } catch (_) {}
        }
      }
    }

    if (!parsed) {
      return {
        agrees: null,
        audit_answer: firstAnswer,
        method: 'unknown',
        confidence: 'low',
        note: 'Audit model returned unparseable output.',
        dimensional: checkDimensional(firstAnswer),
      };
    }

    return {
      agrees: parsed.agrees === true,
      audit_answer: typeof parsed.audit_answer_latex === 'string' ? parsed.audit_answer_latex : firstAnswer,
      method: typeof parsed.method_used === 'string' ? parsed.method_used : 'unknown',
      confidence: ['high', 'medium', 'low'].includes(parsed.confidence) ? parsed.confidence : 'medium',
      note: typeof parsed.note === 'string' ? parsed.note : '',
      dimensional: checkDimensional(firstAnswer),
    };
  } catch (err) {
    console.error('[PhysicsAudit] error:', err.message);
    return {
      agrees: null,
      audit_answer: firstAnswer,
      method: 'unknown',
      confidence: 'low',
      note: 'Audit failed due to an internal error.',
      dimensional: checkDimensional(firstAnswer),
    };
  }
}

module.exports = { runPhysicsAudit };
