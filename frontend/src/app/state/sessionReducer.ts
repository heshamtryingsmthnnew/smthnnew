// Session reducer — single source of truth for sidebar + tab + batch + history state.
// Replaces sidebarCollapsed, historyList, historyLoading useState vars + owns all new
// session-navigation pointers (activeSessionId, displayedSessionId, displayedSolveId).

export type SessionMeta = {
  id: string;
  name: string | null;
  source: 'auto' | 'renamed' | 'batch' | 'reopened';
  created_at: string;
  last_solve_at: string;
  solve_count: number;
};

export type SolveMeta = {
  id: string;
  cluster_session_id: string;
  problem_kind: string | null;
  badge: string | null;
  raw_input_preview: string;
  created_at: string;
  mode: string;
};

export type PendingSolve = {
  nonce: string;
  rawInputPreview: string;
  optimisticSessionId: string | null;
  status: 'solving' | 'failed';
};

export type BucketKey = 'today' | 'yesterday' | 'week' | 'older';

export type State = {
  sessionsById: Record<string, SessionMeta>;
  solvesById: Record<string, SolveMeta>;
  loadStatus: 'idle' | 'loading' | 'loaded' | 'error';

  pendingSolves: Record<string, PendingSolve>;

  activeSessionId: string | null;    // where new solves attach (server-authoritative)
  displayedSessionId: string | null; // what the workspace is currently rendering
  displayedSolveId: string | null;

  expandedBuckets: Record<BucketKey, boolean>;
  expandedSessions: Record<string, boolean>; // explicit overrides only

  sidebarCollapsed: boolean;

  tabMicrocopy: 'started_new_session' | null; // Brief #5 consumes

  batch: { panelOpen: boolean; job: unknown | null }; // Brief #6 defines BatchJob
};

export type Action =
  | { type: 'SESSIONS_FETCH_START' }
  | { type: 'SESSIONS_FETCH_SUCCESS'; sessions: SessionMeta[]; solves: SolveMeta[] }
  | { type: 'SESSIONS_FETCH_ERROR' }
  | { type: 'SOLVE_INITIATED'; nonce: string; rawInputPreview: string }
  | {
      type: 'SOLVE_RECONCILED';
      nonce: string;
      solve: SolveMeta;
      session: { id: string; name: string | null; created_at: string; is_new: boolean };
    }
  | { type: 'SOLVE_FAILED'; nonce: string }
  | { type: 'DISPLAY_SOLVE'; solveId: string }
  | { type: 'TAB_NAV_SOLVE'; direction: 'prev' | 'next' }
  | { type: 'CLEAR_TAB_MICROCOPY' }
  | { type: 'TOGGLE_BUCKET'; bucketKey: BucketKey }
  | { type: 'TOGGLE_SESSION'; sessionId: string }
  | { type: 'SET_SIDEBAR_COLLAPSED'; value: boolean }
  | { type: 'SESSION_RENAMED'; sessionId: string; name: string }
  | { type: 'ACTIVATE_SESSION'; sessionId: string }
  | { type: 'DEACTIVATE_SESSION' }
  // Reserved — unwired until delete brief:
  | { type: 'SOLVE_DELETED'; solveId: string }
  | { type: 'SESSION_DELETED'; sessionId: string }
  // Reserved stubs — Brief #6 defines payloads:
  | { type: 'BATCH_PANEL_TOGGLE' }
  | { type: 'BATCH_JOB_SET'; job: unknown | null }
  | { type: 'BATCH_QUEUE_UPDATED'; job: unknown };

export const initialState: State = {
  sessionsById: {},
  solvesById: {},
  loadStatus: 'idle',
  pendingSolves: {},
  activeSessionId: null,
  displayedSessionId: null,
  displayedSolveId: null,
  expandedBuckets: { today: true, yesterday: true, week: true, older: true },
  expandedSessions: {},
  sidebarCollapsed: false,
  tabMicrocopy: null,
  batch: { panelOpen: false, job: null },
};

