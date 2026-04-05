'use client';

import 'katex/dist/katex.min.css';
import { BlockMath, InlineMath } from 'react-katex';
import axios from 'axios';
import { useState, FormEvent } from 'react';

type Mode = 'math' | 'physics';

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

function splitAnswerBodyAndFinal(answer: string | null | undefined) {
  if (!answer) {
    return {
      body: '',
      finalBlock: null as string | null,
    };
  }

  const regex = /\$\$([\s\S]*?)\$\$/g;
  const matches = [...answer.matchAll(regex)];

  if (matches.length === 0) {
    return {
      body: answer,
      finalBlock: null as string | null,
    };
  }

  const lastMatch = matches[matches.length - 1][0];
  const body = answer.replace(lastMatch, '').trimEnd();

  return {
    body,
    finalBlock: lastMatch,
  };
}


export default function Home() {
  const [mode, setMode] = useState<Mode>('math');
  const [question, setQuestion] = useState('');
  const [artifact, setArtifact] = useState<Artifact | null>(null);
  const [loading, setLoading] = useState(false);
  const [openExplainIndex, setOpenExplainIndex] = useState<number | null>(null);
  const [studyMode, setStudyMode] = useState(false);
  

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setArtifact(null);
    

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

      {/* Header */}
          <header className="mb-5 flex items-start justify-between border-b border-white/10 pb-4">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          Engineering Solver
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Math & physics explanations, structured for engineers.
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

      
      {/* Top controls */}
    <div className="mb-5 flex items-end justify-between">
      <div className="flex items-center gap-5 border-b border-white/10">
        <button
          type="button"
          onClick={() => setMode("math")}
          className={`pb-2 text-sm font-medium transition-colors ${
            mode === "math"
              ? "border-b-2 border-blue-500 text-white"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          Math
        </button>

        <button
          type="button"
          onClick={() => setMode("physics")}
          className={`pb-2 text-sm font-medium transition-colors ${
            mode === "physics"
              ? "border-b-2 border-blue-500 text-white"
              : "text-slate-400 hover:text-slate-200"
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
          {studyMode ? "Standard view" : "Study mode"}
        </button>
      </div>
    </div>

      {/* Main content area */}
      <div className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2.8fr)_300px] xl:grid-cols-[minmax(0,3fr)_320px]">

        {/* LEFT: solve flow */}
        <section className="rounded-[30px] border border-white/6 bg-white/[0.025] px-6 py-6 shadow-[0_0_0_1px_rgba(255,255,255,0.015)]">

          {!artifact && !loading && (
            <div className="flex h-full min-h-[420px] items-center justify-center rounded-[24px] border border-dashed border-white/10 bg-white/[0.02] text-sm text-slate-500">
              Solution will appear here.
            </div>
          )}

          {loading && (
            <div className="flex h-full min-h-[420px] items-center justify-center rounded-[24px] border border-white/8 bg-white/[0.02] text-sm italic text-slate-400">
              Thinking through the problem...
            </div>
          )}

          {artifact && (
            <div className="flex flex-col">

              {/* Primary final answer */}
              <div className="rounded-[24px] border border-blue-400/20 bg-gradient-to-br from-blue-500/10 via-slate-900/70 to-slate-900/70 px-6 py-5 shadow-[0_10px_40px_rgba(59,130,246,0.08)]">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="mb-2 text-xs uppercase tracking-[0.18em] text-blue-200/70">
                      Final Answer
                    </div>

                    <div className="text-lg sm:text-xl">
                      <BlockMath math={artifact.solution.final_answer_latex} />
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <div className="text-sm font-medium text-white">
                      {artifact.verification.badge}
                    </div>

                    <div className="mt-1 text-xs text-slate-400">
                      {artifact.verification.certainty}
                    </div>
                  </div>
                </div>

                {artifact.verification.user_reason && (
                  <div className="mt-4 text-xs leading-6 text-slate-400">
                    {artifact.verification.user_reason}
                  </div>
                )}

                {artifact.suggestions.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {artifact.suggestions.map((s, i) => (
                      <button
                        key={i}
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

              {/* Overview */}
              <div className="rounded-[22px] bg-white/[0.025] px-5 py-4">
                <div className="mb-2 text-xs uppercase tracking-[0.16em] text-slate-500">
                  Overview
                </div>
                <p className="max-w-[850px] text-[15px] leading-8 text-slate-200">
                  {artifact.solution.overview}
                </p>
              </div>

              <FlowDivider />

              {/* Sections */}
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
                            onClick={() =>
                              setOpenExplainIndex(isOpen ? null : i)
                            }
                            className="mt-4 text-xs font-medium text-blue-300 transition hover:text-blue-200"
                          >
                            Explain this step
                          </button>

                          {isOpen && (
                            <div className="mt-4 rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-4 text-sm leading-8 text-slate-300">
                              (Concept explanation placeholder)
                            </div>
                          )}
                        </section>

                        {i < artifact.solution.sections.length - 1 && <FlowDivider />}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Study mode */}
              {studyMode && (
                <div className="rounded-[24px] border border-blue-300/10 bg-gradient-to-b from-blue-500/[0.06] to-slate-900/40 px-5 py-5">
                  <div className="mb-4 text-xs uppercase tracking-[0.16em] text-blue-200/70">
                    Study Flow
                  </div>

                  <div className="space-y-6">
                    {artifact.solution.sections.map((sec, i) => (
                      <div key={i}>
                        <h3 className="mb-3 text-base font-semibold text-white">
                          {sec.title}
                        </h3>

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

        {/* RIGHT: support rail */}
                    <aside className="flex flex-col gap-4">
            <div className="rounded-[26px] border border-white/6 bg-white/[0.025] px-3 py-3">
              <div className="flex flex-col gap-2">
                <UtilityAction
                  label="Graph"
                  hint="Open graph panel"
                />
              </div>
            </div>

            <div className="rounded-[26px] border border-white/6 bg-white/[0.025] px-3 py-4">
              <div className="text-center">
                <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-slate-500">
                  Result
                </div>

                {artifact ? (
                  <div className="text-xs leading-5 text-slate-400">
                    Detailed verification available.
                  </div>
                ) : (
                  <div className="text-xs leading-5 text-slate-500">
                    Result state appears here.
                  </div>
                )}
              </div>
            </div>
          </aside> 
      </div>

      {/* Bottom input dock */}
      <div className="mt-4 rounded-[28px] border border-white/8 bg-white/[0.05] px-4 py-4 shadow-[0_-12px_40px_rgba(0,0,0,0.16)]">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-white">Question Input</div>
            <div className="mt-1 text-xs text-slate-400">
              Mode: {mode === "math" ? "Math (Algebra & Calculus)" : "Physics (Engineering problems)"}
            </div>
          </div>

          <button
            type="submit"
            form="solver-form"
            disabled={loading || !question.trim()}
            className="rounded-full bg-blue-500 px-5 py-2 text-sm font-medium text-white shadow-[0_6px_24px_rgba(59,130,246,0.35)] transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Solving..." : "Solve"}
          </button>
        </div>

        <form id="solver-form" onSubmit={handleSubmit} className="relative">
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={
              mode === "math"
                ? "e.g. Solve 5(2x - 3) - 4x + 7 = 3(x + 2) - 5 for x"
                : "e.g. A 2 kg block is pulled along a horizontal surface by a 10 N force at 30° above the horizontal. Find the acceleration."
            }
            className="h-28 w-full rounded-[22px] border border-white/10 bg-slate-950/70 px-4 py-3 pr-14 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition focus:border-blue-400/40"
          />

          {mode === "math" && (
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
      <div className="h-px flex-1 bg-white/6" />
      <div className="h-px w-12 bg-white/10" />
      <div className="h-px flex-1 bg-white/6" />
    </div>
  );
}

function UtilityAction({
  label,
  hint,
}: {
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      className="w-full rounded-[18px] border border-white/8 bg-white/[0.03] px-3 py-3 text-left transition hover:bg-white/[0.06]"
    >
      <div className="text-sm font-medium text-white">{label}</div>
      <div className="mt-1 text-[11px] leading-5 text-slate-500">
        {hint}
      </div>
    </button>
  );
}