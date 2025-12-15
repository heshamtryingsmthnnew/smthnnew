'use client';

import 'katex/dist/katex.min.css';
import { BlockMath, InlineMath } from 'react-katex';
import axios from 'axios';
import { useState, FormEvent } from 'react';

type Mode = 'math' | 'physics';
type DetailLevel = 'simple' | 'moderate' | 'detailed';
type VerificationStatus = 'validated' | 'unavailable';

function splitAnswerBodyAndFinal(answer: string | null | undefined) {
  if (!answer) {
    return {
      body: '',
      finalBlock: null as string | null,
    };
  }

  // Find all $$...$$ blocks in the answer
  const regex = /\$\$([\s\S]*?)\$\$/g;
  const matches = [...answer.matchAll(regex)];

  if (matches.length === 0) {
    return {
      body: answer,
      finalBlock: null as string | null,
    };
  }

  // The full match of the last $$...$$ block (including the $$ markers)
  const lastMatch = matches[matches.length - 1][0];

  // Remove only this last block from the body
  const body = answer.replace(lastMatch, '').trimEnd();

  return {
    body,
    finalBlock: lastMatch,
  };
}

export default function Home() {
  const [mode, setMode] = useState<Mode>('math');
  const [question, setQuestion] = useState('');
  const [detailLevel, setDetailLevel] = useState<DetailLevel>('simple');
  const [response, setResponse] = useState('');
  const [verificationStatus, setVerificationStatus] =
    useState<VerificationStatus>('unavailable');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setResponse('');
    setVerificationStatus('unavailable');

    try {
      const res = await axios.post('http://localhost:5000/solve', {
        question,
        detailLevel,
        mode,
      });

      setResponse(res.data.answer || '');
      if (res.data.verificationStatus === 'validated') {
        setVerificationStatus('validated');
      } else {
        setVerificationStatus('unavailable');
      }
    } catch (err) {
      console.error(err);
      setResponse('There was an error contacting the engine.');
      setVerificationStatus('unavailable');
    } finally {
      setLoading(false);
    }
  };

  const modeLabel =
    mode === 'math'
      ? 'Math (Algebra & Calculus)'
      : 'Physics (Engineering problems)';

  const { body: answerBody, finalBlock: finalAnswerBlock } =
    splitAnswerBodyAndFinal(response);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-5xl">
        {/* Header */}
        <header className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
              Engineering Solver
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Math & physics explanations, structured for engineers.
            </p>
          </div>

          <span className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300 bg-slate-900/60">
            Prototype • Localhost
          </span>
        </header>

        {/* Mode tabs */}
        <div className="mb-4 flex items-center border-b border-slate-800">
          <button
            type="button"
            onClick={() => setMode('math')}
            className={`px-4 py-2 text-sm font-medium border-b-2 ${
              mode === 'math'
                ? 'border-blue-500 text-slate-100'
                : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            Math
          </button>
          <button
            type="button"
            onClick={() => setMode('physics')}
            className={`px-4 py-2 text-sm font-medium border-b-2 ${
              mode === 'physics'
                ? 'border-blue-500 text-slate-100'
                : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            Physics
          </button>
        </div>

        {/* Workspace */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* INPUT PANEL */}
          <section className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 md:p-6 shadow-lg shadow-black/40">
            <h2 className="text-sm font-medium text-slate-300 mb-1">
              Problem Input
            </h2>
            <p className="text-[11px] text-slate-500 mb-3">
              Mode: <span className="text-slate-300">{modeLabel}</span>
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-2">
                  Paste a problem statement
                </label>
                <textarea
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder={
                    mode === 'math'
                      ? 'e.g. Solve 5(2x - 3) - 4x + 7 = 3(x + 2) - 5 for x'
                      : 'e.g. A 2 kg block is pulled along a horizontal surface by a 10 N force at 30° above the horizontal. Find the acceleration.'
                  }
                  className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/70 focus:border-blue-500/70 resize-none h-32"
                />
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-slate-400 mb-2">
                    Explanation depth
                  </label>
                  <select
                    value={detailLevel}
                    onChange={(e) =>
                      setDetailLevel(e.target.value as DetailLevel)
                    }
                    className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/70 focus:border-blue-500/70"
                  >
                    <option value="simple">
                      Simple (fast, minimal steps)
                    </option>
                    <option value="moderate">
                      Moderate (balanced explanation)
                    </option>
                    <option value="detailed">
                      Detailed (in-depth reasoning)
                    </option>
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={loading || !question.trim()}
                  className="mt-2 sm:mt-6 inline-flex items-center justify-center rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-medium text-white shadow-md shadow-blue-500/30 hover:bg-blue-400 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? 'Solving…' : 'Solve'}
                </button>
              </div>
            </form>
          </section>

          {/* OUTPUT PANEL */}
          <section className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 md:p-6 shadow-lg shadow-black/40 flex flex-col">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-medium text-slate-300">
                AI Explanation
              </h2>
              <span className="text-[10px] uppercase tracking-wide text-slate-500">
                {mode === 'math' ? 'Math' : 'Physics'} •{' '}
                {detailLevel === 'simple'
                  ? 'Simple'
                  : detailLevel === 'detailed'
                  ? 'Detailed'
                  : 'Moderate'}
              </span>
            </div>

            <div className="flex-1 rounded-xl border border-slate-800 bg-slate-950/60 p-3 md:p-4 text-sm overflow-auto">
              {loading && (
                <p className="text-slate-400 italic">
                  Thinking through the problem…
                </p>
              )}

              {!loading && !response && (
                <p className="text-slate-500">
                  The explanation will appear here. Enter a problem on the left
                  and hit <span className="font-medium text-slate-300">Solve</span>.
                </p>
              )}

              {!loading && response && (
                <div className="flex flex-col gap-3 text-sm">
                  {/* Explanation + steps */}
                  {answerBody &&
                    answerBody.split('\n').map((line, i) => {
                      const trimmed = line.trim();

                      // Block LaTeX: $$ ... $$
                      if (
                        trimmed.startsWith('$$') &&
                        trimmed.endsWith('$$') &&
                        trimmed.length > 4
                      ) {
                        const content = trimmed.slice(2, -2);
                        return <BlockMath key={i} math={content} />;
                      }

                      // Inline LaTeX: $ ... $
                      if (trimmed.includes('$')) {
                        const parts = trimmed.split('$');
                        return (
                          <p key={i} className="leading-relaxed">
                            {parts.map((part, idx) =>
                              idx % 2 === 1 ? (
                                <InlineMath key={idx} math={part} />
                              ) : (
                                part
                              )
                            )}
                          </p>
                        );
                      }

                      // Plain text fallback
                      return (
                        <p
                          key={i}
                          className="leading-relaxed whitespace-pre-wrap font-mono text-slate-200"
                        >
                          {line}
                        </p>
                      );
                    })}

                  {/* Final highlighted answer */}
                  {finalAnswerBlock && (
                    <div className="final-answer-box rounded-xl border border-emerald-400/60 bg-emerald-900/30 px-3 py-3 shadow-inner shadow-emerald-500/20">
                      <BlockMath
                        math={
                          finalAnswerBlock.trim().startsWith('$$') &&
                          finalAnswerBlock.trim().endsWith('$$')
                            ? finalAnswerBlock.trim().slice(2, -2)
                            : finalAnswerBlock.trim()
                        }
                      />
                    </div>
                  )}

                  {/* Verification badge */}
                  <div className="mt-4 pt-3 border-t border-slate-800">
                    {verificationStatus === 'validated' ? (
                      <span className="text-xs text-emerald-400">
                        ✓ Validated using independent algebra methods.
                      </span>
                    ) : (
                      <span className="text-xs text-slate-500">
                        ⚠ Validation unavailable for this problem.
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