export function sessionReducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SESSIONS_FETCH_START':
      return { ...state, loadStatus: 'loading' };

    case 'SESSIONS_FETCH_SUCCESS': {
      const sessionsById: Record<string, SessionMeta> = {};
      const solvesById: Record<string, SolveMeta> = {};
      for (const s of action.sessions) sessionsById[s.id] = s;
      for (const s of action.solves) solvesById[s.id] = s;
      return { ...state, sessionsById, solvesById, loadStatus: 'loaded' };
    }

    case 'SESSIONS_FETCH_ERROR':
      return { ...state, loadStatus: 'error' };

    case 'SOLVE_INITIATED':
      return {
        ...state,
        pendingSolves: {
          ...state.pendingSolves,
          [action.nonce]: {
            nonce: action.nonce,
            rawInputPreview: action.rawInputPreview,
            optimisticSessionId: state.activeSessionId,
            status: 'solving',
          },
        },
      };

    case 'SOLVE_RECONCILED': {
      const { nonce, solve, session } = action;
      const newPending = { ...state.pendingSolves };
      delete newPending[nonce];

      const newSolvesById = { ...state.solvesById, [solve.id]: solve };

      let newSessionsById = { ...state.sessionsById };
      if (session.is_new || !newSessionsById[session.id]) {
        newSessionsById[session.id] = {
          id: session.id,
          name: session.name,
          source: 'auto',
          created_at: session.created_at,
          last_solve_at: solve.created_at,
          solve_count: 1,
        };
      } else {
        newSessionsById = {
          ...newSessionsById,
          [session.id]: {
            ...newSessionsById[session.id],
            name: session.name,
            last_solve_at: solve.created_at,
            solve_count: newSessionsById[session.id].solve_count + 1,
          },
        };
      }

      const prevDisplayed = state.displayedSessionId;
      const newTabMicrocopy: State['tabMicrocopy'] =
        prevDisplayed !== null && prevDisplayed !== session.id
          ? 'started_new_session'
          : state.tabMicrocopy;

      return {
        ...state,
        pendingSolves: newPending,
        solvesById: newSolvesById,
        sessionsById: newSessionsById,
        activeSessionId: session.id,
        displayedSessionId: session.id,
        displayedSolveId: solve.id,
        tabMicrocopy: newTabMicrocopy,
      };
    }

    case 'SOLVE_FAILED': {
      const newPending = { ...state.pendingSolves };
      delete newPending[action.nonce];
      return { ...state, pendingSolves: newPending };
    }

    case 'DISPLAY_SOLVE': {
      const solve = state.solvesById[action.solveId];
      if (!solve) return state;
      return {
        ...state,
        displayedSolveId: action.solveId,
        displayedSessionId: solve.cluster_session_id,
        // activeSessionId intentionally NOT changed — loading old work is view-only
      };
    }

    case 'TAB_NAV_SOLVE': {
      if (!state.displayedSessionId || !state.displayedSolveId) return state;
      const solves = getSessionSolves(state, state.displayedSessionId);
      const i = solves.findIndex(s => s.id === state.displayedSolveId);
      if (i === -1) return state;
      // newest-first list: prev = older = i+1, next = newer = i-1
      const target = action.direction === 'prev' ? i + 1 : i - 1;
      if (target < 0 || target >= solves.length) return state; // no-op at boundary
      const targetSolve = solves[target];
      return {
        ...state,
        displayedSolveId: targetSolve.id,
        displayedSessionId: targetSolve.cluster_session_id,
        // activeSessionId intentionally NOT changed — loading old work is view-only
      };
    }

    case 'CLEAR_TAB_MICROCOPY':
      return { ...state, tabMicrocopy: null };

    case 'TOGGLE_BUCKET':
      return {
        ...state,
        expandedBuckets: {
          ...state.expandedBuckets,
          [action.bucketKey]: !state.expandedBuckets[action.bucketKey],
        },
      };

    case 'TOGGLE_SESSION': {
      const current = isSessionExpanded(state, action.sessionId);
      return {
        ...state,
        expandedSessions: {
          ...state.expandedSessions,
          [action.sessionId]: !current,
        },
      };
    }

    case 'SET_SIDEBAR_COLLAPSED':
      return { ...state, sidebarCollapsed: action.value };

    case 'SESSION_RENAMED': {
      if (!state.sessionsById[action.sessionId]) return state;
      return {
        ...state,
        sessionsById: {
          ...state.sessionsById,
          [action.sessionId]: {
            ...state.sessionsById[action.sessionId],
            name: action.name,
            source: 'renamed',
          },
        },
      };
    }

    case 'ACTIVATE_SESSION': {
      const session = state.sessionsById[action.sessionId];
      if (!session) return state;
      return {
        ...state,
        activeSessionId: action.sessionId,
        displayedSessionId: action.sessionId,
        displayedSolveId: null,          // empty composer, not an old solve (§6b)
        tabMicrocopy: null,              // clear any stale cue on deliberate entry
      };
    }

    case 'DEACTIVATE_SESSION':
      return {
        ...state,
        activeSessionId: null,
        displayedSessionId: null,
        displayedSolveId: null,
        tabMicrocopy: null,
      };

    // Reserved — no-ops until delete brief
    case 'SOLVE_DELETED':
      return state;
    case 'SESSION_DELETED':
      return state;

    // Reserved stubs — Brief #6 defines payloads
    case 'BATCH_PANEL_TOGGLE':
      return { ...state, batch: { ...state.batch, panelOpen: !state.batch.panelOpen } };
    case 'BATCH_JOB_SET':
      return { ...state, batch: { ...state.batch, job: action.job } };
    case 'BATCH_QUEUE_UPDATED':
      return state;

    default:
      return state;
  }
}

// ---- Selectors ----

// Compute which time bucket a session falls into based on last_solve_at vs caller's local now.
export function getSessionBucket(lastSolveAt: string, now: Date = new Date()): BucketKey {
  const d = new Date(lastSolveAt);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart.getTime() - 86400000);
  const weekStart = new Date(todayStart.getTime() - 6 * 86400000);
  if (d >= todayStart) return 'today';
  if (d >= yesterdayStart) return 'yesterday';
  if (d >= weekStart) return 'week';
  return 'older';
}

// Effective expansion: explicit override wins; default is collapsed.
export function isSessionExpanded(state: State, sessionId: string): boolean {
  const explicit = state.expandedSessions[sessionId];
  if (explicit !== undefined) return explicit;
  return false;
}

// Sessions grouped by bucket, each bucket sorted newest-first by last_solve_at.
export function getBucketedSessions(state: State): Record<BucketKey, SessionMeta[]> {
  const buckets: Record<BucketKey, SessionMeta[]> = {
    today: [], yesterday: [], week: [], older: [],
  };
  for (const session of Object.values(state.sessionsById)) {
    buckets[getSessionBucket(session.last_solve_at)].push(session);
  }
  const byTime = (a: SessionMeta, b: SessionMeta) =>
    new Date(b.last_solve_at).getTime() - new Date(a.last_solve_at).getTime();
  for (const key of Object.keys(buckets) as BucketKey[]) {
    buckets[key].sort(byTime);
  }
  return buckets;
}

// Solves for a session, sorted newest-first.
export function getSessionSolves(state: State, sessionId: string): SolveMeta[] {
  return Object.values(state.solvesById)
    .filter(s => s.cluster_session_id === sessionId)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}
