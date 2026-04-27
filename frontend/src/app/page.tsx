'use client';

import { BlockMath } from 'react-katex';
import axios from 'axios';
import { useEffect, useState, useRef, FormEvent, KeyboardEvent, ChangeEvent } from 'react';
import { DM_Serif_Display, JetBrains_Mono } from 'next/font/google';

const dmSerifDisplay = DM_Serif_Display({ subsets: ['latin'], weight: '400' });
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'] });

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
      concept: string;
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
  cas?: {
    verdict: 'confirmed' | 'discrepancy' | 'unavailable' | null;
    wolfram_result: string | null;
    expression_checked: string | null;
    used: boolean;
  };
  audit?: {
    verdict: 'consistent' | 'inconsistent' | null;
    audit_answer: string | null;
    method: string | null;
    confidence: string | null;
    note: string | null;
    dimensional: { units_present: boolean; units_consistent: boolean | null } | null;
    used: boolean;
  };
  graph?: {
    graphable: boolean;
    expression: string;
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
    audit_used: boolean;
  };
};

const MATH_EXAMPLES = [
  'x^2 + 5x + 6 = 0',
  '2x + y = 7 and x - y = 1',
  'integrate x^2 * sin(x) dx',
  'differentiate x^3 * ln(x)',
  'simplify sin^2(x) + cos^2(x)',
];

const PHYSICS_EXAMPLES = [
  'A 5 kg object is pushed with 20 N of force. Find acceleration.',
  'A ball launched at 30 m/s at 45 degrees. Find the range.',
  'Two resistors 4 ohms and 6 ohms in parallel. Find equivalent resistance.',
  'A 2 kg block slides down a 30 degree frictionless ramp. Find velocity at bottom.',
];

const KEYBOARD_ROWS = [
  ['x²', '√x', '∫', 'd/dx', 'π', '∞', '±', '×', '÷'],
  ['a/b', '(', ')', '≤', '≥', '≠', '|x|', 'log', 'ln'],
];

const SYMBOL_MAP: Record<string, string> = {
  'x²': '^2', '√x': 'sqrt()', '∫': 'int()', 'd/dx': 'd/dx(',
  'π': 'pi', '∞': 'inf', '±': '±', '×': '*', '÷': '/',
  'a/b': '/', '(': '(', ')': ')', '≤': '<=', '≥': '>=',
  '≠': '!=', '|x|': 'abs()', 'log': 'log()', 'ln': 'ln()',
};

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
      return 'border-white/20 bg-white/[0.06] text-zinc-300';
    case 'discrepancy_detected':
      return 'border-amber-500/30 bg-amber-500/10 text-amber-300';
    case 'not_verified':
    default:
      return 'border-white/10 bg-white/[0.04] text-zinc-300';
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


declare global {
  interface Window {
    Desmos?: {
      GraphingCalculator: (
        element: HTMLElement,
        options?: Record<string, unknown>
      ) => {
        setExpression: (opts: Record<string, unknown>) => void;
        destroy: () => void;
      };
    };
  }
}

