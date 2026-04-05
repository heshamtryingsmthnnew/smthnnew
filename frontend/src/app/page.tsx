'use client';

import 'katex/dist/katex.min.css';
import { BlockMath } from 'react-katex';
import axios from 'axios';
import { useEffect, useState, FormEvent } from 'react';

type Mode = 'math' | 'physics';
type RailPanel = 'verification' | 'graph' | null;

type Suggestion = {
  action: string;
  label: string;
};

type Artifact = {
  id: string;
  build_version?: string;
  original_input: string;
  mode: Mode;
  normalized_payload?: {
    type: string | null;
    payload: string | null;
    variables?: string[];
    domain?: string | null;
    extraction_reason?: string | null;
  };
  problem_type?: string | null;
  variables?: string[];
  solution: {
    final_answer_latex: string;
    overview: string;
    sections: {
      title: string;
      summary_latex: string;
      explanation: string;
    }[];
  };
  verification: {
    badge: 'verified' | 'checked' | 'not_verified' | 'discrepancy_detected';
    certainty: 'confirmed' | 'high' | 'medium' | 'low' | 'none';
    reason_code: string | null;
    method: string | null;
    meta: Record<string, unknown> | null;
    user_reason: string;
  };
  suggestions: Suggestion[];
  audit?: {
    verdict: 'clear' | 'minor_flags' | 'major_flags' | null;
    flags: unknown[];
  };
  graph_spec?: {
    expressions: string[];
    sliders: unknown[];
    viewport: unknown | null;
  };
  cost_meta?: {
    llm_calls: number;
    advanced_verification_used: boolean;
    cas_used: boolean;
  };
};

const MATH_EXAMPLES = [
  'Solve 2x + 3 = 7',
  'Factor x^2 + 5x + 6',
  'Solve the system: x + y = 7 and x - y = 1',
];

const PHYSICS_EXAMPLES = [
  'A 2 kg block is pulled by a 10 N force. Find the acceleration.',
  'Find the final velocity after 5 s if a = 3 m/s^2 and u = 2 m/s',
  'A 5 kg object is lifted 3 m. Find the work done against gravity.',
];

function getBadgeLabel(badge: Artifact['verification']['badge']) {
  switch (badge) {
    case 'verified':
      return 'Verified';
    case 'checked':
      return 'Checked';
    case 'discrepancy_detected':
      return 'Possible discrepancy';
    case 'not_verified':
    default:
      return 'Not verified';
  }
}

function getBadgeClasses(badge: Artifact['verification']['badge']) {
  switch (badge) {
    case 'verified':
      return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
    case 'checked':
      return 'border-blue-500/30 bg-blue-500/10 text-blue-300';
    case 'discrepancy_detected':
      return 'border-amber-500/30 bg-amber-500/10 text-amber-300';
    case 'not_verified':
    default:
      return 'border-white/10 bg-white/[0.04] text-slate-300';
  }
}

function getCertaintyLabel(certainty: Artifact['verification']['certainty']) {
  switch (certainty) {
    case 'confirmed':
      return 'Confirmed';
    case 'high':
      return 'High';
    case 'medium':
      return 'Medium';
    case 'low':
      return 'Low';
    case 'none':
    default:
      return null;
  }
}

function formatMethodLabel(method: string | null) {
  if (!method) return 'Verification';

  return method
    .replace(/-/g, ' ')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatValue(value: unknown): string {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return String(value);
    if (Math.abs(value) >= 1000 || Math.abs(value) < 0.001) {
      return value.toExponential(2);
    }
    return Number(value.toFixed(6)).toString();
  }

  if (Array.isArray(value)) {
    return value.map(formatValue).join(', ');
  }

  if (typeof value === 'object' && value !== null) {
    try {
      return JSON.stringify(value);
    } catch {
      return '[object]';
    }
  }

  return String(value);
}

