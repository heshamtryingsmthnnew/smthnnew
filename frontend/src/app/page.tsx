'use client';

import { BlockMath, InlineMath } from 'react-katex';
import axios from 'axios';
import { useEffect, useState, useReducer, useRef, useCallback, FormEvent, KeyboardEvent, ChangeEvent, Component } from 'react';
import { DM_Serif_Display, JetBrains_Mono } from 'next/font/google';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { getSessionId, clearSessionId } from '../lib/session';
import {
  sessionReducer, initialState as sessionInitialState,
  getBucketedSessions, getSessionSolves, isSessionExpanded,
  type BucketKey, type SessionMeta, type SolveMeta,
} from './state/sessionReducer';

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
    wolfram_query: string | null;
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

type HistorySolve = {
  id: string;
  created_at: string;
  raw_input: string;
  mode: Mode;
  badge: string;
  problem_kind: string | null;
};

type BatchProblemStatus = 'queued' | 'in_progress' | 'completed' | 'failed';

type BatchProblem = {
  index: number;
  text: string;
  status: BatchProblemStatus;
  artifact?: Artifact;
  error?: string;
};

type BatchSummary = {
  verified: number;
  checked: number;
  discrepancy: number;
  not_verified: number;
  failed: number;
};

type BatchModalStage = 'idle' | 'input' | 'review' | 'processing' | 'complete';

function relativeTime(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 172800) return 'yesterday';
  return `${Math.floor(diff / 86400)} days ago`;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
// Dev flag — enables batch UI for local testing. Unset in production until Phase 6 wires real Pro flag.
const BATCH_UI_ENABLED = process.env.NEXT_PUBLIC_SHOW_BATCH_UI === 'true';

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

const WEDGE_MESSAGES = [
  'Querying external solver...',
  'Parsing result...',
  'Comparing answers...',
  'Finalising verdict...',
];

// Accepted file types per surface — validated by acquireFile.
// Entries ending with '/' are prefix-matched (e.g. 'image/' matches any image/*).
// Entries without a trailing '/' are exact-matched.
const COMPOSER_ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const BATCH_ACCEPTED_TYPES = [
  'image/',  // prefix: matches image/png, image/jpeg, image/gif, image/webp, image/x-png, etc.
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

// Returns true when a MIME type matches an entry in the accepted list.
// Entries ending in '/' are prefix-matched; all others are exact-matched.
function typeMatches(mimeType: string, acceptedTypes: string[]): boolean {
  return acceptedTypes.some((t) =>
    t.endsWith('/') ? mimeType.startsWith(t) : mimeType === t
  );
}

// Shared file acquisition + validation helper.
// Extracts a File from a direct File reference, ClipboardEvent, or DragEvent,
// validates its MIME type against acceptedTypes, then calls onValid or onError.
// Returns silently (no error) when no file of an accepted type is found in an event —
// this preserves normal paste/drop behaviour when the event contains no matching file.
function acquireFile(
  source: File | React.ClipboardEvent<HTMLElement> | React.DragEvent<HTMLElement>,
  {
    acceptedTypes,
    onValid,
    onError,
  }: {
    acceptedTypes: string[];
    onValid: (file: File) => void;
    onError: (msg: string) => void;
  }
): void {
  let file: File | null = null;

  if (source instanceof File) {
    file = source;
  } else if ('clipboardData' in source) {
    const items = source.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (typeMatches(item.type, acceptedTypes)) {
        file = item.getAsFile();
        break;
      }
    }
    if (!file) return; // no matching file in clipboard — let paste through normally
  } else if ('dataTransfer' in source) {
    const files = Array.from(source.dataTransfer.files);
    file = files.find((f) => typeMatches(f.type, acceptedTypes)) ?? null;
    if (!file) return; // no matching file in drop
  }

  if (!file) return;

  if (!typeMatches(file.type, acceptedTypes)) {
    onError('Unsupported file type.');
    return;
  }

  onValid(file);
}

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

function getSuggestionIcon(action: string) {
  switch (action) {
    case 'OPEN_MATH_KEYBOARD':
      return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="6" width="20" height="12" rx="2" />
          <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h12" />
        </svg>
      );
    case 'SHOW_FORMAT_EXAMPLE':
      return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="4 7 4 4 20 4 20 7" />
          <line x1="9" y1="20" x2="15" y2="20" />
          <line x1="12" y1="4" x2="12" y2="20" />
        </svg>
      );
    default:
      return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 18l6-6-6-6" />
        </svg>
      );
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

class KaTeXBoundary extends Component<
  { children: React.ReactNode; fallback: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode; fallback: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  render() { return this.state.hasError ? this.props.fallback : this.props.children; }
}

