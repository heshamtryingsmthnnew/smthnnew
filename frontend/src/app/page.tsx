'use client';

import { BlockMath } from 'react-katex';
import axios from 'axios';
import { useEffect, useState, useRef, useCallback, FormEvent, KeyboardEvent, ChangeEvent } from 'react';
import { DM_Serif_Display, JetBrains_Mono } from 'next/font/google';
import { motion, AnimatePresence } from 'framer-motion';

const dmSerifDisplay = DM_Serif_Display({ subsets: ['latin'], weight: '400' });
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'] });

type Mode = 'math' | 'physics';
type SolveStage = 'idle' | 'parsing' | 'generating' | 'verifying' | 'building' | 'complete';

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
  // Auto-fire: first solve per page session triggers advanced verification automatically.
  // Phase 5 replaces this with server-side per-user monthly limits.
  const [hasSeenAdvancedVerification, setHasSeenAdvancedVerification] = useState(false);
  const [advancedVerifLoading, setAdvancedVerifLoading] = useState(false);
  const [advancedVerifResult, setAdvancedVerifResult] = useState<Artifact | null>(null);
  const [showAdvancedVerifGate, setShowAdvancedVerifGate] = useState(false);
  const [graphOpen, setGraphOpen] = useState(false);
  const [solveStage, setSolveStage] = useState<SolveStage>('idle');
  const solveStageRef = useRef<SolveStage>('idle');
  const solveTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
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

  const handleReset = useCallback(() => {
    solveTimersRef.current.forEach(clearTimeout);
    solveTimersRef.current = [];
    setSolveStage('idle');
    solveStageRef.current = 'idle';
    setArtifact(null);
    setQuestion('');
    setGhostQuestion('');
    setOpenExplainIndex(null);
    setShowProofDetails(false);
    setAdvancedVerifResult(null);
    setShowAdvancedVerifGate(false);
    setShowFormatHint(false);
    setMathKeyboardOpen(false);
    setGraphOpen(false);
  }, []);

  useEffect(() => {
    setExampleIndex(0);
  }, [mode]);

  useEffect(() => {
    const interval = setInterval(() => {
      setExampleIndex((i) => (i + 1) % examples.length);
    }, 2500);
    return () => clearInterval(interval);
  }, [examples]);

  // Initialize Desmos calculator when popover opens — inject script then poll until ready
  useEffect(() => {
    if (!graphOpen) return;

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
  }, [graphOpen, artifact?.graph?.expression]);

  const doSolve = async () => {
    if (loading || !question.trim()) return;

    // Auto-fire advanced verification on the first solve of this page session.
    // Does NOT count toward the manual-use limit (advancedVerifUsed unchanged).
    const shouldAutoFire = !hasSeenAdvancedVerification;

    // Clear any in-flight stage timers from a previous solve
    solveTimersRef.current.forEach(clearTimeout);
    solveTimersRef.current = [];

    setLoading(true);
    setArtifact(null);
    setGhostQuestion('');
    setOpenExplainIndex(null);
    setShowProofDetails(false);
    setAdvancedVerifResult(null);
    setShowAdvancedVerifGate(false);
    setShowFormatHint(false);
    setGraphOpen(false);
    // advancedVerifUsed intentionally not reset — persists across solves

    // Start progress stages
    const setStage = (s: SolveStage) => { setSolveStage(s); solveStageRef.current = s; };
    setStage('parsing');
    solveTimersRef.current.push(setTimeout(() => setStage('generating'), 600));
    solveTimersRef.current.push(setTimeout(() => setStage('verifying'), 2400));
    solveTimersRef.current.push(setTimeout(() => setStage('building'), 3600));

    try {
      const res = await axios.post('http://localhost:5000/solve', { question, mode, advanced: shouldAutoFire });

      // Clear scheduled stage timers
      solveTimersRef.current.forEach(clearTimeout);
      solveTimersRef.current = [];

      // Snap through any remaining stages at 100ms intervals then fade
      const STAGE_ORDER: SolveStage[] = ['parsing', 'generating', 'verifying', 'building'];
      const currentIdx = STAGE_ORDER.indexOf(solveStageRef.current as SolveStage);
      let delay = 0;
      for (let i = currentIdx + 1; i < STAGE_ORDER.length; i++) {
        delay += 100;
        const s = STAGE_ORDER[i];
        solveTimersRef.current.push(setTimeout(() => setStage(s), delay));
      }
      delay += 100;
      solveTimersRef.current.push(setTimeout(() => setStage('complete'), delay));
      solveTimersRef.current.push(setTimeout(() => setStage('idle'), delay + 300));

      setArtifact(res.data.artifact || null);
      if (shouldAutoFire) setHasSeenAdvancedVerification(true);
    } catch (err) {
      solveTimersRef.current.forEach(clearTimeout);
      solveTimersRef.current = [];
      setStage('idle');
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

      {/* Left Panel */}
      <aside className="fixed left-0 top-0 z-30 flex h-screen w-60 flex-col border-r border-white/[0.08] bg-zinc-950 p-5">
        {/* Logo */}
        <button
          type="button"
          onClick={handleReset}
          className="cursor-pointer pt-1 pb-6 text-left"
        >
          <span className={`${dmSerifDisplay.className} text-[22px] tracking-tight text-white`}>Ergo.</span>
        </button>

        {/* Nav */}
        <div className="space-y-1">
          <button
            type="button"
            onClick={handleReset}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-[14px] text-zinc-300 transition-colors hover:bg-white/[0.03] hover:text-zinc-100"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
            Home
          </button>
        </div>

        <div className="my-4 border-t border-white/[0.08]" />

        {/* Sessions */}
        <div>
          <div className="px-3 pb-2 text-[11px] uppercase tracking-wider text-zinc-500">Sessions</div>
          <div className="mx-3 my-2 rounded-md border border-white/[0.04] bg-white/[0.02] p-3">
            <p className="text-[14px] leading-6 text-zinc-400">Sign in to save and track your sessions</p>
            <button
              type="button"
              onClick={() => {/* Phase 5: open auth flow */}}
              className="mt-2 w-full rounded-md bg-zinc-800 px-3 py-1.5 text-[13px] text-zinc-100 transition-colors hover:bg-zinc-700"
            >
              Sign in
            </button>
          </div>
        </div>

        {/* Bottom items */}
        <div className="mt-auto space-y-1">
          <div className="mb-3 border-t border-white/[0.08]" />
          {/* Profile */}
          <button
            type="button"
            onClick={() => {/* Phase 5: open auth flow */}}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-[14px] text-zinc-500 transition-colors hover:bg-white/[0.03] hover:text-zinc-300"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            Profile
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-[14px] text-zinc-500 transition-colors hover:bg-white/[0.03] hover:text-zinc-300"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            Settings
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-[14px] text-zinc-500 transition-colors hover:bg-white/[0.03] hover:text-zinc-300"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            Help
          </button>
        </div>
      </aside>

      {/* Slogan — fixed, visible in idle state only, centered in content area */}
      <div
        className={`pointer-events-none fixed z-10 text-center transition-opacity duration-[380ms] ease-out ${isActive ? 'opacity-0' : 'opacity-100'}`}
        style={{ top: '42vh', left: 'calc(50% + 120px)', transform: 'translateX(-50%) translateY(-50%)' }}
      >
        <p className={`${dmSerifDisplay.className} text-2xl text-zinc-300`}>
          The answer, and the proof.
        </p>
      </div>

      {/* Scrollable content — ml-60 clears the fixed left panel */}
      <div className="relative z-10 ml-60 px-6 pt-8 pb-[220px]">

        {/* Dot pattern — content area only */}
        <div
          aria-hidden="true"
          className={`pointer-events-none fixed bottom-0 right-0 transition-opacity duration-[380ms] ease-out ${isActive ? 'opacity-0' : 'opacity-100'}`}
          style={{
            top: 0,
            left: '240px',
            zIndex: 5,
            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.08) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
            maskImage: 'radial-gradient(ellipse 700px 500px at 50% 62%, transparent 25%, black 100%)',
            WebkitMaskImage: 'radial-gradient(ellipse 700px 500px at 50% 62%, transparent 25%, black 100%)',
          }}
        />

        {/* Solve Surface */}
        <section className="px-2 py-2">

          {solveStage !== 'idle' && (
            <SolveProgress stage={solveStage} />
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
                        onClick={() => setGraphOpen(true)}
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

                {/* Proof details panel */}
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

      {/* Floating Input Composer — centered in content area (right of 240px panel) */}
      <div
        className="fixed z-50"
        style={{
          left: 'calc(50% + 120px)',
          transform: 'translateX(-50%)',
          bottom: isActive ? 0 : '32vh',
          width: isActive ? 'calc(100% - 240px)' : '700px',
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
          {/* Mode tabs */}
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

          {/* Interactive tab */}
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

              {/* Solve button */}
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

      {/* Graph Popover — floating top-right, does not push content */}
      <AnimatePresence>
        {graphOpen && artifact?.graph?.graphable && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="fixed right-6 top-20 z-40 h-[400px] w-[500px] overflow-hidden rounded-lg border border-white/[0.08] bg-zinc-950 shadow-2xl"
            style={{ transformOrigin: 'top right' }}
          >
            {/* Popover header */}
            <div className="flex h-10 items-center justify-between border-b border-white/[0.06] px-4">
              <span className="text-[11px] uppercase tracking-wider text-zinc-500">Graph</span>
              <button
                type="button"
                onClick={() => setGraphOpen(false)}
                className="rounded p-1 text-zinc-500 transition hover:bg-white/[0.05] hover:text-zinc-300"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Desmos embed */}
            <div className="relative h-[360px] w-full">
              <div ref={desmosRef} className="h-full w-full" />
              <a
                href={`https://www.desmos.com/calculator?${new URLSearchParams({ expression: artifact.graph.expression }).toString()}`}
                target="_blank"
                rel="noopener noreferrer"
                className="absolute bottom-3 right-3 text-[12px] text-zinc-400 transition hover:text-zinc-200"
              >
                Open in Desmos ↗
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
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

const SOLVE_STAGES: { key: SolveStage; label: string }[] = [
  { key: 'parsing',    label: 'Parsing' },
  { key: 'generating', label: 'Generating solution' },
  { key: 'verifying',  label: 'Running verification' },
  { key: 'building',   label: 'Building proof' },
];

const STAGE_ORDER: SolveStage[] = ['parsing', 'generating', 'verifying', 'building'];

function getItemState(stageKey: SolveStage, current: SolveStage): 'pending' | 'active' | 'complete' {
  if (current === 'complete') return 'complete';
  if (current === 'idle') return 'pending';
  const si = STAGE_ORDER.indexOf(stageKey);
  const ci = STAGE_ORDER.indexOf(current);
  if (si < ci) return 'complete';
  if (si === ci) return 'active';
  return 'pending';
}

function SolveProgress({ stage }: { stage: SolveStage }) {
  return (
    <div
      className={`my-8 flex flex-col gap-3 transition-opacity duration-300 ${stage === 'complete' ? 'opacity-0' : 'opacity-100'}`}
    >
      {SOLVE_STAGES.map(({ key, label }) => {
        const state = getItemState(key, stage);
        return (
          <div key={key} className={`flex items-center gap-3 text-[13px] transition-colors duration-300 ${
            state === 'active'   ? 'text-zinc-100' :
            state === 'complete' ? 'text-zinc-400' :
                                   'text-zinc-600'
          }`}>
            <div className="flex w-4 items-center justify-center">
              {state === 'complete' ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : state === 'active' ? (
                <div className="h-2 w-2 animate-pulse rounded-full bg-zinc-100" />
              ) : (
                <div className="h-2 w-2 rounded-full border border-zinc-600" />
              )}
            </div>
            {label}
          </div>
        );
      })}
    </div>
  );
}