export default function Home() {
  const [mode, setMode] = useState<Mode>('math');
  const [question, setQuestion] = useState('');
  const [ghostQuestion, setGhostQuestion] = useState('');
  const [artifact, setArtifact] = useState<Artifact | null>(null);
  const [loading, setLoading] = useState(false);
  const [openExplainIndex, setOpenExplainIndex] = useState<number | null>(null);
  const [showProofDetails, setShowProofDetails] = useState(false);
  const [exampleIndex, setExampleIndex] = useState(0);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [interactiveMode, setInteractiveMode] = useState(false);
  const [showFormatHint, setShowFormatHint] = useState(false);
  const [mathKeyboardFlash, setMathKeyboardFlash] = useState(false);
  const [mathKeyboardOpen, setMathKeyboardOpen] = useState(false);
  // Phase 5: replace with server-side counter tied to auth session
  const [advancedVerifUsed, setAdvancedVerifUsed] = useState(0);
  const ADVANCED_VERIF_FREE_LIMIT = 3;
  const [advancedVerifLoading, setAdvancedVerifLoading] = useState(false);
  const [advancedVerifResult, setAdvancedVerifResult] = useState<Artifact | null>(null);
  const [showAdvancedVerifGate, setShowAdvancedVerifGate] = useState(false);
  const [showGraph, setShowGraph] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mathKeyboardRef = useRef<HTMLButtonElement>(null);
  const composerRef = useRef<HTMLFormElement>(null);
  const desmosRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const calculatorRef = useRef<any>(null);

  const examples = mode === 'math' ? MATH_EXAMPLES : PHYSICS_EXAMPLES;
  const verificationDetails = getVerificationDetails(artifact);
  const certaintyLabel = artifact ? getCertaintyLabel(artifact.verification.certainty) : null;
  const isActive = loading || !!artifact;

  useEffect(() => {
    setExampleIndex(0);
  }, [mode]);

  useEffect(() => {
    const interval = setInterval(() => {
      setExampleIndex((i) => (i + 1) % examples.length);
    }, 2500);
    return () => clearInterval(interval);
  }, [examples]);

  // Initialize Desmos calculator when modal opens — inject script then poll until ready
  useEffect(() => {
    if (!showGraph) return;

    // Inject script once if not already present
    if (!document.getElementById('desmos-script')) {
      const s = document.createElement('script');
      s.id = 'desmos-script';
      s.src = `https://www.desmos.com/api/v1.8/calculator.js?apiKey=${process.env.NEXT_PUBLIC_DESMOS_API_KEY}`;
      document.head.appendChild(s);
    }

    const expression = artifact?.graph?.expression || '';
    let timerId: ReturnType<typeof setTimeout>;
    let attempts = 0;

    const tryInit = () => {
      if (!desmosRef.current || !window.Desmos) {
        if (attempts++ < 80) timerId = setTimeout(tryInit, 100);
        return;
      }
      if (calculatorRef.current) {
        calculatorRef.current.destroy();
        calculatorRef.current = null;
      }
      calculatorRef.current = window.Desmos.GraphingCalculator(desmosRef.current, {
        expressions: false,
        keypad: false,
        settingsMenu: false,
        zoomButtons: true,
        lockViewport: false,
      });
      if (expression) {
        // Small delay ensures Desmos internal state is ready before setting the expression
        setTimeout(() => {
          if (calculatorRef.current) {
            calculatorRef.current.setExpression({ id: 'graph1', latex: expression });
          }
        }, 100);
      }
    };

    timerId = setTimeout(tryInit, 50);

    return () => {
      clearTimeout(timerId);
      if (calculatorRef.current) {
        calculatorRef.current.destroy();
        calculatorRef.current = null;
      }
    };
  }, [showGraph, artifact?.graph?.expression]);

  const doSolve = async () => {
    if (loading || !question.trim()) return;
    setLoading(true);
    setArtifact(null);
    setGhostQuestion('');
    setOpenExplainIndex(null);
    setShowProofDetails(false);
    setAdvancedVerifResult(null);
    setShowAdvancedVerifGate(false);
    setShowFormatHint(false);
    setShowGraph(false);
    // advancedVerifUsed intentionally not reset — persists across solves

    try {
      const res = await axios.post('http://localhost:5000/solve', {
        question,
        mode,
      });
      setArtifact(res.data.artifact || null);
    } catch (err) {
      console.error(err);
      setArtifact(null);
    } finally {
      setGhostQuestion(question);
      setQuestion('');
      setLoading(false);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    doSolve();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      doSolve();
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setAttachedFile(file);
    e.target.value = '';
  };

  const scrollToComposer = () => {
    composerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    setTimeout(() => textareaRef.current?.focus(), 400);
  };

  const insertSymbol = (symbol: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart ?? question.length;
    const end = ta.selectionEnd ?? question.length;
    const value = SYMBOL_MAP[symbol] ?? symbol;
    const newQ = question.slice(0, start) + value + question.slice(end);
    setQuestion(newQ);
    setTimeout(() => {
      ta.focus();
      const newPos = start + value.length;
      ta.setSelectionRange(newPos, newPos);
    }, 0);
  };

  const runAdvancedVerification = async () => {
    if (!artifact || loading) return;
    setAdvancedVerifLoading(true);
    try {
      const res = await axios.post('http://localhost:5000/solve', {
        question: artifact.original_input,
        mode: artifact.mode,
        advanced: true,
      });
      setAdvancedVerifResult(res.data.artifact || null);
    } catch (err) {
      console.error('[Advanced Verification]', err);
    } finally {
      setAdvancedVerifLoading(false);
    }
  };

  const handleAdvancedVerification = () => {
    if (advancedVerifUsed >= ADVANCED_VERIF_FREE_LIMIT) {
      setShowAdvancedVerifGate(true);
    } else {
      setAdvancedVerifUsed((prev) => prev + 1);
      runAdvancedVerification();
    }
  };

  const handleSuggestion = (action: string) => {
    switch (action) {
      case 'OPEN_MATH_KEYBOARD':
        setMathKeyboardOpen(true);
        scrollToComposer();
        setMathKeyboardFlash(true);
        setTimeout(() => setMathKeyboardFlash(false), 600);
        break;
      case 'SHOW_FORMAT_EXAMPLE':
        setShowFormatHint(true);
        scrollToComposer();
        break;
      case 'RUN_ADVANCED_VERIFICATION':
        handleAdvancedVerification();
        break;
      case 'SIMPLIFY_WORDING':
        scrollToComposer();
        break;
    }
  };

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <style>{`
        @keyframes kbFadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Slogan — fixed, visible in idle state only */}
      <div
        className={`pointer-events-none fixed left-1/2 z-10 -translate-x-1/2 -translate-y-1/2 text-center transition-opacity duration-[380ms] ease-out ${isActive ? 'opacity-0' : 'opacity-100'}`}
        style={{ top: '42vh' }}
      >
        <p className={`${dmSerifDisplay.className} text-2xl text-zinc-300`}>
          The answer, and the proof.
        </p>
      </div>

      {/* Scrollable content — bottom padding clears fixed input bar */}
      <div className="relative z-10 px-6 pt-4 pb-[220px]">

        {/* Header */}
        <header className="relative z-20 mb-6 flex items-center justify-between border-b border-white/[0.06] bg-zinc-950 pb-4">
          <button
            type="button"
            onClick={() => {
              setArtifact(null);
              setQuestion('');
              setGhostQuestion('');
              setOpenExplainIndex(null);
              setShowProofDetails(false);
              setAdvancedVerifResult(null);
              setShowAdvancedVerifGate(false);
              setShowFormatHint(false);
              setMathKeyboardOpen(false);
              setShowGraph(false);
            }}
            className="cursor-pointer"
          >
            <span className={`${dmSerifDisplay.className} text-3xl tracking-tight text-white`}>Ergo.</span>
          </button>

          <div className="flex items-center gap-2">
            {/* Profile */}
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.10] bg-white/[0.08]"
              title="Profile"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </button>

            {/* Settings */}
            <button type="button" className="p-1 text-zinc-400 transition hover:text-white" title="Settings">
              <svg width="16" height="12" viewBox="0 0 16 12" fill="none">
                <line x1="0" y1="1" x2="16" y2="1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <line x1="0" y1="6" x2="16" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <line x1="0" y1="11" x2="16" y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        </header>

        {/* Dot pattern — content area only, below header */}
        <div
          aria-hidden="true"
          className={`pointer-events-none fixed bottom-0 left-0 right-0 transition-opacity duration-[380ms] ease-out ${isActive ? 'opacity-0' : 'opacity-100'}`}
          style={{
            top: 0,
            zIndex: 5,
            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.08) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
            maskImage: 'radial-gradient(ellipse 700px 500px at 50% 62%, transparent 25%, black 100%)',
            WebkitMaskImage: 'radial-gradient(ellipse 700px 500px at 50% 62%, transparent 25%, black 100%)',
          }}
        />

        {/* Solve Surface */}
        <section className="px-2 py-2">

          {/* Workspace controls — always visible */}
          <div className="mb-4 flex items-center justify-between">
            <button
              type="button"
              className="flex h-7 w-7 items-center justify-center text-zinc-500 transition hover:text-zinc-300"
              title="History"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </button>

          </div>

          {loading && (
            <div className="flex min-h-[300px] items-start justify-center px-6 pt-24 text-center text-sm text-zinc-500">
              Thinking through the problem...
            </div>
          )}

          {artifact && (
            <div className="flex flex-col">

              {/* Final Answer block */}
              <div className="rounded-[24px] border border-white/[0.08] bg-white/[0.04] px-6 py-5">
                <div className="mb-2 text-xs uppercase tracking-[0.18em] text-zinc-500">Final Answer</div>

                <div className="my-4 flex justify-center [&_.katex]:text-[1.4em]">
                  <BlockMath math={artifact.solution.final_answer_latex} />
                </div>

                {/* Badge */}
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <div
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${getBadgeClasses(artifact.verification.badge)}`}
                  >
                    <span>{getBadgeLabel(artifact.verification.badge)}</span>
                    {certaintyLabel && artifact.verification.badge !== 'checked' && (
                      <span className="opacity-80">• {certaintyLabel}</span>
                    )}
                  </div>
                </div>

                {/* One-line verification summary */}
                {artifact.verification.user_reason && (
                  <div className="mt-3 text-sm leading-6 text-zinc-300">
                    {artifact.verification.user_reason}
                  </div>
                )}

                {/* Action cluster */}
                <div className="mt-4 flex items-center gap-3 text-xs text-zinc-600">
                  <button
                    type="button"
                    onClick={() => setShowProofDetails((v) => !v)}
                    className="transition hover:text-zinc-300"
                  >
                    {showProofDetails ? 'Hide proof' : 'Proof details'}
                  </button>
                  <span className="text-zinc-800">|</span>
                  <button
                    type="button"
                    onClick={handleAdvancedVerification}
                    disabled={advancedVerifLoading}
                    className="transition hover:text-zinc-300 disabled:opacity-50"
                  >
                    {advancedVerifLoading ? 'Checking...' : artifact.mode === 'physics' ? 'Cross-method audit' : 'Advanced verification'}
                  </button>
                  {artifact.graph?.graphable && (
                    <>
                      <span className="text-zinc-800">|</span>
                      <button
                        type="button"
                        onClick={() => setShowGraph(true)}
                        className="transition hover:text-zinc-300"
                      >
                        View graph
                      </button>
                    </>
                  )}
                </div>

                {/* Advanced verification result */}
                {advancedVerifResult && !advancedVerifLoading && (
                  <div className="mt-4 rounded-[16px] border border-white/[0.08] bg-white/[0.03] px-4 py-3">
                    {/* Math: Wolfram CAS verdict */}
                    {artifact.mode === 'math' && advancedVerifResult.cas?.used && (
                      <>
                        <div className="mb-2 text-[10px] uppercase tracking-[0.16em] text-zinc-500">Advanced check</div>
                        {advancedVerifResult.cas.verdict === 'confirmed' && (
                          <div className="text-xs text-emerald-400">Confirmed by Wolfram Alpha</div>
                        )}
                        {advancedVerifResult.cas.verdict === 'discrepancy' && (
                          <div>
                            <div className="text-xs text-amber-400">Wolfram Alpha returned a different result</div>
                            {advancedVerifResult.cas.wolfram_result && (
                              <div className={`${jetbrainsMono.className} mt-2 text-xs text-zinc-300`}>
                                {advancedVerifResult.cas.wolfram_result}
                              </div>
                            )}
                          </div>
                        )}
                        {advancedVerifResult.cas.verdict === 'unavailable' && (
                          <div className="text-xs text-zinc-400">Wolfram Alpha could not evaluate this expression</div>
                        )}
                      </>
                    )}
                    {/* Physics: AI audit verdict */}
                    {artifact.mode === 'physics' && advancedVerifResult.audit?.used && (
                      <>
                        <div className="mb-2 text-[10px] uppercase tracking-[0.16em] text-zinc-500">Audit</div>
                        {advancedVerifResult.audit.verdict === 'consistent' && (
                          <div>
                            <div className="text-xs text-zinc-300">Alternative method consistent</div>
                            {advancedVerifResult.audit.method && (
                              <div className="mt-1 text-xs text-zinc-500">{advancedVerifResult.audit.method}</div>
                            )}
                          </div>
                        )}
                        {advancedVerifResult.audit.verdict === 'inconsistent' && (
                          <div>
                            <div className="text-xs text-amber-400">Alternative method returned a different result</div>
                            {advancedVerifResult.audit.audit_answer && (
                              <div className={`${jetbrainsMono.className} mt-2 text-xs text-zinc-300`}>
                                {advancedVerifResult.audit.audit_answer}
                              </div>
                            )}
                          </div>
                        )}
                        {advancedVerifResult.audit.dimensional && (
                          <div className="mt-2 text-xs">
                            {!advancedVerifResult.audit.dimensional.units_present && (
                              <span className="text-zinc-500">Units not detected in answer</span>
                            )}
                            {advancedVerifResult.audit.dimensional.units_present && advancedVerifResult.audit.dimensional.units_consistent === false && (
                              <span className="text-amber-400">Unit inconsistency detected</span>
                            )}
                          </div>
                        )}
                      </>
                    )}
                    <div className="mt-2 text-xs text-zinc-600">
                      Uses remaining: {Math.max(0, ADVANCED_VERIF_FREE_LIMIT - advancedVerifUsed)} of {ADVANCED_VERIF_FREE_LIMIT}
                    </div>
                  </div>
                )}

                {/* Pro upsell gate */}
                {showAdvancedVerifGate && (
                  <div className="mt-4 rounded-[20px] border border-white/[0.1] bg-zinc-900 px-5 py-5">
                    <div className="text-sm font-medium text-white">Advanced verification</div>
                    <p className="mt-2 text-sm text-zinc-400">
                      You&apos;ve used your {ADVANCED_VERIF_FREE_LIMIT} free checks this month.
                    </p>
                    <p className="mt-1 text-sm text-zinc-400">
                      Pro includes unlimited advanced verification, CAS-powered checks, and full solve history.
                    </p>
                    <div className="mt-4 flex items-center gap-3">
                      {/* Phase 5: replace with Stripe checkout URL */}
                      <a
                        href="#"
                        className="rounded-full bg-emerald-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-emerald-500"
                      >
                        Upgrade to Pro — $12/month
                      </a>
                      <button
                        type="button"
                        onClick={() => setShowAdvancedVerifGate(false)}
                        className="text-sm text-zinc-500 transition hover:text-zinc-300"
                      >
                        Maybe later
                      </button>
                    </div>
                  </div>
                )}

                {/* Suggestions — contextual, failure/parser states only */}
                {artifact.suggestions.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {artifact.suggestions.map((s, i) => (
                      <button
                        key={`${s.action}-${i}`}
                        type="button"
                        onClick={() => handleSuggestion(s.action)}
                        className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs text-zinc-300 transition hover:bg-white/[0.08]"
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                )}

                {/* Proof details panel (inline; Phase 2 converts to drawer) */}
                {showProofDetails && (
                  <div className="mt-5 rounded-[20px] border border-white/8 bg-white/[0.03] px-5 py-4">
                    <div className="mb-3 text-[10px] uppercase tracking-[0.16em] text-zinc-500">Proof Details</div>

                    <div className="space-y-3">
                      {verificationDetails.length > 0 ? (
                        verificationDetails.map((detail) => (
                          <div key={detail.label} className="rounded-[14px] border border-white/8 bg-white/[0.03] px-3 py-3">
                            <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                              {detail.label}
                            </div>
                            <div className={`${jetbrainsMono.className} mt-1 text-sm leading-6 text-zinc-200`}>{detail.value}</div>
                          </div>
                        ))
                      ) : (
                        <div className="text-sm leading-6 text-zinc-400">
                          Detailed verification metadata is not available for this result.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <FlowDivider />

              {/* Overview */}
              <div className="rounded-[22px] bg-white/[0.04] px-5 py-4">
                <div className="mb-2 text-xs uppercase tracking-[0.16em] text-zinc-500">Overview</div>
                <p className="max-w-[850px] text-[15px] leading-8 text-zinc-200">
                  {artifact.solution.overview}
                </p>
              </div>

              <FlowDivider />

              {/* Solution sections */}
              <div className="flex flex-col">
                {artifact.solution.sections.map((sec, i) => {
                  const isOpen = openExplainIndex === i;

                  return (
                    <div key={i} className="relative">
                      <section className={`rounded-[22px] px-4 py-4 pb-2 transition ${interactiveMode ? 'border-l-2 border-white/[0.15] pl-5' : ''}`}>
                        <div className="mb-3 text-[13px] font-medium uppercase tracking-[0.12em] text-zinc-400">
                          {sec.title}
                        </div>

                        <div className="my-3 flex justify-start overflow-x-auto">
                          <div className="[&_.katex]:text-[1.1em]">
                            <BlockMath math={sec.summary_latex} />
                          </div>
                        </div>

                        <p className="max-w-[850px] text-[14px] leading-7 text-zinc-300">
                          {sec.explanation}
                        </p>

                        <button
                          type="button"
                          onClick={() => setOpenExplainIndex(isOpen ? null : i)}
                          className={`mt-3 text-xs font-medium transition ${isOpen ? 'text-zinc-300' : 'text-zinc-500 hover:text-zinc-300'}`}
                        >
                          {isOpen ? 'Hide underlying principle' : 'Why this works'}
                        </button>

                        {isOpen && (
                          <div className="mt-3 rounded-r-[14px] border-l border-white/[0.08] bg-white/[0.02] py-3 pl-4 pr-4 text-sm leading-7 text-zinc-400">
                            {sec.concept || 'No concept explanation available for this step.'}
                          </div>
                        )}
                      </section>

                      {i < artifact.solution.sections.length - 1 && <FlowDivider />}
                    </div>
                  );
                })}
              </div>

            </div>
          )}

        </section>
      </div>

      {/* Floating Input Composer — animates position/width on submit */}
      <div
        className="fixed z-50"
        style={{
          left: '50%',
          transform: 'translateX(-50%)',
          bottom: isActive ? 0 : '32vh',
          width: isActive ? '100%' : '700px',
          maxWidth: '100%',
          paddingLeft: isActive ? '1.5rem' : 0,
          paddingRight: isActive ? '1.5rem' : 0,
          paddingTop: isActive ? '2.5rem' : 0,
          paddingBottom: isActive ? '1.25rem' : 0,
          background: isActive
            ? 'linear-gradient(to top, #09090b 55%, transparent)'
            : 'transparent',
          transition: 'all 380ms ease-out',
        }}
      >
        {/* Keyboard + format hint — absolute, stacked above the composer box */}
        {(mathKeyboardOpen || (showFormatHint && isActive)) && (
          <div className="absolute bottom-full left-0 right-0 mb-2 flex flex-col gap-2">
            {mathKeyboardOpen && (
              <div className="rounded-[18px] border border-white/[0.08] bg-zinc-900 px-4 py-3" style={{ animation: 'kbFadeIn 200ms ease-out' }}>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-widest text-zinc-500">Symbols</span>
                  <button type="button" onClick={() => setMathKeyboardOpen(false)} className="text-zinc-500 transition hover:text-zinc-300">×</button>
                </div>
                {KEYBOARD_ROWS.map((row, ri) => (
                  <div key={ri} className={`flex flex-wrap gap-1${ri > 0 ? ' mt-1' : ''}`}>
                    {row.map((sym) => (
                      <button
                        key={sym}
                        type="button"
                        onClick={() => insertSymbol(sym)}
                        className={`rounded-[10px] px-3 py-2 font-mono text-sm transition hover:bg-white/[0.06] hover:text-white ${jetbrainsMono.className} text-zinc-300`}
                      >
                        {sym}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}

            {showFormatHint && isActive && (
              <div className="rounded-[18px] border border-white/[0.08] bg-zinc-900 px-4 py-3" style={{ animation: 'kbFadeIn 200ms ease-out' }}>
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Formatting guide</span>
                  <button type="button" onClick={() => setShowFormatHint(false)} className="text-zinc-500 transition hover:text-zinc-300">×</button>
                </div>
                {mode === 'math' ? (
                  <div className="space-y-2 text-xs">
                    <div className="flex gap-3">
                      <span className={`${jetbrainsMono.className} text-zinc-500`}>x squared plus 5x plus 6 equals 0</span>
                      <span className="text-zinc-600">→</span>
                      <span className={`${jetbrainsMono.className} text-zinc-200`}>x^2 + 5x + 6 = 0</span>
                    </div>
                    <div className="flex gap-3">
                      <span className={`${jetbrainsMono.className} text-zinc-500`}>the integral of x squared</span>
                      <span className="text-zinc-600">→</span>
                      <span className={`${jetbrainsMono.className} text-zinc-200`}>integrate x^2 dx</span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2 text-xs">
                    <div className="flex gap-3">
                      <span className={`${jetbrainsMono.className} text-zinc-500`}>find how fast the ball is going</span>
                      <span className="text-zinc-600">→</span>
                      <span className={`${jetbrainsMono.className} text-zinc-200`}>A 2 kg ball dropped from 10 m. Find velocity at impact.</span>
                    </div>
                    <p className="mt-2 text-zinc-500">Include: known values with units, what you&apos;re solving for.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Left: Mode tabs / Right: Interactive bookmark — both relative to composer */}
        <div className="relative mb-0">
          {/* Mode tabs — z-20, sit on top */}
          <div className="relative z-20 mb-3 flex items-center gap-5 pl-4">
            <button
              type="button"
              onClick={() => setMode('math')}
              disabled={loading}
              className={`pb-1 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                mode === 'math'
                  ? 'border-b-2 border-white text-white'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              Math
            </button>

            <button
              type="button"
              onClick={() => setMode('physics')}
              disabled={loading}
              className={`pb-1 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                mode === 'physics'
                  ? 'border-b-2 border-white text-white'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              Physics
            </button>
          </div>

          {/* Interactive tab — top-right, overlaps input top edge */}
          <button
            type="button"
            onClick={() => setInteractiveMode((v) => !v)}
            disabled={loading}
            className="absolute right-6 cursor-pointer rounded-t-md border border-b-0 px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              top: 0,
              transform: 'translateY(40%)',
              zIndex: interactiveMode ? 25 : 22,
              background: interactiveMode ? '#3f3f46' : '#27272a',
              borderColor: interactiveMode ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.08)',
              boxShadow: interactiveMode ? 'none' : '0 -2px 8px rgba(0,0,0,0.5)',
              color: interactiveMode ? '#fff' : '#71717a',
              transition: 'all 150ms ease-out',
            }}
          >
            <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-widest">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{
                  background: interactiveMode ? '#fff' : '#52525b',
                  transition: 'background-color 150ms ease-out',
                }}
              />
              Interactive
            </span>
          </button>
        </div>

        {/* Composer */}
        <form id="solver-form" onSubmit={handleSubmit} ref={composerRef}>
          <div
            className="relative z-10 rounded-[26px] border bg-zinc-900 shadow-[0_8px_40px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.04)] backdrop-blur-xl"
            style={{
              borderColor: interactiveMode ? 'rgba(255,255,255,0.20)' : 'rgba(255,255,255,0.10)',
              transition: 'border-color 150ms ease-out',
            }}
          >

            {/* Attachment preview */}
            {attachedFile && (
              <div className="flex items-center gap-2 px-5 pt-3">
                <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs text-zinc-300">
                  <span>{attachedFile.name}</span>
                  <button
                    type="button"
                    onClick={() => setAttachedFile(null)}
                    className="ml-1 text-zinc-500 hover:text-zinc-200"
                  >
                    ×
                  </button>
                </div>
              </div>
            )}

            {/* Textarea */}
            <textarea
              ref={textareaRef}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
              placeholder={ghostQuestion || examples[exampleIndex]}
              rows={3}
              className="block w-full resize-none bg-transparent px-5 pb-2 pt-4 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none disabled:cursor-not-allowed disabled:opacity-50"
            />

            {/* Toolbar row */}
            <div className="flex items-center justify-between px-3 pb-3">
              {/* Left: attachment + math keyboard + interactive indicator */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-200"
                  title="Attach image"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
                  </svg>
                </button>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />

                {mode === 'math' && (
                  <button
                    ref={mathKeyboardRef}
                    type="button"
                    onClick={() => setMathKeyboardOpen((v) => !v)}
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-sm transition ${
                      mathKeyboardOpen
                        ? 'bg-white/[0.10] text-white'
                        : mathKeyboardFlash
                          ? 'bg-white/[0.12] text-white'
                          : 'text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200'
                    }`}
                    title="Open math keyboard"
                  >
                    ∑
                  </button>
                )}
              </div>

              {/* Interactive mode pill */}
              {interactiveMode && (
                <span className="ml-1 rounded-full border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-[10px] text-zinc-500">
                  Interactive
                </span>
              )}

              {/* Right: Solve */}
              <button
                type="submit"
                disabled={loading || !question.trim()}
                className="flex items-center justify-center gap-2 rounded-full bg-white px-5 py-1.5 text-sm font-medium text-zinc-950 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? (
                  'Solving...'
                ) : (
                  <>
                    <span>Solve</span>
                    <span className="leading-none">→</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
      {/* Graph modal */}
      {showGraph && artifact?.graph?.graphable && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/90 backdrop-blur-sm"
          onClick={() => setShowGraph(false)}
        >
          <div
            className="relative mx-4 w-full max-w-2xl rounded-[24px] border border-white/[0.08] bg-zinc-950 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Graph</span>
              <button
                type="button"
                onClick={() => setShowGraph(false)}
                className="text-zinc-500 transition hover:text-zinc-300"
              >
                ×
              </button>
            </div>

            <div ref={desmosRef} className="h-[480px] w-full overflow-hidden rounded-[16px]" />

            <div className="mt-3 flex justify-end">
              <a
                href="https://www.desmos.com/calculator"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-zinc-600 transition hover:text-zinc-400"
              >
                Open in Desmos ↗
              </a>
            </div>
          </div>
        </div>
      )}
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