function getVerificationPreview(artifact: Artifact | null) {
  if (!artifact) return null;

  const { verification } = artifact;
  const meta = verification.meta || {};

  if (verification.badge === 'verified') {
    if (meta.type === 'equation-substitution') {
      return 'Substitution check completed successfully.';
    }

    if (meta.type === 'system-substitution') {
      const maxResidual = typeof meta.maxResidual === 'number' ? meta.maxResidual : null;
      if (maxResidual !== null) {
        return `System residual check passed (max residual ${formatValue(maxResidual)}).`;
      }
      return 'System substitution check passed.';
    }

    if (meta.type === 'inequality') {
      return 'Inside/outside test points matched the claimed solution region.';
    }

    if (meta.type === 'system') {
      return 'Reported values satisfy the equations numerically.';
    }

    return 'Checked independently against the original problem.';
  }

  if (verification.badge === 'checked') {
    return 'The system inspected the problem, but strong verification was limited.';
  }

  if (verification.badge === 'discrepancy_detected') {
    return 'The reported answer may conflict with the parsed problem.';
  }

  return 'Verification was unavailable for this input.';
}

function getVerificationDetails(artifact: Artifact | null) {
  if (!artifact) return [] as Array<{ label: string; value: string }>;

  const meta = artifact.verification.meta || {};
  const entries: Array<{ label: string; value: string }> = [];

  entries.push({ label: 'Method', value: formatMethodLabel(artifact.verification.method) });

  if (typeof meta.type === 'string') {
    entries.push({ label: 'Check type', value: formatMethodLabel(meta.type) });
  }

  if (typeof meta.maxResidual === 'number') {
    entries.push({ label: 'Max residual', value: formatValue(meta.maxResidual) });
  }

  if (Array.isArray(meta.residuals) && meta.residuals.length > 0) {
    entries.push({ label: 'Residuals', value: formatValue(meta.residuals) });
  }

  if (typeof meta.insideX === 'number') {
    entries.push({ label: 'Inside test point', value: formatValue(meta.insideX) });
  }

  if (typeof meta.outsideX === 'number') {
    entries.push({ label: 'Outside test point', value: formatValue(meta.outsideX) });
  }

  if (typeof meta.questionOp === 'string') {
    entries.push({ label: 'Problem operator', value: meta.questionOp });
  }

  if (typeof meta.answerOp === 'string') {
    entries.push({ label: 'Answer operator', value: meta.answerOp });
  }

  if (meta.scope) {
    entries.push({ label: 'Evaluated values', value: formatValue(meta.scope) });
  }

  return entries;
}

function getConceptText(section: Artifact['solution']['sections'][number]) {
  const title = section.title.toLowerCase();
  const explanation = section.explanation.toLowerCase();

  if (title.includes('isolate') || explanation.includes('isolate')) {
    return 'Underlying principle: preserve equality by doing the same operation to both sides. General rule: if a = b, then a + c = b + c and a - c = b - c.';
  }

  if (title.includes('solve') || explanation.includes('divide')) {
    return 'Underlying principle: once the variable term is isolated, invert the remaining operation. General rule: if ac = b and a ≠ 0, then c = b/a.';
  }

  if (title.includes('simplify') || explanation.includes('simplify')) {
    return 'Underlying principle: rewrite the expression into an equivalent but cleaner form. Simplification does not change the value; it only changes representation.';
  }

  if (title.includes('check') || explanation.includes('substitute')) {
    return 'Underlying principle: a candidate answer must satisfy the original problem when substituted back in. Verification tests consistency, not presentation.';
  }

  if (title.includes('set up') || explanation.includes('given equation')) {
    return 'Underlying principle: translate the problem into a clear mathematical relationship before manipulating it. Good setup reduces downstream error.';
  }

  return 'Underlying principle: each section applies a valid transformation that keeps the problem mathematically consistent while moving closer to the final result.';
}