export default function Home() {
  const [mode, setMode] = useState<Mode>('math');
  const [question, setQuestion] = useState('');
  const [ghostQuestion, setGhostQuestion] = useState('');
  const [artifact, setArtifact] = useState<Artifact | null>(null);
  const [loading, setLoading] = useState(false);
  const [currentCorrelationId, setCurrentCorrelationId] = useState<string | null>(null);
  const [openExplainIndex, setOpenExplainIndex] = useState<number | null>(null);
  const [showProofDetails, setShowProofDetails] = useState(false);
  const [exampleIndex, setExampleIndex] = useState(0);
  const [imageExtracting, setImageExtracting] = useState(false);
  const [extractedProblems, setExtractedProblems] = useState<string[] | null>(null);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
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
  const artifactRef = useRef<Artifact | null>(null);

  // Wedge animation state
  type WedgePhase = 'idle' | 'animating' | 'revealing' | 'done';
  const [wedgePhase, setWedgePhase] = useState<WedgePhase>('idle');
  const [wedgeLineDrawn, setWedgeLineDrawn] = useState(false);
  const [wedgeVisibleMessages, setWedgeVisibleMessages] = useState(0);
  const [wedgeShowResult, setWedgeShowResult] = useState(false);
  const [wedgeShowHeader, setWedgeShowHeader] = useState(false);
  const wedgeTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const pendingAdvancedResult = useRef<Artifact | null>(null);
  const advancedResultReady = useRef(false);

  // Sticky answer bar
  const answerBoxRef = useRef<HTMLDivElement>(null);
  const [showStickyBar, setShowStickyBar] = useState(false);

  // Advanced verification UX
  const [advancedVerifFired, setAdvancedVerifFired] = useState(false);

  // Session reducer — single source of truth for sidebar + history + session navigation
  const [sState, dispatch] = useReducer(sessionReducer, sessionInitialState);
  const sidebarCollapsed = sState.sidebarCollapsed;

  // Sidebar hover-peek stays as local component state (brief-approved)
  const [sidebarPeeking, setSidebarPeeking] = useState(false);
  const sidebarOpen = !sidebarCollapsed || sidebarPeeking;

  // Transient rename UI state
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null);
  const [renameInput, setRenameInput] = useState('');

  // Auth + history
  const [user, setUser] = useState<import('@supabase/supabase-js').User | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authSent, setAuthSent] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [revalidationNote, setRevalidationNote] = useState<{ date: string; version: string } | null>(null);

  // Batch solve state
  const [batchStage, setBatchStage] = useState<BatchModalStage>('idle');
  const [batchInputType, setBatchInputType] = useState<'text' | 'document'>('text');
  const [batchText, setBatchText] = useState('');
  const [batchFile, setBatchFile] = useState<File | null>(null);
  const [batchMode, setBatchMode] = useState<Mode>('math');
  const [batchExtracting, setBatchExtracting] = useState(false);
  const [batchExtractError, setBatchExtractError] = useState<string | null>(null);
  const [batchDraftProblems, setBatchDraftProblems] = useState<string[]>([]);
  const [batchProblems, setBatchProblems] = useState<BatchProblem[]>([]);
  const [batchSummary, setBatchSummary] = useState<BatchSummary | null>(null);
  const [batchExpandedIndex, setBatchExpandedIndex] = useState<number | null>(null);
  const [showBatchResults, setShowBatchResults] = useState(false);
  const [batchIsDraggingOver, setBatchIsDraggingOver] = useState(false);
  const sidebarWidth = sidebarOpen ? 240 : 56;
  const contentOffset = sidebarWidth / 2;

  const examples = mode === 'math' ? MATH_EXAMPLES : PHYSICS_EXAMPLES;
  const verificationDetails = getVerificationDetails(artifact);
  const certaintyLabel = artifact ? getCertaintyLabel(artifact.verification.certainty) : null;
  const isActive = loading || !!artifact;

  // Clears the workspace (artifact, composer, panels, wedge state) without touching
  // session activation pointers — shared by handleReset (deactivates) and session
  // activation (activates a different session into an empty composer, §6b).
  const clearWorkspace = useCallback(() => {
    solveTimersRef.current.forEach(clearTimeout);
    solveTimersRef.current = [];
    setSolveStage('idle');
    solveStageRef.current = 'idle';
    artifactRef.current = null;
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
    // Inline wedge reset (cannot call resetWedgeState here due to useCallback ordering)
    wedgeTimersRef.current.forEach(clearTimeout);
    wedgeTimersRef.current = [];
    setWedgePhase('idle');
    setWedgeLineDrawn(false);
    setWedgeVisibleMessages(0);
    setWedgeShowResult(false);
    setWedgeShowHeader(false);
    pendingAdvancedResult.current = null;
    advancedResultReady.current = false;
    setShowStickyBar(false);
    setRevalidationNote(null);
    setCurrentCorrelationId(null);
  }, []);

  const handleReset = useCallback(() => {
    clearWorkspace();
    dispatch({ type: 'DEACTIVATE_SESSION' });
  }, [clearWorkspace, dispatch]);

  // Activates a session (clicking it in the sidebar): clears the workspace to an
  // empty composer and points new solves at this session (§6b — does not auto-load
  // a solve; arrows/solve-row clicks remain the path to viewing old answers).
  const handleActivateSession = useCallback((sessionId: string) => {
    clearWorkspace();
    dispatch({ type: 'ACTIVATE_SESSION', sessionId });
  }, [clearWorkspace, dispatch]);

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

  // Sticky bar: show when answer box scrolls out of viewport upward
  useEffect(() => {
    if (!answerBoxRef.current || !artifact) {
      setShowStickyBar(false);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => { setShowStickyBar(!entry.isIntersecting); },
      { threshold: 0, rootMargin: '0px 0px 0px 0px' }
    );
    observer.observe(answerBoxRef.current);
    return () => observer.disconnect();
  }, [artifact]);

  // tabMicrocopy: auto-dismiss after 4s; also cleared by arrow nav and DISPLAY_SOLVE
  useEffect(() => {
    if (!sState.tabMicrocopy) return;
    const t = setTimeout(() => dispatch({ type: 'CLEAR_TAB_MICROCOPY' }), 4000);
    return () => clearTimeout(t);
  }, [sState.tabMicrocopy]);

  // Auto-clear extract error after 4 seconds
  useEffect(() => {
    if (!extractError) return;
    const t = setTimeout(() => setExtractError(null), 4000);
    return () => clearTimeout(t);
  }, [extractError]);

  // Fetch sessions from GET /sessions and normalize into the reducer.
  // Works for both authenticated users (JWT) and anonymous users (X-Session-Id).
  // Called once on mount and on SIGNED_IN — NOT after each solve (optimistic reconcile handles that).
  const fetchSessions = useCallback(async (accessToken?: string | null) => {
    dispatch({ type: 'SESSIONS_FETCH_START' });
    try {
      const headers: Record<string, string> = { 'X-Session-Id': getSessionId() };
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
      const res = await axios.get(`${API_URL}/sessions`, { headers });
      const rawSessions: Array<SessionMeta & { solves: Array<Omit<SolveMeta, 'cluster_session_id'>> }> =
        res.data.sessions || [];
      const sessions: SessionMeta[] = rawSessions.map(s => ({
        id: s.id, name: s.name, source: s.source,
        created_at: s.created_at, last_solve_at: s.last_solve_at, solve_count: s.solve_count,
      }));
      const solves: SolveMeta[] = rawSessions.flatMap(s =>
        (s.solves || []).map(solve => ({ ...solve, cluster_session_id: s.id, raw_input_preview: (solve as unknown as { raw_input: string }).raw_input || '' }))
      );
      dispatch({ type: 'SESSIONS_FETCH_SUCCESS', sessions, solves });
    } catch (e) {
      console.warn('[sessions] fetch failed', e);
      dispatch({ type: 'SESSIONS_FETCH_ERROR' });
    }
  }, []);

  // Supabase auth state listener
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const session = data.session;
      setUser(session?.user ?? null);
      // Fetch sessions for both authenticated and anonymous users
      fetchSessions(session?.access_token);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      setUser(session?.user ?? null);
      if (event === 'SIGNED_IN' && session) {
        // Merge anonymous session into user account (24hr window)
        const sid = getSessionId();
        if (sid) {
          try {
            await axios.post(`${API_URL}/auth/merge-session`, { session_id: sid }, {
              headers: { Authorization: `Bearer ${session.access_token}` },
            });
            clearSessionId();
          } catch (e) {
            console.warn('[merge-session] failed', e);
          }
        }
        fetchSessions(session.access_token);
        setShowAuthModal(false);
      }
      if (event === 'SIGNED_OUT') {
        // Clear session history state on sign-out
        dispatch({ type: 'SESSIONS_FETCH_SUCCESS', sessions: [], solves: [] });
        // Re-fetch anon sessions (if any survive sign-out)
        fetchSessions(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchSessions]);

  const loadHistoricalSolve = async (solveId: string) => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    // Require auth for /history/get/:id (anon users see sessions in sidebar but can't load details)
    if (!token) return;

    // Dispatch DISPLAY_SOLVE before the network call so sidebar highlights immediately.
    // activeSessionId is NOT changed — loading old work is view-only.
    dispatch({ type: 'DISPLAY_SOLVE', solveId });

    // Fire session.loaded_without_new_solve when user views a non-active (historical) session
    const solveRecord = sState.solvesById[solveId];
    if (solveRecord && solveRecord.cluster_session_id !== sState.activeSessionId) {
      axios.post(`${API_URL}/events`, {
        kind: 'session.loaded_without_new_solve',
        severity: 'info',
        session_id: solveRecord.cluster_session_id,
        payload: {
          session_id: solveRecord.cluster_session_id,
          displayed_solve_id: solveId,
          was_active: false,
        },
      }, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Session-Id': getSessionId(),
        },
      }).catch(() => { /* fire-and-forget — logging failure is non-fatal */ });
    }

    try {
      const res = await axios.get(`${API_URL}/history/get/${solveId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = res.data;
      handleReset();
      setArtifact(d.artifact);
      artifactRef.current = d.artifact;
      setGhostQuestion(d.raw_input);
      if (d.mode === 'math' || d.mode === 'physics') setMode(d.mode);
      if (d.badge_changed && d.last_revalidated_at && d.last_revalidated_build_version) {
        setRevalidationNote({ date: d.last_revalidated_at, version: d.last_revalidated_build_version });
      }
    } catch (e) {
      console.warn('[history] load failed', e);
    }
  };

  // Tab nav — mirrors sidebar click pattern; reuses loadHistoricalSolve exactly
  const handleTabNav = (direction: 'prev' | 'next') => {
    if (!sState.displayedSessionId || !sState.displayedSolveId) return;
    const solves = getSessionSolves(sState, sState.displayedSessionId);
    const i = solves.findIndex(s => s.id === sState.displayedSolveId);
    if (i === -1) return;
    const target = direction === 'prev' ? i + 1 : i - 1;
    if (target < 0 || target >= solves.length) return;
    const targetSolveId = solves[target].id;
    dispatch({ type: 'CLEAR_TAB_MICROCOPY' });
    loadHistoricalSolve(targetSolveId);
  };

  const handleSignIn = async (e: FormEvent) => {
    e.preventDefault();
    if (!authEmail.trim()) return;
    setAuthLoading(true);
    setAuthError(null);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: authEmail.trim(),
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) {
        setAuthError(error.message);
      } else {
        setAuthSent(true);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setAuthError(`Network error: ${msg}`);
      console.error('[auth] signInWithOtp threw:', err);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  // Warn user if they try to leave while a batch is running
  useEffect(() => {
    if (batchStage !== 'processing') return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [batchStage]);

  const openBatchModal = () => {
    setBatchStage('input');
    setBatchText('');
    setBatchFile(null);
    setBatchExtractError(null);
    setBatchDraftProblems([]);
    setBatchMode(mode);
    setBatchInputType('text');
  };

  const closeBatchModal = () => setBatchStage('idle');

  // Shared onValid callback for batch file acquisition — switches to document mode
  // and stores the validated file regardless of whether text/document tab is active.
  const handleBatchFileAcquired = (file: File) => {
    setBatchFile(file);
    setBatchInputType('document');
    setBatchExtractError(null);
  };

  const handleBatchExtract = async () => {
    if (batchInputType === 'text' && !batchText.trim()) return;
    if (batchInputType === 'document' && !batchFile) return;
    setBatchExtracting(true);
    setBatchExtractError(null);
    try {
      const formData = new FormData();
      formData.append('mode', batchMode);
      if (batchInputType === 'text') {
        formData.append('text', batchText);
      } else if (batchFile) {
        formData.append('file', batchFile);
      }
      const res = await axios.post(`${API_URL}/batch/extract`, formData);
      const problems: string[] = res.data.problems || [];
      if (problems.length === 0) {
        setBatchExtractError('No problems found. Try pasting the text directly.');
        return;
      }
      setBatchDraftProblems(problems);
      setBatchStage('review');
    } catch {
      setBatchExtractError('Extraction failed. Try pasting the text directly.');
    } finally {
      setBatchExtracting(false);
    }
  };

  const startBatchSolve = async () => {
    const problems = batchDraftProblems.filter(p => p.trim());
    if (problems.length === 0) return;

    const initialProblems: BatchProblem[] = problems.map((text, index) => ({ index, text, status: 'queued' }));
    setBatchProblems(initialProblems);
    setBatchSummary(null);
    setBatchExpandedIndex(null);
    setBatchStage('processing');

    const { data: sessionData } = await supabase.auth.getSession();
    const headers: Record<string, string> = { 'X-Session-Id': getSessionId(), 'Content-Type': 'application/json' };
    if (sessionData.session?.access_token) {
      headers['Authorization'] = `Bearer ${sessionData.session.access_token}`;
    }

    try {
      const response = await fetch(`${API_URL}/batch/solve`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ problems, mode: batchMode }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Batch failed' }));
        setBatchStage('idle');
        setBatchExtractError(err.error || 'Batch failed. Check your quota and try again.');
        setBatchStage('review');
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) { setBatchStage('complete'); return; }
      const decoder = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === 'problem_started') {
              setBatchProblems(prev => prev.map(p => p.index === event.index ? { ...p, status: 'in_progress' } : p));
            } else if (event.type === 'problem_completed') {
              setBatchProblems(prev => prev.map(p => p.index === event.index ? { ...p, status: 'completed', artifact: event.artifact } : p));
            } else if (event.type === 'problem_failed') {
              setBatchProblems(prev => prev.map(p => p.index === event.index ? { ...p, status: 'failed', error: event.error } : p));
            } else if (event.type === 'batch_completed') {
              setBatchSummary(event.summary);
              setBatchStage('complete');
              // Discrepancy-first: auto-expand first discrepant problem
              setBatchProblems(prev => {
                const firstDisc = prev.find(p => p.artifact?.verification?.badge === 'discrepancy_detected');
                if (firstDisc) setBatchExpandedIndex(firstDisc.index);
                return prev;
              });
            }
          } catch { /* skip malformed event */ }
        }
      }
    } catch (err) {
      console.error('[batch] stream error:', err);
      setBatchStage('complete');
    }
  };

  const doSolve = async () => {
    if (loading || !question.trim()) return;

    // Auto-fire advanced verification on the first solve of this page session.
    // Does NOT count toward the manual-use limit (advancedVerifUsed unchanged).
    const shouldAutoFire = !hasSeenAdvancedVerification;

    // Optimistic insert — pending row appears with no perceptible delay
    const nonce = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const rawInputPreview = question.length > 80 ? question.slice(0, 80) + '…' : question;
    dispatch({ type: 'SOLVE_INITIATED', nonce, rawInputPreview });

    // Clear any in-flight stage timers from a previous solve
    solveTimersRef.current.forEach(clearTimeout);
    solveTimersRef.current = [];

    setLoading(true);
    artifactRef.current = null;
    setArtifact(null);
    setGhostQuestion('');
    setOpenExplainIndex(null);
    setShowProofDetails(false);
    setAdvancedVerifResult(null);
    setAdvancedVerifFired(false);
    setShowAdvancedVerifGate(false);
    setShowFormatHint(false);
    setGraphOpen(false);
    setShowStickyBar(false);
    setRevalidationNote(null);
    // Reset wedge animation state for new solve
    wedgeTimersRef.current.forEach(clearTimeout);
    wedgeTimersRef.current = [];
    setWedgePhase('idle');
    setWedgeLineDrawn(false);
    setWedgeVisibleMessages(0);
    setWedgeShowResult(false);
    setWedgeShowHeader(false);
    pendingAdvancedResult.current = null;
    advancedResultReady.current = false;
    // advancedVerifUsed intentionally not reset — persists across solves

    // Start progress stages
    const setStage = (s: SolveStage) => { setSolveStage(s); solveStageRef.current = s; };
    setStage('parsing');
    solveTimersRef.current.push(setTimeout(() => setStage('generating'), 1200));
    solveTimersRef.current.push(setTimeout(() => setStage('verifying'), 4500));
    solveTimersRef.current.push(setTimeout(() => setStage('building'), 7000));

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const authHeaders: Record<string, string> = {
        'X-Session-Id': getSessionId(),
        ...(sessionData.session?.access_token
          ? { Authorization: `Bearer ${sessionData.session.access_token}` }
          : {}),
      };
      const res = await axios.post(`${API_URL}/solve`, { question, mode, active_session_id: sState.activeSessionId }, { headers: authHeaders });

      // Clear scheduled stage timers
      solveTimersRef.current.forEach(clearTimeout);
      solveTimersRef.current = [];

      // Snap through any remaining stages at 300ms intervals then fade
      const STAGE_ORDER: SolveStage[] = ['parsing', 'generating', 'verifying', 'building'];
      const currentIdx = STAGE_ORDER.indexOf(solveStageRef.current as SolveStage);
      let delay = 0;
      for (let i = currentIdx + 1; i < STAGE_ORDER.length; i++) {
        delay += 300;
        const s = STAGE_ORDER[i];
        solveTimersRef.current.push(setTimeout(() => setStage(s), delay));
      }
      delay += 300;
      solveTimersRef.current.push(setTimeout(() => setStage('complete'), delay));
      solveTimersRef.current.push(setTimeout(() => setStage('idle'), delay + 400));

      const solveArtifact = res.data.artifact || null;
      artifactRef.current = solveArtifact;
      setCurrentCorrelationId(res.data.correlation_id || null);
      setArtifact(solveArtifact);

      // Optimistic reconcile — swaps the pending row for the real solve
      const solveId = res.data.solve_id || null;
      const clusterSessionId = res.data.cluster_session_id || null;
      const sessionFromResponse = res.data.session || null;
      if (solveId && clusterSessionId && sessionFromResponse) {
        const solveMeta: SolveMeta = {
          id: solveId,
          cluster_session_id: clusterSessionId,
          problem_kind: solveArtifact?.normalized_payload?.type || null,
          badge: solveArtifact?.verification?.badge || null,
          raw_input_preview: rawInputPreview,
          created_at: res.data.created_at || new Date().toISOString(),
          mode,
        };
        dispatch({
          type: 'SOLVE_RECONCILED',
          nonce,
          solve: solveMeta,
          session: {
            id: clusterSessionId,
            name: sessionFromResponse.name,
            created_at: sessionFromResponse.created_at,
            is_new: sessionFromResponse.is_new,
          },
        });
      } else {
        // No DB row (DB write failed non-fatally) — still remove the pending row
        dispatch({ type: 'SOLVE_FAILED', nonce });
      }

      if (shouldAutoFire && solveArtifact) {
        setHasSeenAdvancedVerification(true);
        requestAnimationFrame(() => startWedgeSequence());

        const verifyPayload = {
          mode: solveArtifact.mode,
          wolfram_query: solveArtifact.solution?.wolfram_query || null,
          final_answer_latex: solveArtifact.solution?.final_answer_latex || '',
          question: solveArtifact.original_input,
          structured_solution: solveArtifact.solution,
          correlation_id: res.data.correlation_id || null,
        };

        axios.post(`${API_URL}/verify`, verifyPayload).then((verifyRes) => {
          const verifyData = verifyRes.data;
          const mergedArtifact: Artifact = {
            ...solveArtifact,
            cas: verifyData.cas || null,
            audit: verifyData.audit || null,
            verification: {
              ...solveArtifact.verification,
              ...(verifyData.cas?.verdict === 'confirmed' && {
                badge: 'verified' as const,
                user_reason: 'Confirmed by Wolfram Alpha.',
              }),
              ...(verifyData.cas?.verdict === 'discrepancy' && {
                badge: 'discrepancy_detected' as const,
                user_reason: 'Wolfram Alpha returned a different result — review recommended.',
              }),
            },
          };
          pendingAdvancedResult.current = mergedArtifact;
          advancedResultReady.current = true;
        }).catch((err: Error) => {
          console.warn('[verify] background call failed:', err.message);
          pendingAdvancedResult.current = {
            ...solveArtifact,
            cas: { verdict: 'unavailable', wolfram_result: null, expression_checked: null, used: true },
          };
          advancedResultReady.current = true;
        });
      }
    } catch (err) {
      solveTimersRef.current.forEach(clearTimeout);
      solveTimersRef.current = [];
      setStage('idle');
      console.error(err);
      artifactRef.current = null;
      setArtifact(null);
      // Remove optimistic pending row on failure
      dispatch({ type: 'SOLVE_FAILED', nonce });
      // Clear wedge on error
      wedgeTimersRef.current.forEach(clearTimeout);
      wedgeTimersRef.current = [];
      setWedgePhase('idle');
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

  const handleImageFile = async (file: File) => {
    setImageExtracting(true);
    setExtractedProblems(null);
    setExtractError(null);

    const formData = new FormData();
    formData.append('image', file);

    try {
      const response = await axios.post(
        `${API_URL}/extract-problem`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      const data = response.data;
      if (data.mode === 'single') {
        setQuestion(data.problem);
        setExtractedProblems(null);
      } else if (data.mode === 'multiple') {
        setExtractedProblems(data.problems);
      } else {
        setExtractError('No math problems found in this image.');
      }
    } catch {
      setExtractError('Failed to read image. Please try again.');
    } finally {
      setImageExtracting(false);
    }
  };

  const handleImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    acquireFile(file, {
      acceptedTypes: COMPOSER_ACCEPTED_TYPES,
      onValid: handleImageFile,
      onError: (msg) => setExtractError(msg),
    });
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
      const res = await axios.post(`${API_URL}/verify`, {
        mode: artifact.mode,
        wolfram_query: artifact.solution?.wolfram_query || null,
        final_answer_latex: artifact.solution?.final_answer_latex || '',
        question: artifact.original_input,
        structured_solution: artifact.solution,
        correlation_id: currentCorrelationId,
      });
      const verifyData = res.data;
      const mergedArtifact: Artifact = {
        ...artifact,
        cas: verifyData.cas || null,
        audit: verifyData.audit || null,
        verification: {
          ...artifact.verification,
          ...(verifyData.cas?.verdict === 'confirmed' && {
            badge: 'verified' as const,
            user_reason: 'Confirmed by Wolfram Alpha.',
          }),
          ...(verifyData.cas?.verdict === 'discrepancy' && {
            badge: 'discrepancy_detected' as const,
            user_reason: 'Wolfram Alpha returned a different result — review recommended.',
          }),
        },
      };
      pendingAdvancedResult.current = mergedArtifact;
      advancedResultReady.current = true;
    } catch (err) {
      console.error('[Advanced Verification]', err);
      // Reset wedge on error
      wedgeTimersRef.current.forEach(clearTimeout);
      wedgeTimersRef.current = [];
      setWedgePhase('idle');
      setWedgeLineDrawn(false);
      setWedgeVisibleMessages(0);
      setWedgeShowResult(false);
      setWedgeShowHeader(false);
      pendingAdvancedResult.current = null;
      advancedResultReady.current = false;
    } finally {
      setAdvancedVerifLoading(false);
    }
  };

  const handleAdvancedVerification = () => {
    if (advancedVerifUsed >= ADVANCED_VERIF_FREE_LIMIT) {
      setShowAdvancedVerifGate(true);
    } else {
      setAdvancedVerifFired(true);
      setAdvancedVerifUsed((prev) => prev + 1);
      advancedResultReady.current = false;
      pendingAdvancedResult.current = null;
      startWedgeSequence();
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
      case 'SIMPLIFY_WORDING':
        scrollToComposer();
        break;
    }
  };

  function clearWedgeTimers() {
    wedgeTimersRef.current.forEach(clearTimeout);
    wedgeTimersRef.current = [];
  }

  function triggerReveal() {
    setWedgePhase('revealing');
    const incoming = pendingAdvancedResult.current;
    setAdvancedVerifResult(incoming);

    const currentArtifact = artifactRef.current;
    let kind: 'discrepancy' | 'confirmed' | null = null;
    if (currentArtifact?.mode === 'math') {
      const v = incoming?.cas?.verdict;
      if (v === 'discrepancy') kind = 'discrepancy';
      else if (v === 'confirmed') kind = 'confirmed';
    } else if (currentArtifact?.mode === 'physics') {
      const v = incoming?.audit?.verdict;
      if (v === 'inconsistent') kind = 'discrepancy';
      else if (v === 'consistent') kind = 'confirmed';
    }

    if (kind === 'discrepancy') {
      setWedgeShowHeader(true);
      const t1 = setTimeout(() => setWedgeShowResult(true), 300);
      const t2 = setTimeout(() => setWedgePhase('done'), 700);
      wedgeTimersRef.current.push(t1, t2);
    } else if (kind === 'confirmed') {
      setWedgeLineDrawn(false);
      const t1 = setTimeout(() => {
        setWedgeLineDrawn(true);
        setWedgeShowHeader(true);
        setWedgeShowResult(true);
      }, 400);
      const t2 = setTimeout(() => setWedgePhase('done'), 700);
      wedgeTimersRef.current.push(t1, t2);
    } else {
      setWedgeLineDrawn(false);
      const t1 = setTimeout(() => setWedgePhase('done'), 400);
      wedgeTimersRef.current.push(t1);
    }
  }

  function startWedgeSequence() {
    clearWedgeTimers();
    setWedgePhase('animating');
    setWedgeLineDrawn(false);
    setWedgeVisibleMessages(0);
    setWedgeShowResult(false);
    setWedgeShowHeader(false);

    const t0 = setTimeout(() => setWedgeLineDrawn(true), 50);
    wedgeTimersRef.current.push(t0);

    const MSG_START = 350;
    const MSG_INTERVAL = 1500;
    for (let i = 0; i < WEDGE_MESSAGES.length; i++) {
      const count = i + 1;
      const t = setTimeout(() => setWedgeVisibleMessages(count), MSG_START + i * MSG_INTERVAL);
      wedgeTimersRef.current.push(t);
    }

    const REVEAL_AT = MSG_START + (WEDGE_MESSAGES.length - 1) * MSG_INTERVAL + MSG_INTERVAL + 200;
    const tReveal = setTimeout(() => {
      if (advancedResultReady.current) {
        triggerReveal();
      } else {
        const poll = setInterval(() => {
          if (advancedResultReady.current) {
            clearInterval(poll);
            triggerReveal();
          }
        }, 50);
        wedgeTimersRef.current.push(poll as unknown as ReturnType<typeof setTimeout>);
      }
    }, REVEAL_AT);
    wedgeTimersRef.current.push(tReveal);
  }

  const splitKind: 'discrepancy' | 'confirmed' | null = (() => {
    if (!advancedVerifResult || advancedVerifLoading) return null;
    if (artifact?.mode === 'math') {
      const v = advancedVerifResult.cas?.verdict;
      if (v === 'discrepancy') return 'discrepancy';
      if (v === 'confirmed') return 'confirmed';
    }
    if (artifact?.mode === 'physics') {
      const v = advancedVerifResult.audit?.verdict;
      if (v === 'inconsistent') return 'discrepancy';
      if (v === 'consistent') return 'confirmed';
    }
    return null;
  })();

  const displayedSuggestions = artifact?.suggestions ?? [];

  const wedgeActive = wedgePhase !== 'idle' && !!artifact;
  const shouldGhost = wedgePhase === 'done' && splitKind !== null;

  const wolframDisplay = (() => {
    const raw = advancedVerifResult?.cas?.wolfram_result || '';
    if (!raw) return '';
    let display = raw.includes('=') ? (raw.split('=').pop()?.trim() || raw) : raw;
    // Wolfram uses log() to mean natural log; translate for display consistency
    display = display.replace(/\blog\(/g, 'ln(');
    return display;
  })();

  // Sidebar session hierarchy — computed every render (derived, never stored)
  const buckets = getBucketedSessions(sState);
  const hasSessions = Object.keys(sState.sessionsById).length > 0;
  const pendingSolvesArr = Object.values(sState.pendingSolves);

  // Badge dot color helper for solve rows
  const badgeDotColor = (badge: string | null) => {
    if (badge === 'verified') return 'bg-emerald-400';
    if (badge === 'discrepancy_detected') return 'bg-amber-400';
    if (badge === 'checked') return 'bg-white/40';
    return 'bg-zinc-600';
  };

  // Bucket display labels
  const BUCKET_LABELS: Record<BucketKey, string> = {
    today: 'Today', yesterday: 'Yesterday', week: 'This week', older: 'Older',
  };

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <style>{`
        @keyframes kbFadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Grain texture — permanent, full viewport */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0"
        style={{ opacity: 0.055 }}
      >
        <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <filter id="grain">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.65"
              numOctaves="3"
              stitchTiles="stitch"
            />
            <feColorMatrix type="saturate" values="0" />
          </filter>
          <rect width="100%" height="100%" filter="url(#grain)" />
        </svg>
      </div>

      {/* Left Panel */}
      <aside
        className={`fixed left-0 top-0 z-30 flex h-screen flex-col overflow-hidden border-r border-white/[0.08] bg-zinc-950 transition-all duration-200 ${sidebarOpen ? 'w-60' : 'w-14'} ${sidebarCollapsed && sidebarPeeking ? 'cursor-pointer' : ''}`}
        style={{ padding: sidebarOpen ? '20px' : '20px 0' }}
        onMouseEnter={() => { if (sidebarCollapsed) setSidebarPeeking(true); }}
        onMouseLeave={() => { if (sidebarCollapsed) setSidebarPeeking(false); }}
        onClick={() => {
          if (sidebarCollapsed && sidebarPeeking) {
            dispatch({ type: 'SET_SIDEBAR_COLLAPSED', value: false });
            setSidebarPeeking(false);
          }
        }}
      >
        {/* Logo row + toggle (flex-shrink-0) */}
        <div className="flex flex-shrink-0 items-center justify-between pb-6 pt-1">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); handleReset(); }}
            className={`cursor-pointer text-left ${sidebarOpen ? 'pl-3' : 'pl-0 w-full flex justify-center'}`}
          >
            <span className={`${dmSerifDisplay.className} text-[22px] tracking-tight text-white`}>
              {sidebarOpen ? 'Ergo.' : 'E.'}
            </span>
          </button>
          {!sidebarCollapsed && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                dispatch({ type: 'SET_SIDEBAR_COLLAPSED', value: true });
                setSidebarPeeking(false);
              }}
              className="rounded p-1 text-zinc-600 transition hover:text-zinc-400"
              title="Collapse sidebar"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <line x1="9" y1="3" x2="9" y2="21" />
              </svg>
            </button>
          )}
        </div>

        {/* Nav (flex-shrink-0) */}
        <div className="flex-shrink-0 space-y-1">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); handleReset(); }}
            className={`flex w-full items-center rounded-md py-2 text-[14px] text-zinc-300 transition-colors hover:bg-white/[0.03] hover:text-zinc-100 ${sidebarOpen ? 'gap-3 px-3' : 'justify-center px-0'}`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
            {sidebarOpen && <span>Home</span>}
          </button>

          {BATCH_UI_ENABLED && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); openBatchModal(); }}
              className={`flex w-full items-center rounded-md py-2 text-[14px] text-zinc-300 transition-colors hover:bg-white/[0.03] hover:text-zinc-100 ${sidebarOpen ? 'gap-3 px-3' : 'justify-center px-0'}`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 2 7 12 12 22 7 12 2" />
                <polyline points="2 17 12 22 22 17" />
                <polyline points="2 12 12 17 22 12" />
              </svg>
              {sidebarOpen && <span>Batch solve</span>}
            </button>
          )}
        </div>

        {/* Divider (flex-shrink-0) */}
        {sidebarOpen && <div className="flex-shrink-0 my-4 border-t border-white/[0.08]" />}

        {/* Batch indicator (flex-shrink-0, conditional) */}
        {BATCH_UI_ENABLED && sidebarOpen && (batchStage === 'processing' || batchStage === 'complete') && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setShowBatchResults(true); }}
            className="flex-shrink-0 mx-3 mb-3 flex w-[calc(100%-24px)] items-center gap-2 rounded-md border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-left transition-colors hover:bg-white/[0.05]"
          >
            {batchStage === 'processing' ? (
              <>
                <div className="h-2 w-2 flex-shrink-0 animate-pulse rounded-full bg-amber-400" />
                <span className="truncate text-[12px] text-zinc-300">
                  Batch: {batchProblems.filter(p => p.status === 'completed' || p.status === 'failed').length} / {batchProblems.length} done
                </span>
              </>
            ) : (
              <>
                <div className={`h-2 w-2 flex-shrink-0 rounded-full ${batchSummary && batchSummary.discrepancy > 0 ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                <span className="truncate text-[12px] text-zinc-300">
                  Batch: {batchSummary ? `${batchSummary.verified}✓ ${batchSummary.checked}~ ${batchSummary.discrepancy}⚠` : 'complete'}
                </span>
              </>
            )}
          </button>
        )}

        {/* Sessions region — flex-1 min-h-0 overflow-y-auto gives full-height internal scroll */}
        {sidebarOpen ? (
          <div className="flex-1 min-h-0 overflow-y-auto" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            <div className="px-3 pb-1 pt-0 text-[11px] uppercase tracking-wider text-zinc-500">Sessions</div>

            {/* Loading indicator */}
            {sState.loadStatus === 'loading' && (
              <p className="px-3 py-2 text-[13px] text-zinc-600">Loading…</p>
            )}

            {/* Empty: signed in, no sessions */}
            {sState.loadStatus === 'loaded' && !hasSessions && user && pendingSolvesArr.length === 0 && (
              <p className="px-3 py-2 text-[13px] italic text-zinc-600">Solve a problem to start your history.</p>
            )}

            {/* Empty: signed out, no sessions */}
            {sState.loadStatus === 'loaded' && !hasSessions && !user && pendingSolvesArr.length === 0 && (
              <div className="mx-3 my-2 rounded-md border border-white/[0.04] bg-white/[0.02] p-3">
                <p className="text-[14px] leading-6 text-zinc-400">Sign in to save and track your sessions</p>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setShowAuthModal(true); setAuthSent(false); setAuthEmail(''); setAuthError(null); }}
                  className="mt-2 w-full rounded-md bg-zinc-800 px-3 py-1.5 text-[13px] text-zinc-100 transition-colors hover:bg-zinc-700"
                >
                  Sign in
                </button>
              </div>
            )}

            {/* Idle state before first fetch */}
            {sState.loadStatus === 'idle' && !user && (
              <div className="mx-3 my-2 rounded-md border border-white/[0.04] bg-white/[0.02] p-3">
                <p className="text-[14px] leading-6 text-zinc-400">Sign in to save and track your sessions</p>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setShowAuthModal(true); setAuthSent(false); setAuthEmail(''); setAuthError(null); }}
                  className="mt-2 w-full rounded-md bg-zinc-800 px-3 py-1.5 text-[13px] text-zinc-100 transition-colors hover:bg-zinc-700"
                >
                  Sign in
                </button>
              </div>
            )}

            {/* Three-level hierarchy */}
            {(hasSessions || pendingSolvesArr.length > 0) && (
              <>
                {/* Pending solves with no session yet (very first solve, no activeSessionId) */}
                {pendingSolvesArr.filter(p => p.optimisticSessionId === null).map(pending => (
                  <div key={pending.nonce} className="flex items-center gap-2 px-3 py-2 opacity-50">
                    <div className="h-[6px] w-[6px] flex-shrink-0 animate-pulse rounded-full bg-zinc-500" />
                    <span className="truncate text-[13px] italic text-zinc-500">solving…</span>
                  </div>
                ))}

                {/* Time bucket sections */}
                {(Object.keys(BUCKET_LABELS) as BucketKey[]).map(bucketKey => {
                  const sessionsInBucket = buckets[bucketKey];
                  if (sessionsInBucket.length === 0) return null;
                  const isBucketExpanded = sState.expandedBuckets[bucketKey];
                  return (
                    <div key={bucketKey} className="mb-1">
                      {/* Bucket header row */}
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); dispatch({ type: 'TOGGLE_BUCKET', bucketKey }); }}
                        className="flex w-full items-center gap-1.5 px-3 py-1 text-[10px] uppercase tracking-wider text-zinc-600 transition-colors hover:text-zinc-400"
                      >
                        <svg
                          width="7" height="7" viewBox="0 0 8 8" fill="currentColor"
                          className={`flex-shrink-0 transition-transform duration-150 ${isBucketExpanded ? 'rotate-90' : ''}`}
                        >
                          <polygon points="2,1 6,4 2,7" />
                        </svg>
                        <span>{BUCKET_LABELS[bucketKey]}</span>
                      </button>

                      {isBucketExpanded && (
                        <>
                          {/* Session rows */}
                          {sessionsInBucket.map(session => {
                            const sessionSolves = getSessionSolves(sState, session.id);
                            const isSessionOpen = isSessionExpanded(sState, session.id);
                            const pendingForSession = pendingSolvesArr.filter(p => p.optimisticSessionId === session.id);
                            const isRenaming = renamingSessionId === session.id;
                            return (
                              <div key={session.id}>
                                {/* Session header row */}
                                <div className={`group relative flex items-center px-3 py-1.5 transition-colors hover:bg-white/[0.03] ${sState.activeSessionId === session.id ? 'bg-white/[0.04]' : ''}`}>
                                  {/* Expand/collapse chevron — mirrors bucket header disclosure */}
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); dispatch({ type: 'TOGGLE_SESSION', sessionId: session.id }); }}
                                    className="mr-1.5 flex-shrink-0 p-0.5 text-zinc-600 transition-colors hover:text-zinc-400"
                                    title={isSessionOpen ? 'Collapse' : 'Expand'}
                                  >
                                    <svg
                                      width="7" height="7" viewBox="0 0 8 8" fill="currentColor"
                                      className={`transition-transform duration-150 ${isSessionOpen ? 'rotate-90' : ''}`}
                                    >
                                      <polygon points="2,1 6,4 2,7" />
                                    </svg>
                                  </button>
                                  {/* Batch session icon */}
                                  {session.source === 'batch' && (
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="mr-1.5 flex-shrink-0 text-zinc-500">
                                      <polygon points="12 2 2 7 12 12 22 7 12 2" />
                                      <polyline points="2 17 12 22 22 17" />
                                      <polyline points="2 12 12 17 22 12" />
                                    </svg>
                                  )}
                                  {/* Session name / rename input — click activates this session */}
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); handleActivateSession(session.id); }}
                                    className="min-w-0 flex-1 text-left"
                                    title="Activate session — new solves attach here"
                                  >
                                    {isRenaming ? (
                                      <input
                                        autoFocus
                                        value={renameInput}
                                        onChange={(e) => setRenameInput(e.target.value)}
                                        onKeyDown={async (e) => {
                                          if (e.key === 'Enter') {
                                            e.preventDefault();
                                            const trimmed = renameInput.trim();
                                            if (trimmed && trimmed.length <= 200) {
                                              const { data: sd } = await supabase.auth.getSession();
                                              const hdrs: Record<string, string> = { 'X-Session-Id': getSessionId() };
                                              if (sd.session?.access_token) hdrs['Authorization'] = `Bearer ${sd.session.access_token}`;
                                              axios.patch(`${API_URL}/sessions/${session.id}/rename`, { name: trimmed }, { headers: hdrs })
                                                .then(() => dispatch({ type: 'SESSION_RENAMED', sessionId: session.id, name: trimmed }))
                                                .catch(console.warn);
                                            }
                                            setRenamingSessionId(null);
                                          }
                                          if (e.key === 'Escape') { e.stopPropagation(); setRenamingSessionId(null); }
                                        }}
                                        onBlur={() => setRenamingSessionId(null)}
                                        onClick={(e) => e.stopPropagation()}
                                        className="w-full bg-transparent text-[13px] text-zinc-200 outline-none"
                                      />
                                    ) : (
                                      <span className="block truncate text-[13px] text-zinc-300">
                                        {session.name || 'Unnamed session'}
                                      </span>
                                    )}
                                  </button>
                                  {/* Solve count badge */}
                                  {!isRenaming && (
                                    <span className="ml-1 flex-shrink-0 text-[11px] text-zinc-600">{session.solve_count}</span>
                                  )}
                                  {/* Pencil rename button — revealed on row hover */}
                                  {!isRenaming && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setRenamingSessionId(session.id);
                                        setRenameInput(session.name || '');
                                      }}
                                      className="ml-1 hidden flex-shrink-0 rounded p-0.5 text-zinc-600 transition hover:text-zinc-300 group-hover:block"
                                      title="Rename session"
                                    >
                                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M12 20h9" />
                                        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
                                      </svg>
                                    </button>
                                  )}
                                </div>

                                {/* Solve rows under session */}
                                {isSessionOpen && (
                                  <div>
                                    {/* Pending solves for this session */}
                                    {pendingForSession.map(pending => (
                                      <div key={pending.nonce} className="flex items-center gap-2 py-1.5 pl-6 pr-3 opacity-50">
                                        <div className="h-[6px] w-[6px] flex-shrink-0 animate-pulse rounded-full bg-zinc-500" />
                                        <span className="truncate text-[13px] italic text-zinc-500">solving…</span>
                                      </div>
                                    ))}
                                    {/* Real solve rows */}
                                    {sessionSolves.map(solve => {
                                      const isActiveSolve = sState.displayedSolveId === solve.id;
                                      return (
                                        <button
                                          key={solve.id}
                                          type="button"
                                          onClick={(e) => { e.stopPropagation(); loadHistoricalSolve(solve.id); }}
                                          className={`flex w-full items-start gap-2 py-1.5 pl-6 pr-3 text-left transition-colors ${isActiveSolve ? 'bg-white/[0.05]' : 'hover:bg-white/[0.03]'}`}
                                        >
                                          <span className={`mt-[5px] h-[6px] w-[6px] flex-shrink-0 rounded-full ${badgeDotColor(solve.badge)}`} />
                                          <div className="min-w-0 flex-1">
                                            <p className="truncate text-[13px] text-zinc-300">{solve.raw_input_preview}</p>
                                            <p className="text-[11px] text-zinc-600">{relativeTime(solve.created_at)}</p>
                                          </div>
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </>
                      )}
                    </div>
                  );
                })}

                {/* Sign-in prompt for anon users who have sessions */}
                {!user && sState.loadStatus === 'loaded' && hasSessions && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setShowAuthModal(true); setAuthSent(false); setAuthEmail(''); setAuthError(null); }}
                    className="mx-3 mt-2 block w-[calc(100%-24px)] rounded-md bg-zinc-900 px-3 py-1.5 text-center text-[12px] text-zinc-500 transition-colors hover:text-zinc-300"
                  >
                    Sign in to sync sessions →
                  </button>
                )}
              </>
            )}
          </div>
        ) : (
          // Collapsed sidebar: spacer ensures bottom items remain at the bottom
          <div className="flex-1 min-h-0" />
        )}

        {/* Bottom items (flex-shrink-0 — no mt-auto; sessions flex-1 pushes these down naturally) */}
        <div className="flex-shrink-0 space-y-1 border-t border-white/[0.06] pt-3">
          {user ? (
            <div className={`${sidebarOpen ? 'px-3' : 'px-0'}`}>
              {sidebarOpen && (
                <p className="truncate pb-1 text-[12px] text-zinc-600">{user.email}</p>
              )}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleSignOut(); }}
                className={`flex w-full items-center rounded-md py-2 text-[14px] text-zinc-500 transition-colors hover:bg-white/[0.03] hover:text-zinc-300 ${sidebarOpen ? 'gap-3' : 'justify-center'}`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                {sidebarOpen && <span>Sign out</span>}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setShowAuthModal(true); setAuthSent(false); setAuthEmail(''); setAuthError(null); }}
              className={`flex w-full items-center rounded-md py-2 text-[14px] text-zinc-500 transition-colors hover:bg-white/[0.03] hover:text-zinc-300 ${sidebarOpen ? 'gap-3 px-3' : 'justify-center px-0'}`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              {sidebarOpen && <span>Profile</span>}
            </button>
          )}
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            className={`flex w-full items-center rounded-md py-2 text-[14px] text-zinc-500 transition-colors hover:bg-white/[0.03] hover:text-zinc-300 ${sidebarOpen ? 'gap-3 px-3' : 'justify-center px-0'}`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            {sidebarOpen && <span>Settings</span>}
          </button>
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            className={`flex w-full items-center rounded-md py-2 text-[14px] text-zinc-500 transition-colors hover:bg-white/[0.03] hover:text-zinc-300 ${sidebarOpen ? 'gap-3 px-3' : 'justify-center px-0'}`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            {sidebarOpen && <span>Help</span>}
          </button>
        </div>

        {/* Corner accent — crosshatch pattern fading from bottom-left */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-0 left-0 h-20 w-20"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='10' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 10L10 0' stroke='rgba(255,255,255,0.07)' stroke-width='0.5'/%3E%3C/svg%3E")`,
            backgroundSize: '10px 10px',
            maskImage: 'radial-gradient(ellipse at bottom left, black 30%, transparent 80%)',
            WebkitMaskImage: 'radial-gradient(ellipse at bottom left, black 30%, transparent 80%)',
          }}
        />
      </aside>

      {/* Session Tab — top-center, always visible */}
      {(() => {
        const displayedSession = sState.displayedSessionId
          ? sState.sessionsById[sState.displayedSessionId]
          : null;
        const displayedSolves = sState.displayedSessionId
          ? getSessionSolves(sState, sState.displayedSessionId)
          : [];
        const showArrows = displayedSolves.length >= 2;
        const currentIdx = sState.displayedSolveId
          ? displayedSolves.findIndex(s => s.id === sState.displayedSolveId)
          : -1;
        const isOldest = currentIdx === displayedSolves.length - 1;
        const isNewest = currentIdx === 0;

        return (
          <div
            className="fixed top-0 z-[26] flex h-9 items-center gap-1.5"
            style={{
              left: `calc(50% + ${contentOffset}px)`,
              transform: 'translateX(-50%)',
              transition: 'left 200ms',
            }}
          >
            {/* Prev (older) arrow — outside the notch, mounts/unmounts independently */}
            <AnimatePresence>
              {showArrows && (
                <motion.button
                  key="prev-arrow"
                  type="button"
                  disabled={isOldest}
                  onClick={() => handleTabNav('prev')}
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.85 }}
                  transition={{ duration: 0.15 }}
                  className="flex h-6 w-6 items-center justify-center rounded text-zinc-600 transition-colors hover:text-zinc-300 disabled:cursor-not-allowed disabled:opacity-25"
                  aria-label="Older solve"
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M6.5 2L3.5 5L6.5 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </motion.button>
              )}
            </AnimatePresence>

            {/* Notch — opaque, flush to top edge, bottom corners only */}
            <motion.div
              layout
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="relative flex h-9 min-w-[120px] max-w-[260px] items-center justify-center rounded-b-lg border-x border-b border-white/[0.08] bg-zinc-900 px-3"
            >
              <AnimatePresence mode="wait" initial={false}>
                {!displayedSession ? (
                  <motion.span
                    key="watermark"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className={`${dmSerifDisplay.className} select-none text-[14px] text-white`}
                  >
                    Ergo.
                  </motion.span>
                ) : (
                  <motion.span
                    key="title"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="truncate text-[12px] text-zinc-400"
                  >
                    {displayedSession.name || '—'}
                  </motion.span>
                )}
              </AnimatePresence>

              {/* tabMicrocopy — one-shot transient annotation */}
              <AnimatePresence>
                {sState.tabMicrocopy === 'started_new_session' && (
                  <motion.span
                    key="microcopy"
                    initial={{ opacity: 0, y: -2 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] text-zinc-600"
                  >
                    new session
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.div>

            {/* Next (newer) arrow — outside the notch, mounts/unmounts independently */}
            <AnimatePresence>
              {showArrows && (
                <motion.button
                  key="next-arrow"
                  type="button"
                  disabled={isNewest}
                  onClick={() => handleTabNav('next')}
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.85 }}
                  transition={{ duration: 0.15 }}
                  className="flex h-6 w-6 items-center justify-center rounded text-zinc-600 transition-colors hover:text-zinc-300 disabled:cursor-not-allowed disabled:opacity-25"
                  aria-label="Newer solve"
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M3.5 2L6.5 5L3.5 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        );
      })()}

      {/* Sticky answer bar — appears when answer box scrolls out of view */}
      {artifact && (
        <div
          className={`fixed top-9 right-0 z-[25] h-9 transition-all duration-300 ${
            showStickyBar
              ? 'translate-y-0 opacity-100 pointer-events-auto'
              : '-translate-y-full opacity-0 pointer-events-none'
          }`}
          style={{ left: sidebarWidth }}
        >
          <div className="flex h-full items-center gap-3 bg-zinc-950/75 px-6 shadow-sm">
            {/* Color bar: verification state */}
            <div
              className="h-4 w-[2px] flex-shrink-0 rounded-full"
              style={{
                backgroundColor:
                  splitKind === 'confirmed' ? '#34d399' :
                  splitKind === 'discrepancy' ? '#fbbf24' :
                  '#3f3f46',
              }}
            />
            {/* Label */}
            <span className="flex-shrink-0 text-[10px] uppercase tracking-widest text-zinc-500">
              Solution
            </span>
            {/* Separator dot */}
            <span className="flex-shrink-0 text-[10px] text-zinc-700">·</span>
            {/* Final answer — guarded against leaked JSON from model parse failures */}
            <div className="min-w-0 flex-1 overflow-hidden whitespace-nowrap [&_.katex]:text-[0.82em] [&_.katex-display]:inline [&_.katex-display>span]:inline">
              {(() => {
                const lat = artifact.solution.final_answer_latex;
                const safe = typeof lat === 'string' && lat.length > 0
                  && !lat.trim().startsWith('{') && !lat.trim().startsWith('[');
                return safe
                  ? <InlineMath math={lat} />
                  : <span className="text-zinc-500 text-[0.82em]">—</span>;
              })()}
            </div>
            {/* Badge pill */}
            <div
              className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] ${
                splitKind === 'confirmed'
                  ? 'bg-emerald-500/10 text-emerald-400'
                  : splitKind === 'discrepancy'
                  ? 'bg-amber-500/10 text-amber-400'
                  : 'bg-zinc-700/40 text-zinc-400'
              }`}
            >
              {splitKind === 'confirmed'
                ? 'Confirmed'
                : splitKind === 'discrepancy'
                ? 'Discrepancy'
                : artifact.verification?.badge === 'not_verified'
                ? 'Not verified'
                : 'Checked'}
            </div>
          </div>
        </div>
      )}

      {/* Slogan — fixed, visible in idle state only, centered in content area */}
      <div
        className={`pointer-events-none fixed z-10 text-center transition-opacity duration-[380ms] ease-out ${isActive ? 'opacity-0' : 'opacity-100'}`}
        style={{ top: '42vh', left: `calc(50% + ${contentOffset}px)`, transform: 'translateX(-50%) translateY(-50%)' }}
      >
        <p className={`${dmSerifDisplay.className} text-2xl text-zinc-300`}>
          The answer, and the proof.
        </p>
        {/* Line motif — centers the slogan visually */}
        <div className="mx-auto mt-3 h-px w-8 rounded-full bg-white/20" />
      </div>

      {/* Scrollable content — margin clears the fixed left panel; pt-20 clears session tab + sticky bar */}
      <div className="relative z-10 px-6 pt-20 pb-[280px]" style={{ marginLeft: sidebarWidth, transition: 'margin-left 200ms' }}>

        {/* Dot pattern — content area only */}
        <div
          aria-hidden="true"
          className={`pointer-events-none fixed bottom-0 right-0 transition-opacity duration-[380ms] ease-out ${isActive ? 'opacity-0' : 'opacity-100'}`}
          style={{
            top: 0,
            left: sidebarWidth,
            transition: 'left 200ms',
            zIndex: 5,
            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.18) 1px, transparent 1px)',
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
              <div ref={answerBoxRef} className="group mb-1 rounded-[24px] border border-white/[0.08] bg-white/[0.04] px-6 py-5">
                <div className="mb-2 text-xs uppercase tracking-[0.18em] text-zinc-500">Final Answer</div>

                {/* Centered answer OR in-box split (discrepancy or confirmed) — or animated wedge */}
                {!wedgeActive ? (
                  // Static display: single-column before wedge, or split after wedge is done
                  splitKind === null ? (
                    <div className="my-4 flex justify-center [&_.katex]:text-[1.4em]">
                      <BlockMath math={artifact.solution.final_answer_latex} />
                    </div>
                  ) : (
                    <>
                      {/* Header strip — amber for discrepancy, emerald for confirmed */}
                      <div className={`mt-4 mb-3 rounded-[8px] px-4 py-2 text-[10px] font-medium uppercase tracking-[0.16em] ${splitKind === 'confirmed' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
                        {splitKind === 'confirmed' ? '✓ Confirmed' : '⚠ Discrepancy Detected'}
                      </div>
                      {/* Two-column comparison */}
                      <div className={`relative flex items-center ${shouldGhost ? 'border-b border-white/[0.06] pb-3' : ''}`}>
                        <div className="flex min-h-[140px] flex-1 flex-col items-center justify-center px-5 py-4 text-center">
                          <div className="mb-2 text-[10px] uppercase tracking-[0.16em] text-zinc-500">Primary solution</div>
                          <div className="[&_.katex]:text-[1.1em]">
                            <BlockMath math={artifact.solution.final_answer_latex} />
                          </div>
                        </div>
                        <div className={`flex w-10 shrink-0 items-center justify-center self-center text-lg ${splitKind === 'confirmed' ? 'text-emerald-400' : 'text-amber-400'}`}>
                          {splitKind === 'confirmed' ? '=' : (artifact.mode === 'math' ? '≠' : '!')}
                        </div>
                        <div className="flex min-h-[140px] flex-1 flex-col items-center justify-center px-5 py-4 text-center">
                          <div className="mb-2 text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                            {artifact.mode === 'math' ? 'Wolfram Alpha' : 'Alternate method'}
                          </div>
                          {artifact.mode === 'math' ? (
                            <KaTeXBoundary
                              fallback={
                                wolframDisplay
                                  ? <span className={`${jetbrainsMono.className} text-sm text-zinc-300`}>{wolframDisplay}</span>
                                  : <span className="text-sm italic text-zinc-500">Result unavailable</span>
                              }
                            >
                              {wolframDisplay
                                ? <div className="[&_.katex]:text-[1.1em]"><BlockMath math={wolframDisplay} /></div>
                                : <span className="text-sm italic text-zinc-500">Result unavailable</span>
                              }
                            </KaTeXBoundary>
                          ) : (
                            advancedVerifResult?.audit?.audit_answer ? (
                              <>
                                <span className={`${jetbrainsMono.className} text-sm text-zinc-300`}>
                                  {advancedVerifResult.audit.audit_answer}
                                </span>
                                {advancedVerifResult.audit.method && (
                                  <div className="mt-2 text-xs text-zinc-500">{advancedVerifResult.audit.method}</div>
                                )}
                              </>
                            ) : (
                              <span className="text-sm italic text-zinc-500">Result unavailable</span>
                            )
                          )}
                        </div>
                      </div>
                      <div className="mt-2 flex">
                        <div className="flex-1 text-center text-[10px] text-zinc-600">via deterministic check</div>
                        <div className="w-10 shrink-0" />
                        <div className="flex-1 text-center text-[10px] text-zinc-600">via CAS</div>
                      </div>
                    </>
                  )
                ) : (
                  // Animated wedge layout — active during and after animation
                  <div className="relative mt-4" style={{ minHeight: '180px' }}>

                    {/* Animated header strip */}
                    <AnimatePresence>
                      {wedgeShowHeader && splitKind === 'discrepancy' && (
                        <motion.div
                          initial={{ y: '-100%', opacity: 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          exit={{ y: '-100%', opacity: 0 }}
                          transition={{ duration: 0.2, ease: 'easeOut' }}
                          className="mb-3 rounded-[8px] bg-amber-500/10 px-4 py-2 text-[10px] font-medium uppercase tracking-[0.16em] text-amber-200"
                        >
                          ⚠ Discrepancy Detected
                        </motion.div>
                      )}
                      {wedgeShowHeader && splitKind === 'confirmed' && (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="mb-3 rounded-[8px] bg-emerald-500/10 px-4 py-2 text-[10px] font-medium uppercase tracking-[0.16em] text-emerald-400"
                        >
                          ✓ Confirmed
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Two-column body */}
                    <div className="relative flex items-center">

                      {/* LEFT — answer slides via Framer Motion layout */}
                      <motion.div
                        layout
                        transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                        className={`flex flex-col items-center text-center ${wedgeLineDrawn ? 'w-1/2 pr-4' : 'w-full'}`}
                      >
                        {wedgeLineDrawn && (
                          <div className="mb-2 text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                            Primary solution
                          </div>
                        )}
                        <div className="overflow-x-auto [&_.katex]:text-[1.4em]">
                          <BlockMath math={artifact.solution.final_answer_latex} />
                        </div>
                        {wedgeLineDrawn && (
                          <div className="mt-2 text-[11px] text-zinc-500">via deterministic check</div>
                        )}
                      </motion.div>

                      {/* DIVIDER LINE + SYMBOL */}
                      {wedgeLineDrawn && (
                        <div
                          className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2"
                          style={{ width: '1px', zIndex: 1 }}
                        >
                          <div
                            className="absolute inset-0"
                            style={{
                              background: wedgeShowResult
                                ? 'rgba(255,255,255,0.08)'
                                : 'rgba(245,158,11,0.4)',
                              transform: wedgeLineDrawn ? 'scaleY(1)' : 'scaleY(0)',
                              transformOrigin: 'top',
                              transition: 'transform 300ms ease-out, background 200ms ease-in 100ms',
                            }}
                          />
                          <AnimatePresence>
                            {wedgeShowResult && splitKind !== null && (
                              <motion.div
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.8 }}
                                transition={{ duration: 0.2, delay: 0.05 }}
                                className="absolute left-1/2 top-1/2 z-10 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-zinc-900"
                              >
                                <span className={`text-base font-bold ${splitKind === 'discrepancy' ? 'text-amber-400' : 'text-emerald-400'}`}>
                                  {splitKind === 'discrepancy'
                                    ? (artifact.mode === 'math' ? '≠' : '!')
                                    : '='}
                                </span>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      )}

                      {/* RIGHT COLUMN */}
                      {wedgeLineDrawn && (
                        <div className="flex min-h-[120px] w-1/2 flex-col justify-center pl-4">
                          <AnimatePresence>
                            {!wedgeShowResult && (
                              <motion.div
                                initial={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="flex flex-col gap-2"
                              >
                                {WEDGE_MESSAGES.slice(0, wedgeVisibleMessages).map((msg, i) => (
                                  <motion.div
                                    key={i}
                                    initial={{ opacity: 0, y: 4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.2, ease: 'easeOut' }}
                                    className="flex items-center gap-2 text-[13px] text-zinc-400"
                                  >
                                    <div className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-zinc-500" />
                                    {msg}
                                  </motion.div>
                                ))}
                              </motion.div>
                            )}
                          </AnimatePresence>

                          <AnimatePresence>
                            {wedgeShowResult && splitKind !== null && (
                              <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ duration: 0.2 }}
                                className="flex flex-col items-center text-center"
                              >
                                <div className="mb-2 text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                                  {artifact.mode === 'math' ? 'Wolfram Alpha' : 'Alternate method'}
                                </div>
                                <div className="overflow-x-auto">
                                  {artifact.mode === 'math' ? (
                                    <KaTeXBoundary
                                      fallback={
                                        wolframDisplay
                                          ? <span className={`${jetbrainsMono.className} text-sm text-zinc-300`}>{wolframDisplay}</span>
                                          : <span className="text-sm italic text-zinc-500">Result unavailable</span>
                                      }
                                    >
                                      {wolframDisplay
                                        ? <div className="[&_.katex]:text-[1.1em]"><BlockMath math={wolframDisplay} /></div>
                                        : <span className="text-sm italic text-zinc-500">Result unavailable</span>
                                      }
                                    </KaTeXBoundary>
                                  ) : (
                                    advancedVerifResult?.audit?.audit_answer ? (
                                      <>
                                        <span className={`${jetbrainsMono.className} text-sm text-zinc-300`}>
                                          {advancedVerifResult.audit.audit_answer}
                                        </span>
                                        {advancedVerifResult.audit.method && (
                                          <div className="mt-2 text-xs text-zinc-500">
                                            {advancedVerifResult.audit.method}
                                          </div>
                                        )}
                                      </>
                                    ) : (
                                      <span className="text-sm italic text-zinc-500">Result unavailable</span>
                                    )
                                  )}
                                </div>
                                <div className="mt-2 text-[11px] text-zinc-500">
                                  {artifact.mode === 'math' ? 'via CAS' : 'via cross-method audit'}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Badge — hidden while wedge animating, or when split is showing */}
                {(!wedgeActive || (wedgePhase === 'done' && splitKind === null)) && (
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
                )}

                {/* One-line verification summary — hidden once advanced verification runs or while one is in flight */}
                {artifact.verification.user_reason && !advancedVerifResult && !wedgeActive && (
                  <div className="mt-3 text-sm leading-6 text-zinc-300">
                    {artifact.verification.user_reason}
                  </div>
                )}

                {/* Re-verification note — shown when a historical solve's badge changed on load */}
                {revalidationNote && (
                  <p className="mt-2 text-[12px] text-zinc-500">
                    Re-verified {new Date(revalidationNote.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} under engine {revalidationNote.version}.
                  </p>
                )}

                {/* Action cluster — always visible, never ghosts */}
                <div className={`flex items-center gap-3 text-xs text-zinc-500 ${
                  shouldGhost ? 'mt-0 border-t border-white/[0.06] pt-3' : 'mt-4'
                }`}>
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
                    disabled={advancedVerifFired || advancedVerifLoading}
                    className={`transition ${
                      advancedVerifFired
                        ? 'opacity-40 cursor-not-allowed pointer-events-none'
                        : 'hover:text-zinc-200'
                    }`}
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

                {/* Unavailable note — shown only when advanced verification ran but returned no verdict */}
                {advancedVerifResult && !advancedVerifLoading && splitKind === null && wedgePhase === 'done' && (
                  <p className="mt-2 text-[12px] text-zinc-500">External check unavailable for this expression.</p>
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
                {displayedSuggestions.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {displayedSuggestions.map((s, i) => (
                      <button
                        key={`${s.action}-${i}`}
                        type="button"
                        onClick={() => handleSuggestion(s.action)}
                        className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.10] bg-white/[0.05] px-3 py-1.5 text-xs text-zinc-300 transition hover:bg-white/[0.07] hover:border-white/[0.18] hover:text-zinc-100"
                      >
                        {getSuggestionIcon(s.action)}
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

              {/* Overview — caption below answer box */}
              {artifact.solution.overview && (
                <p className="mt-3 px-1 text-[14px] leading-6 font-medium text-zinc-200">
                  {artifact.solution.overview}
                </p>
              )}

              {/* Overview → sections separator */}
              {artifact.solution.overview && artifact.solution.sections?.length > 0 && (
                <div className="mt-4 mb-2 h-px bg-white/[0.05]" />
              )}

              {/* Solution sections — connected proof layout */}
              <div className="relative ml-4 mt-2">
                {/* Vertical connector line */}
                <div className="absolute left-0 top-2 bottom-2 w-px bg-white/[0.08]" />

                {artifact.solution.sections.map((sec, i) => {
                  const isOpen = openExplainIndex === i;

                  return (
                    <div key={i} className="relative pl-8 pb-8 last:pb-0">
                      {/* Step dot on the line */}
                      <div className="absolute left-[-3px] top-[6px] h-[7px] w-[7px] rounded-full bg-zinc-700 ring-1 ring-zinc-900" />

                      <div className="space-y-2">
                        <h3 className="text-[15px] font-medium leading-snug text-zinc-100">
                          {sec.title}
                        </h3>

                        {sec.explanation && (
                          <p className="max-w-[850px] text-[14px] leading-6 text-zinc-300">
                            {sec.explanation}
                          </p>
                        )}

                        {sec.summary_latex && (
                          <div className="overflow-x-auto py-2 pl-4 border-l border-white/[0.06] [&_.katex]:text-[1.05em]">
                            <BlockMath math={sec.summary_latex} />
                          </div>
                        )}

                        {isOpen && sec.concept && (
                          <p className="text-[12px] leading-5 text-zinc-500 italic">
                            {sec.concept}
                          </p>
                        )}

                        {sec.concept && (
                          <button
                            type="button"
                            onClick={() => setOpenExplainIndex(isOpen ? null : i)}
                            className="text-[11px] text-zinc-600 transition hover:text-zinc-400"
                          >
                            {isOpen ? 'Hide concept' : 'Why this works'}
                          </button>
                        )}
                      </div>

                      {/* Partial right-side separator — whisper-level, not on last step */}
                      {i < artifact.solution.sections.length - 1 && (
                        <div
                          className="absolute bottom-0 right-0 h-px bg-white/[0.07]"
                          style={{ width: 'calc(100% / 6)' }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>

            </div>
          )}

        </section>
      </div>

      {/* Floating Input Composer — centered in content area (right of sidebar panel) */}
      <div
        className="fixed"
        style={{
          left: `calc(50% + ${contentOffset}px)`,
          transform: 'translateX(-50%)',
          bottom: isActive ? 0 : '32vh',
          width: isActive ? `calc(100% - ${sidebarWidth}px)` : '700px',
          zIndex: isActive ? 20 : 10,
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
          {/* Mode tabs — dim when solution is displayed, full on hover */}
          <div
            className="relative z-20 mb-3 flex items-center gap-5 pl-4 transition-opacity duration-200"
            style={{ opacity: loading ? 0.4 : artifact ? 0.4 : 1 }}
            onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.opacity = '1'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.opacity = loading ? '0.4' : artifact ? '0.4' : '1'; }}
          >
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
            className="relative z-10 rounded-[26px] border bg-zinc-900 shadow-[0_8px_40px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.04)] backdrop-blur-xl transition-colors duration-150"
            style={{
              borderColor: isDraggingOver
                ? 'rgba(255,255,255,0.20)'
                : interactiveMode
                  ? 'rgba(255,255,255,0.20)'
                  : 'rgba(255,255,255,0.10)',
            }}
            onDragOver={(e) => {
              e.preventDefault();
              if (Array.from(e.dataTransfer.types).includes('Files')) {
                setIsDraggingOver(true);
              }
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setIsDraggingOver(false);
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              setIsDraggingOver(false);
              acquireFile(e, {
                acceptedTypes: COMPOSER_ACCEPTED_TYPES,
                onValid: handleImageFile,
                onError: (msg) => setExtractError(msg),
              });
            }}
          >
            {/* Drop zone overlay */}
            {isDraggingOver && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-[26px] border border-dashed border-white/20 bg-zinc-950/95 pointer-events-none">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-2 text-zinc-400">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <p className="text-[13px] text-zinc-400">Drop image here</p>
                <p className="mt-1 text-[11px] text-zinc-600">Math problems will be extracted automatically</p>
              </div>
            )}

            {/* Disambiguation UI — shown when multiple problems extracted */}
            {extractedProblems !== null ? (
              <div className="px-4 py-3">
                <p className="mb-3 text-[13px] text-zinc-400">
                  Found {extractedProblems.length} problems — which one would you like to solve?
                </p>
                <div className="space-y-2">
                  {extractedProblems.map((problem, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => { setQuestion(problem); setExtractedProblems(null); }}
                      className="w-full rounded-[12px] border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-left text-[13px] text-zinc-200 transition hover:bg-white/[0.06] hover:border-white/[0.14]"
                    >
                      {problem}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setExtractedProblems(null)}
                  className="mt-3 text-[12px] text-zinc-600 transition hover:text-zinc-400"
                >
                  Cancel
                </button>
              </div>
            ) : (
              /* Textarea */
              <textarea
                ref={textareaRef}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={(e) => {
                  const items = e.clipboardData?.items;
                  if (!items) return;
                  const hasImage = Array.from(items).some((item) =>
                    COMPOSER_ACCEPTED_TYPES.some((t) => item.type === t)
                  );
                  if (hasImage) {
                    e.preventDefault();
                    acquireFile(e, {
                      acceptedTypes: COMPOSER_ACCEPTED_TYPES,
                      onValid: handleImageFile,
                      onError: (msg) => setExtractError(msg),
                    });
                  }
                }}
                disabled={loading}
                placeholder={ghostQuestion || examples[exampleIndex]}
                rows={3}
                className="block w-full resize-none bg-transparent px-5 pb-2 pt-4 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none disabled:cursor-not-allowed disabled:opacity-50"
              />
            )}

            {/* Toolbar row */}
            <div className="flex items-center justify-between px-3 pb-3">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={imageExtracting || loading}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
                  title="Extract problem from image"
                >
                  {imageExtracting ? (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin">
                      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                    </svg>
                  ) : (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
                    </svg>
                  )}
                </button>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  onChange={handleImageUpload}
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

        {/* Extract error — inline, auto-clears after 4s */}
        {extractError && (
          <p className="mt-2 px-1 text-[12px] text-zinc-500">{extractError}</p>
        )}
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

      {/* Sign-in modal */}
      <AnimatePresence>
        {showAuthModal && (
          <motion.div
            key="auth-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => setShowAuthModal(false)}
          >
            <motion.div
              key="auth-modal"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="w-[360px] rounded-xl border border-white/[0.08] bg-zinc-950 p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className={`${dmSerifDisplay.className} mb-1 text-[22px] text-white`}>Ergo.</h2>
              <p className="mb-5 text-[13px] text-zinc-400">Sign in to save your solves and view history.</p>

              {authSent ? (
                <div className="rounded-md border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-[13px] text-zinc-300">
                  Check your email — a magic link has been sent to <span className="text-white">{authEmail}</span>.
                </div>
              ) : (
                <form onSubmit={handleSignIn}>
                  <input
                    type="email"
                    required
                    placeholder="your@email.com"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    className="mb-3 w-full rounded-md border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[14px] text-white placeholder-zinc-600 outline-none focus:border-white/20"
                  />
                  <button
                    type="submit"
                    disabled={authLoading}
                    className="w-full rounded-md bg-white px-3 py-2 text-[14px] font-medium text-zinc-950 transition hover:bg-zinc-100 disabled:opacity-50"
                  >
                    {authLoading ? 'Sending…' : 'Send magic link'}
                  </button>
                </form>
              )}

              {authError && (
                <p className="mt-3 rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-[12px] text-red-400">
                  {authError}
                </p>
              )}

              <button
                type="button"
                onClick={() => setShowAuthModal(false)}
                className="mt-4 w-full text-center text-[12px] text-zinc-600 transition hover:text-zinc-400"
              >
                Cancel
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Batch modal — Stages: input, review — Pro-only */}
      <AnimatePresence>
        {BATCH_UI_ENABLED && (batchStage === 'input' || batchStage === 'review') && (
          <motion.div
            key="batch-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm"
            onClick={() => setBatchStage('idle')}
          >
            <motion.div
              key="batch-modal"
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.15 }}
              className="w-full max-w-[640px] max-h-[85vh] flex flex-col overflow-hidden rounded-xl border border-white/[0.08] bg-zinc-950 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
              onPaste={(e) => {
                const items = e.clipboardData?.items;
                if (!items) return;
                const hasBatchFile = Array.from(items).some((item) =>
                  typeMatches(item.type, BATCH_ACCEPTED_TYPES)
                );
                if (hasBatchFile) {
                  e.preventDefault();
                  acquireFile(e, {
                    acceptedTypes: BATCH_ACCEPTED_TYPES,
                    onValid: handleBatchFileAcquired,
                    onError: (msg) => setBatchExtractError(msg),
                  });
                }
              }}
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-4">
                <div>
                  <h2 className="text-[15px] font-medium text-white">
                    {batchStage === 'input' ? 'Batch solve' : `Review problems (${batchDraftProblems.length})`}
                  </h2>
                  {batchStage === 'input' && (
                    <p className="mt-0.5 text-[12px] text-zinc-500">Submit a problem set — we'll split and solve each problem individually.</p>
                  )}
                </div>
                <button type="button" onClick={closeBatchModal} className="rounded p-1 text-zinc-600 hover:text-zinc-300">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              {/* Stage 1: Input */}
              {batchStage === 'input' && (
                <div className="flex-1 overflow-y-auto p-6">
                  {/* Mode + Input type selectors */}
                  <div className="mb-4 flex items-center gap-4">
                    <div className="flex gap-2">
                      {(['math', 'physics'] as Mode[]).map(m => (
                        <button key={m} type="button" onClick={() => setBatchMode(m)}
                          className={`rounded-md px-3 py-1 text-[13px] transition-colors ${batchMode === m ? 'bg-white text-zinc-950' : 'bg-white/[0.06] text-zinc-400 hover:text-zinc-200'}`}>
                          {m.charAt(0).toUpperCase() + m.slice(1)}
                        </button>
                      ))}
                    </div>
                    <div className="ml-auto flex gap-2">
                      {(['text', 'document'] as const).map(t => (
                        <button key={t} type="button" onClick={() => setBatchInputType(t)}
                          className={`rounded-md px-3 py-1 text-[13px] transition-colors ${batchInputType === t ? 'bg-white/[0.10] text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>
                          {t === 'text' ? 'Paste text' : 'Upload file'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {batchInputType === 'text' ? (
                    <textarea
                      value={batchText}
                      onChange={e => setBatchText(e.target.value)}
                      placeholder="Paste your problem set here. We'll split them automatically."
                      rows={8}
                      className="w-full resize-none rounded-md border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-[14px] text-zinc-200 placeholder-zinc-600 outline-none focus:border-white/20"
                    />
                  ) : (
                    <div
                      className={`flex h-32 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed transition-colors ${batchIsDraggingOver ? 'border-white/30 bg-white/[0.04]' : 'border-white/[0.12] bg-white/[0.02] hover:border-white/20'}`}
                      onClick={() => document.getElementById('batch-file-input')?.click()}
                      onDragOver={(e) => {
                        e.preventDefault();
                        if (Array.from(e.dataTransfer.types).includes('Files')) setBatchIsDraggingOver(true);
                      }}
                      onDragLeave={(e) => {
                        if (!e.currentTarget.contains(e.relatedTarget as Node)) setBatchIsDraggingOver(false);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        setBatchIsDraggingOver(false);
                        acquireFile(e, {
                          acceptedTypes: BATCH_ACCEPTED_TYPES,
                          onValid: handleBatchFileAcquired,
                          onError: (msg) => setBatchExtractError(msg),
                        });
                      }}
                    >
                      <input
                        id="batch-file-input"
                        type="file"
                        accept=".pdf,.docx,.jpg,.jpeg,.png,.webp"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          e.target.value = '';
                          acquireFile(file, {
                            acceptedTypes: BATCH_ACCEPTED_TYPES,
                            onValid: handleBatchFileAcquired,
                            onError: (msg) => setBatchExtractError(msg),
                          });
                        }}
                      />
                      {batchFile ? (
                        <p className="text-[13px] text-zinc-300">{batchFile.name}</p>
                      ) : (
                        <>
                          <p className="text-[13px] text-zinc-400">Click or drop file here</p>
                          <p className="mt-1 text-[11px] text-zinc-600">PDF, DOCX, or image</p>
                        </>
                      )}
                    </div>
                  )}

                  {batchExtractError && (
                    <p className="mt-3 text-[12px] text-amber-400">{batchExtractError}</p>
                  )}

                  <div className="mt-4 flex justify-end">
                    <button type="button" onClick={handleBatchExtract} disabled={batchExtracting || (batchInputType === 'text' ? !batchText.trim() : !batchFile)}
                      className="rounded-md bg-white px-5 py-2 text-[14px] font-medium text-zinc-950 transition hover:bg-zinc-100 disabled:opacity-40">
                      {batchExtracting ? 'Extracting…' : 'Continue →'}
                    </button>
                  </div>
                </div>
              )}

              {/* Stage 2: Review */}
              {batchStage === 'review' && (
                <div className="flex flex-1 flex-col min-h-0 overflow-hidden p-6">
                  {/* Counter */}
                  <div className="mb-3 flex flex-shrink-0 items-center justify-between">
                    <span className={`text-[12px] font-medium ${
                      batchDraftProblems.length >= 50 ? 'text-red-400' :
                      batchDraftProblems.length >= 47 ? 'text-amber-400' :
                      'text-zinc-400'
                    }`}>
                      {batchDraftProblems.length} problem{batchDraftProblems.length !== 1 ? 's' : ''} — max 50
                    </span>
                    <button type="button" onClick={() => setBatchStage('input')} className="text-[12px] text-zinc-600 hover:text-zinc-300">← Back</button>
                  </div>

                  <div className="flex-1 min-h-0 overflow-y-auto space-y-2">
                    {batchDraftProblems.map((prob, i) => (
                      <div key={i} className="flex gap-2">
                        <span className="mt-2.5 w-5 flex-shrink-0 text-center text-[11px] text-zinc-600">{i + 1}</span>
                        <textarea
                          value={prob}
                          onChange={e => { const arr = [...batchDraftProblems]; arr[i] = e.target.value; setBatchDraftProblems(arr); }}
                          rows={2}
                          className="flex-1 resize-none rounded-md border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-[13px] text-zinc-200 outline-none focus:border-white/15"
                        />
                        <button type="button" onClick={() => setBatchDraftProblems(prev => prev.filter((_, j) => j !== i))}
                          className="mt-1.5 self-start rounded p-1 text-zinc-600 hover:text-zinc-300">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>

                  <button type="button" onClick={() => setBatchDraftProblems(prev => [...prev, ''])}
                    className="mt-3 flex-shrink-0 text-[12px] text-zinc-600 hover:text-zinc-300">
                    + Add problem
                  </button>

                  {batchExtractError && (
                    <p className="mt-3 flex-shrink-0 text-[12px] text-amber-400">{batchExtractError}</p>
                  )}

                  <div className="mt-4 flex flex-shrink-0 justify-end">
                    <button type="button" onClick={startBatchSolve}
                      disabled={batchDraftProblems.filter(p => p.trim()).length === 0 || batchDraftProblems.filter(p => p.trim()).length > 50}
                      className="rounded-md bg-white px-5 py-2 text-[14px] font-medium text-zinc-950 transition hover:bg-zinc-100 disabled:opacity-40">
                      Solve {batchDraftProblems.filter(p => p.trim()).length} problem{batchDraftProblems.filter(p => p.trim()).length !== 1 ? 's' : ''}
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Batch result view — Pro-only */}
      <AnimatePresence>
        {BATCH_UI_ENABLED && showBatchResults && (batchStage === 'processing' || batchStage === 'complete') && (
          <motion.div
            key="batch-results"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[55] flex flex-col overflow-hidden bg-zinc-950"
            style={{ left: sidebarWidth }}
          >
            {/* Result header */}
            <div className="flex flex-shrink-0 items-center justify-between border-b border-white/[0.06] px-6 py-4">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-[15px] font-medium text-white">
                    {batchStage === 'processing' ? 'Batch running…' : 'Batch complete'}
                  </h2>
                  {batchSummary && (
                    <div className="flex items-center gap-3 text-[12px]">
                      {batchSummary.verified > 0 && <span className="text-emerald-400">{batchSummary.verified} verified</span>}
                      {batchSummary.checked > 0 && <span className="text-zinc-400">{batchSummary.checked} checked</span>}
                      {batchSummary.discrepancy > 0 && <span className="text-amber-400">{batchSummary.discrepancy} discrepancy</span>}
                      {batchSummary.not_verified > 0 && <span className="text-zinc-500">{batchSummary.not_verified} unverified</span>}
                      {batchSummary.failed > 0 && <span className="text-red-400">{batchSummary.failed} failed</span>}
                    </div>
                  )}
                </div>
                {batchStage === 'complete' && batchSummary && batchSummary.discrepancy > 0 && (
                  <p className="mt-0.5 text-[12px] text-amber-400">{batchSummary.discrepancy} problem{batchSummary.discrepancy !== 1 ? 's' : ''} may need your attention.</p>
                )}
              </div>
              <button type="button" onClick={() => setShowBatchResults(false)} className="rounded p-1 text-zinc-600 hover:text-zinc-300">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Problem list */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <div className="mx-auto max-w-2xl space-y-3">
                {batchProblems.map((bp) => {
                  const badge = bp.artifact?.verification?.badge;
                  const badgeColor = badge === 'verified' ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' :
                    badge === 'discrepancy_detected' ? 'text-amber-400 border-amber-500/30 bg-amber-500/10' :
                    badge === 'checked' ? 'text-zinc-300 border-white/20 bg-white/[0.06]' :
                    'text-zinc-500 border-white/10 bg-white/[0.04]';
                  const badgeDot = badge === 'verified' ? 'bg-emerald-400' :
                    badge === 'discrepancy_detected' ? 'bg-amber-400' :
                    badge === 'checked' ? 'bg-white/40' : 'bg-zinc-600';
                  const isExpanded = batchExpandedIndex === bp.index;

                  return (
                    <div key={bp.index} className={`rounded-lg border transition-colors ${
                      badge === 'discrepancy_detected' ? 'border-amber-500/20' : 'border-white/[0.06]'
                    } bg-white/[0.02]`}>
                      {/* Card header — always visible, click to expand */}
                      <button
                        type="button"
                        onClick={() => setBatchExpandedIndex(isExpanded ? null : bp.index)}
                        className="flex w-full items-start gap-3 px-4 py-3 text-left"
                      >
                        <span className="mt-1 flex-shrink-0 text-[12px] text-zinc-600">{bp.index + 1}</span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] text-zinc-200">{bp.text}</p>
                          {bp.status === 'in_progress' && (
                            <p className="mt-1 text-[11px] text-zinc-500">Solving…</p>
                          )}
                          {bp.status === 'queued' && (
                            <p className="mt-1 text-[11px] text-zinc-600">Queued</p>
                          )}
                          {bp.status === 'failed' && (
                            <p className="mt-1 text-[11px] text-red-400">Failed — {bp.error}</p>
                          )}
                          {bp.artifact && (
                            <p className="mt-1 text-[12px] text-zinc-400">{bp.artifact.verification.user_reason}</p>
                          )}
                        </div>
                        {bp.status === 'in_progress' && (
                          <div className="mt-1 h-2 w-2 flex-shrink-0 animate-pulse rounded-full bg-zinc-400" />
                        )}
                        {bp.artifact && (
                          <span className={`flex-shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${badgeColor}`}>
                            {badge === 'verified' ? 'Verified' : badge === 'discrepancy_detected' ? 'Discrepancy' : badge === 'checked' ? 'Checked' : 'Unverified'}
                          </span>
                        )}
                        {!bp.artifact && bp.status === 'queued' && (
                          <div className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${badgeDot}`} />
                        )}
                      </button>

                      {/* Expanded: full solve surface */}
                      {isExpanded && bp.artifact && (
                        <div className="border-t border-white/[0.05] px-4 pb-4 pt-3">
                          {/* Final answer */}
                          <div className="mb-3 rounded-md border border-white/[0.08] bg-white/[0.03] px-4 py-3">
                            <div className="[&_.katex]:text-[1.3em]">
                              <BlockMath math={bp.artifact.solution.final_answer_latex || '?'} />
                            </div>
                          </div>

                          {/* Verification badge */}
                          <div className={`mb-3 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[12px] ${badgeColor}`}>
                            <span>{badge === 'verified' ? 'Verified' : badge === 'discrepancy_detected' ? 'Discrepancy detected' : badge === 'checked' ? 'Checked' : 'Not verified'}</span>
                          </div>

                          {/* Overview */}
                          {bp.artifact.solution.overview && (
                            <p className="mb-3 text-[13px] text-zinc-400">{bp.artifact.solution.overview}</p>
                          )}

                          {/* Solution sections */}
                          <div className="space-y-3">
                            {bp.artifact.solution.sections.map((sec, si) => (
                              <div key={si} className="border-l border-white/[0.06] pl-3">
                                <p className="mb-1 text-[13px] font-medium text-zinc-200">{sec.title}</p>
                                <div className="[&_.katex]:text-[1.05em] text-zinc-300 overflow-x-auto">
                                  {sec.summary_latex && <BlockMath math={sec.summary_latex} />}
                                </div>
                                {sec.explanation && <p className="mt-1 text-[13px] leading-6 text-zinc-400">{sec.explanation}</p>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
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