export default function Home() {
  const [mode, setMode] = useState<Mode>('math');
  const [question, setQuestion] = useState('');
  const [artifact, setArtifact] = useState<Artifact | null>(null);
  const [loading, setLoading] = useState(false);
  const [openExplainIndex, setOpenExplainIndex] = useState<number | null>(null);
  const [studyMode, setStudyMode] = useState(false);
  const [openRailPanel, setOpenRailPanel] = useState<RailPanel>(null);
  const [exampleIndex, setExampleIndex] = useState(0);

  const examples = mode === 'math' ? MATH_EXAMPLES : PHYSICS_EXAMPLES;
  const verificationPreview = getVerificationPreview(artifact);
  const verificationDetails = getVerificationDetails(artifact);
  const certaintyLabel = artifact ? getCertaintyLabel(artifact.verification.certainty) : null;
      useEffect(() => {
      setExampleIndex(0);
    }, [mode]);

    useEffect(() => {
      const interval = setInterval(() => {
        setExampleIndex((i) => (i + 1) % examples.length);
      }, 2500);

      return () => clearInterval(interval);
    }, [examples]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setArtifact(null);
    setOpenExplainIndex(null);
    setOpenRailPanel(null);

    try {
      const res = await axios.post('http://localhost:5000/solve', {
        question,
        mode,
      });

      const returnedArtifact: Artifact | null = res.data.artifact || null;
      setArtifact(returnedArtifact);
    } catch (err) {
      console.error(err);
      setArtifact(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-[2200px] flex-col px-2 py-4 xl:px-3">
        <header className="mb-5 flex items-start justify-between border-b border-white/10 pb-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Engineering Solver</h1>
            <p className="mt-1 text-sm text-slate-400">
              Math & physics explanations, structured for engineers.
            </p>
            <p className="mt-2 text-xs text-slate-500">
              AI-generated solutions, independently verified when possible.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-sm text-slate-300 transition hover:bg-white/10"
              title="Menu"
            >
              ☰
            </button>

            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
              Prototype • Localhost
            </div>
          </div>
        </header>

        <div className="mb-5 flex items-end justify-between">
          <div className="flex items-center gap-5 border-b border-white/10">
            <button
              type="button"
              onClick={() => setMode('math')}
              className={`pb-2 text-sm font-medium transition-colors ${
                mode === 'math'
                  ? 'border-b-2 border-blue-500 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Math
            </button>

            <button
          type="button"
          onClick={() => setMode('physics')}
          className={`pb-2 text-sm font-medium transition-colors ${
            mode === 'physics'
              ? 'border-b-2 border-blue-500 text-white'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Physics
        </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-sm text-slate-300 transition hover:bg-white/10"
              title="History"
            >
              ⏱
            </button>

            <button
              type="button"
              onClick={() => setStudyMode((s) => !s)}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-white/10"
            >
              {studyMode ? 'Standard view' : 'Study mode'}
            </button>
          </div>
        </div>

        <div className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2.8fr)_300px] xl:grid-cols-[minmax(0,3fr)_320px]">
          <section className="min-h-[720px] rounded-[30px] border border-white/6 bg-white/[0.025] px-6 py-6 shadow-[0_0_0_1px_rgba(255,255,255,0.015)] lg:min-h-[820px]">
             {!artifact && !loading && (
              <div className="flex h-full min-h-[620px] items-center justify-center rounded-[24px] border border-white/6 bg-gradient-to-b from-white/[0.03] to-transparent px-6 text-center text-sm text-slate-500 lg:min-h-[700px]">
                <div className="max-w-[420px] -mt-10">
                  <div className="text-base font-medium text-slate-200">
                    Enter a problem to generate:
                  </div>

                  <div className="mt-4 inline-block space-y-1 text-left text-sm text-slate-400">
                    <div>• Structured solution</div>
                    <div>• Verified answer when possible</div>
                    <div>• Section-by-section breakdown</div>
                  </div>

                  <div className="mt-6 text-center text-xs text-slate-500">
                    Example: {examples[0]}
                  </div>
                </div>
              </div>
            )}

            {loading && (
              <div className="flex h-full min-h-[620px] items-start justify-center rounded-[24px] border border-dashed border-white/10 bg-white/[0.02] px-6 pt-24 text-center text-sm text-slate-500 lg:min-h-[700px]">
                Thinking through the problem...
              </div>
            )}

            {artifact && (
              <div className="flex flex-col">
                <div className="rounded-[24px] border border-blue-400/20 bg-gradient-to-br from-blue-500/10 via-slate-900/70 to-slate-900/70 px-6 py-5 shadow-[0_10px_40px_rgba(59,130,246,0.08)]">
                  <div className="min-w-0">
                    <div className="mb-2 text-xs uppercase tracking-[0.18em] text-blue-200/70">Final Answer</div>
                    <div className="text-lg sm:text-xl">
                      <BlockMath math={artifact.solution.final_answer_latex} />
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <div
                      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${getBadgeClasses(
                        artifact.verification.badge,
                      )}`}
                    >
                      <span>{getBadgeLabel(artifact.verification.badge)}</span>
                      {certaintyLabel && <span className="opacity-80">• {certaintyLabel}</span>}
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setOpenRailPanel((current) => (current === 'verification' ? null : 'verification'))
                      }
                      className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs text-slate-300 transition hover:bg-white/[0.08]"
                    >
                      {openRailPanel === 'verification' ? 'Hide verification details' : 'View verification details'}
                    </button>
                  </div>

                  {verificationPreview && (
                    <div className="mt-3 text-sm leading-6 text-slate-300">{verificationPreview}</div>
                  )}

                  {artifact.verification.user_reason && (
                    <div className="mt-3 text-xs leading-6 text-slate-400">
                      {artifact.verification.user_reason}
                    </div>
                  )}

                  {artifact.suggestions.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {artifact.suggestions.map((s, i) => (
                        <button
                          key={`${s.action}-${i}`}
                          type="button"
                          className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs text-slate-300 transition hover:bg-white/[0.08]"
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <FlowDivider />

                <div className="rounded-[22px] bg-white/[0.025] px-5 py-4">
                  <div className="mb-2 text-xs uppercase tracking-[0.16em] text-slate-500">Overview</div>
                  <p className="max-w-[850px] text-[15px] leading-8 text-slate-200">
                    {artifact.solution.overview}
                  </p>
                </div>

                <FlowDivider />

                {!studyMode && (
                  <div className="flex flex-col">
                    {artifact.solution.sections.map((sec, i) => {
                      const isOpen = openExplainIndex === i;

                      return (
                        <div key={i} className="relative">
                          <section className="rounded-[22px] px-4 py-4 transition">
                            <div className="mb-3 text-[17px] font-semibold tracking-tight text-white">
                              {sec.title}
                            </div>

                            <div className="mb-4 text-lg">
                              <BlockMath math={sec.summary_latex} />
                            </div>

                            <p className="max-w-[850px] text-[15px] leading-8 text-slate-200">
                              {sec.explanation}
                            </p>

                            <button
                              type="button"
                              onClick={() => setOpenExplainIndex(isOpen ? null : i)}
                              className="mt-4 text-xs font-medium text-blue-300 transition hover:text-blue-200"
                            >
                              {isOpen ? 'Hide underlying principle' : 'Why this works'}
                            </button>

                            {isOpen && (
                              <div className="mt-4 rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-4 text-sm leading-8 text-slate-300">
                                {getConceptText(sec)}
                              </div>
                            )}
                          </section>

                          {i < artifact.solution.sections.length - 1 && <FlowDivider />}
                        </div>
                      );
                    })}
                  </div>
                )}

                {studyMode && (
                  <div className="rounded-[24px] border border-blue-300/10 bg-gradient-to-b from-blue-500/[0.06] to-slate-900/40 px-5 py-5">
                    <div className="mb-4 text-xs uppercase tracking-[0.16em] text-blue-200/70">Study Flow</div>

                    <div className="space-y-6">
                      {artifact.solution.sections.map((sec, i) => (
                        <div key={i}>
                          <h3 className="mb-3 text-base font-semibold text-white">{sec.title}</h3>

                          <div className="mb-3 text-lg">
                            <BlockMath math={sec.summary_latex} />
                          </div>

                          <p className="max-w-[850px] text-[15px] leading-8 text-slate-200">
                            {sec.explanation}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          <aside className="flex flex-col gap-4">
            <div className="rounded-[26px] border border-white/6 bg-white/[0.025] px-3 py-3">
              <div className="flex flex-col gap-2">
                <UtilityAction
                  label="Graph"
                  hint="Open graph panel"
                  active={openRailPanel === 'graph'}
                  onClick={() => setOpenRailPanel((current) => (current === 'graph' ? null : 'graph'))}
                />

                {artifact && (
                  <UtilityAction
                    label="Verification"
                    hint="Open verification panel"
                    active={openRailPanel === 'verification'}
                    onClick={() =>
                      setOpenRailPanel((current) => (current === 'verification' ? null : 'verification'))
                    }
                  />
                )}
              </div>
            </div>

            <div className="rounded-[26px] border border-white/6 bg-white/[0.025] px-4 py-4">
              {!artifact && !loading && (
                <div>
                  <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-slate-500">Support Panel</div>
                  <div className="text-xs leading-6 text-slate-500">
                    Graphs, verification details, and result-side tools will appear here.
                  </div>
                </div>
              )}

              {artifact && openRailPanel === 'verification' && (
                <div>
                  <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-slate-500">Verification</div>
                  <div className="mb-3 text-sm font-medium text-white">{getBadgeLabel(artifact.verification.badge)}</div>
                  <div className="mb-4 text-xs leading-6 text-slate-400">{artifact.verification.user_reason}</div>

                  <div className="space-y-3">
                    {verificationDetails.length > 0 ? (
                      verificationDetails.map((detail) => (
                        <div key={detail.label} className="rounded-[18px] border border-white/8 bg-white/[0.03] px-3 py-3">
                          <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">
                            {detail.label}
                          </div>
                          <div className="mt-2 text-sm leading-6 text-slate-200">{detail.value}</div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-[18px] border border-white/8 bg-white/[0.03] px-3 py-3 text-sm leading-6 text-slate-300">
                        Detailed verification metadata is not available for this result yet.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {artifact && openRailPanel === 'graph' && (
                <div>
                  <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-slate-500">Graph</div>
                  <div className="mb-3 text-sm font-medium text-white">Graph panel</div>
                  <div className="rounded-[18px] border border-white/8 bg-white/[0.03] px-3 py-3 text-sm leading-6 text-slate-300">
                    Basic graph rendering will live here. Keep core graphing free; reserve richer graph interactions for a later premium layer.
                  </div>
                </div>
              )}

              {artifact && !openRailPanel && (
                <div>
                  <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-slate-500">Result Tools</div>
                  <div className="text-xs leading-6 text-slate-400">
                    Open verification for the proof trail or graph for visual support.
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>

        <div className="mt-4 rounded-[28px] border border-white/8 bg-white/[0.05] px-4 py-4 shadow-[0_-12px_40px_rgba(0,0,0,0.16)]">
          <div className="mb-3 flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium text-white">Question Input</div>
              <div className="mt-1 text-xs text-slate-400">
                Mode: {mode === 'math' ? 'Math (Algebra & Calculus)' : 'Physics (Engineering problems)'}
              </div>
            </div>

            <button
              type="submit"
              form="solver-form"
              disabled={loading || !question.trim()}
              className="rounded-full bg-blue-500 px-5 py-2 text-sm font-medium text-white shadow-[0_6px_24px_rgba(59,130,246,0.35)] transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Solving...' : 'Solve'}
            </button>
          </div>

          <form id="solver-form" onSubmit={handleSubmit} className="relative">
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={`e.g. ${examples[exampleIndex]}`}
              className="h-28 w-full rounded-[22px] border border-white/10 bg-slate-950/70 px-4 py-3 pr-14 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition focus:border-blue-400/40"
            />

            {mode === 'math' && (
              <button
                type="button"
                className="absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-sm text-slate-300 transition hover:bg-white/[0.08]"
                title="Open math keyboard"
              >
                ∑
              </button>
            )}
          </form>
        </div>
      </div>
    </main>
  );
}

function FlowDivider() {
  return (
    <div className="flex items-center gap-3 py-4">
      <div className="h-px flex-1 bg-white/10" />
      <div className="h-px w-12 bg-white/16" />
      <div className="h-px flex-1 bg-white/10" />
    </div>
  );
}

function UtilityAction({
  label,
  hint,
  active,
  onClick,
}: {
  label: string;
  hint: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-[18px] border px-3 py-3 text-left transition ${
        active
          ? 'border-blue-400/25 bg-blue-500/[0.08]'
          : 'border-white/8 bg-white/[0.03] hover:bg-white/[0.06]'
      }`}
    >
      <div className="text-sm font-medium text-white">{label}</div>
      <div className="mt-1 text-[11px] leading-5 text-slate-500">{hint}</div>
    </button>
  );
}
