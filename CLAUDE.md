# CLAUDE.md — Ergo: Persistent Project Context

This file is loaded automatically by Claude Code on every session.
It encodes the full product philosophy, architecture, locked decisions, current code state,
implementation priorities, business model, and all pivots made during development.
Do not drift from these principles without explicit founder approval.

---

## 1. What This Product Is

**Ergo.** is an AI-powered math and physics solver.
The period in "Ergo." is intentional and must always be present.

It is **NOT**:
- A chat UI or ChatGPT wrapper
- A homework solver or study app
- A split-panel dashboard
- An "engineering only" tool (this was an earlier positioning, now abandoned)

It **IS**:
- A trust-first, accuracy-first solver for anyone who needs a correct answer they can rely on
- A product whose core differentiator is **visible correctness / visible validation / legible trust**
- A focused solving surface: type problem → see answer → trust state visible immediately → follow the work → inspect deeper only if needed
- Broad audience: engineers, grad students, researchers, advanced students, professionals — anyone who has been burned by a confident wrong AI answer
- Built for students in technical programs — advanced undergrad, grad students, anyone
  working through math-heavy coursework who needs a correct verifiable answer.
  Not a homework helper. Not a tutor. A precision instrument with a student audience.
The product should feel **engineered, minimal, precise, trustworthy without noise, powerful without clutter.**
It should feel like an environment, not a webpage.

---

## 2. Product Name & Brand

**Name:** Ergo.
**Slogan:** The answer, and the proof.
**Why Ergo:** "Ergo" means "therefore" — the word at the conclusion of every proof. The period signals finality. The answer is delivered and the case is closed.

### Font system (locked)
- **DM Serif Display** — ONLY for the `Ergo.` wordmark and the slogan "The answer, and the proof." in the empty state. Nothing else.
- **Geist Sans** — all UI: body, labels, buttons, badges, input, placeholders, section titles, nav, everything else
- **JetBrains Mono** — ONLY for verification proof detail values: residuals, evaluated values, method labels, numeric proof metadata
- KaTeX handles equation rendering fonts independently — do not touch

### Color system (locked)
Monochrome cool. Zero blue anywhere except functional badge colors.
```
Page background:     bg-zinc-950
Surfaces/cards:      bg-white/[0.04] to bg-white/[0.06]
Borders/dividers:    border-white/[0.06] to border-white/[0.10]
Primary text:        text-white
Secondary text:      text-zinc-400
Meta text:           text-zinc-500
Placeholder:         text-zinc-600
Primary button:      bg-white text-zinc-950 hover:bg-zinc-100
Secondary buttons:   bg-white/[0.08] text-zinc-200 border border-white/[0.10]
```

Verification badge colors — functional signals, never change:
```
Verified:            border-emerald-500/30 bg-emerald-500/10 text-emerald-300
Checked:             border-white/20 bg-white/[0.06] text-zinc-300
Discrepancy:         border-amber-500/30 bg-amber-500/10 text-amber-300
Not verified:        border-white/10 bg-white/[0.04] text-zinc-400
```

---

## 3. Core Product Philosophy (Locked)

- **Trust must be visible.** Verification state and one-line proof summary always shown without any click
- **Depth is optional.** Proof details, concept explanations, graph, advanced verification are on-demand only
- **One place per idea.** No duplication of controls, no repeated text, no competing focal areas
- **Task completion first, learning second.** Procedural solve flow always fully visible. Conceptual explanations behind optional expansion
- **Minimalism ≠ hiding everything.** It means no wasted elements and no friction
- **The interface should feel like an environment, not a webpage.** Every element earns its place

### Always Visible (No Click Required)
- Input, Final answer, Verification badge, One-line verification summary (user_reason), Overview, Procedural solution sections

### On-Demand Only
- Proof details (drawer), "Why this works" toggle, Graph (modal), Advanced verification, Suggestions (failure states only)

---

## 4. Product Direction Pivots (Important History)

### Pivot 1: "Engineering only" → Broad accuracy-first positioning
Originally "Engineering Solver" for engineers specifically.
**Changed:** Target is now anyone needing a correct verifiable answer.
The engineering-grade standard (accuracy, verification, no hand-holding) is kept.
The exclusive "engineers only" label is dropped.
Reason: it was a distribution constraint, not a product advantage.

### Pivot 2: Right rail removed
Had a persistent right rail with graph and verification panels.
**Changed:** Removed entirely. Action cluster under answer + overlays on demand.
Reason: linear interaction model, rail split attention and duplicated controls.

### Pivot 3: Name change
"Engineering Solver" → **Ergo.**
Reason: generic name limited perceived audience. Ergo. signals rigor and finality.

### Pivot 4: Study mode → Interactive mode
**Changed:** "Study mode" reframed as **Interactive mode**.
Reason: "study" carried student/homework connotations.
Interactive mode is a persistent user preference (never resets between solves).
Will eventually enable conversational, concept-driven interaction.
Currently UI-scaffolded only — full behavior is a future phase.

### Pivot 5: Separate normalization call → Embedded in solution call
Originally planned as a separate Haiku API call for Tier 2 normalization.
**Changed:** Normalization is embedded in the solution generation prompt.
The same Sonnet call returns a `normalized_expression` field alongside the solution.
Reason: zero extra cost, zero extra latency, simpler architecture.

### Pivot 6: OpenAI → Anthropic (Claude) ✅ COMPLETE
Migrated entirely to Anthropic SDK (@anthropic-ai/sdk v0.88.0).
Solution generation: claude-sonnet-4-5
Normalization embedded in solution call — no separate model needed.
OpenAI fully removed from codebase.

---

## 5. Layout Blueprint (Implemented)

### Header
- Left: `Ergo.` in DM Serif Display
- Right: profile avatar circle + plain three-line menu icon (no circle on menu)
- `bg-zinc-950` solid — dot pattern does not show through
- `border-b border-white/[0.06]`
- NO subtitle, NO mode toggles, NO history in header

### Empty State
- Dot pattern background: fades around input center, disappears on solve
- Slogan centered at ~42% viewport, DM Serif Display, text-2xl, text-zinc-300
- Input composer centered at ~62% viewport, ~680–700px wide, compact height
- Nothing else

### Input Composer
- **Idle:** centered, ~680–700px wide, ~62% viewport
- **Active:** bottom-anchored, full content width, 380ms ease-out
- Triggers active on `loading || !!artifact`
- Floating, no outer panel/border
- Math/Physics tabs: left, flush with input box left edge
- Interactive bookmark tab: right, partially overlaps top edge of input, behind input (z-index) when inactive, lifts forward when active, dot indicator (dim → white)
- Enter submits, Shift+Enter newline
- Image upload icon (visual only, backend future)
- Σ math keyboard, Solve → button

### Workspace Controls
- History icon: top-left of workspace, quiet, placeholder
- Interactive mode: bookmark tab on input composer

### Solve Surface
- Final Answer: `bg-white/[0.04] border border-white/[0.08]`, no glow
- Badge + user_reason: always visible
- Action cluster: `Proof details` | `Advanced verification` | `View graph`
- FlowDividers between sections
- Overview, Solution sections (always visible), "Why this works" toggle

---

## 6. Validation Architecture (Locked)

### Tier 1 — Deterministic (Default)
math.js: equations, systems, inequalities, numeric expressions. Free, instant.

### Tier 2 — Normalization (Embedded, Zero Extra Cost)
NOT a separate API call. The solution generation call also returns `normalized_expression`.
Stored in artifact, used for deterministic validation retry if raw input fails parsing.

### Tier 3 — CAS / Advanced Verification (User-Invoked, Paid)
Triggered by "Advanced verification" button. Gated behind Pro tier.

### Hard Rule — "No AI Checks AI" Scope

This prohibition applies specifically to math correctness verification.
AI must never be used to confirm whether a math answer is correct —
deterministic validation (Tier 1 math.js, Tier 3 CAS) is the only
correctness authority for math.

Physics is exempt from this rule for the following reason: the physics
problem space is too broad for deterministic validation. For physics,
a second AI call solving via a genuinely different method (different
physical framework or approach) constitutes a legitimate audit — not
a correctness check. The two calls are independent. Disagreement
between them is a real signal. Agreement is weak confirmation, not proof.
The audit result is always labeled as an audit, never as verification.

---

## 7. AI Model Architecture (Locked)

- Solution generation: claude-sonnet-4-5
- Physics audit: claude-sonnet-4-5 (physicsAudit.js)
- Normalization: embedded in solution call — no separate model
- CAS future: claude-sonnet-4-5
- OpenAI: fully removed
- Haiku evaluated on 8-problem test matrix (MODEL_COMPARISON.md) — scored 100% of Sonnet quality, but reverted to Sonnet by founder decision.

---

## 8. Business Model

### Tiers
- **Free:** 15 queries/day, no CAS, no advanced verification
- **Pro:** $12/month — unlimited, CAS, advanced verification, history

### Unit Economics
- Cost per query: ~$0.004–0.005 (one Sonnet call, normalization embedded)
- Free user monthly cost: ~$1.00
- Pro user monthly cost: ~$3.75
- Gross margin per Pro user: ~$8.25 (~69%)
- Fixed costs: ~$50/month (hosting)

### Targets
| Pro Users | Net/Month |
|---|---|
| 20 | +$115 |
| 100 | +$775 |
| 300 | +$2,425 |

$2,000+/month net requires ~250–300 paying Pro users.
At 4% free-to-paid conversion: need ~7,500 active free users.

### Growth strategy
- SEO: many targeted solver pages (one per problem type), not one generic page
- Funnel: SEO → free use → query limit or CAS gate → Pro conversion
- Free tier is the discovery and conversion engine

---

## Section 9 — Implementation Phases (replace entire section)

```
9. Implementation Phases

✅ Completed

Phase 1: Right rail removal, action cluster, header cleanup
Phase 1b: Full-width layout, empty state, floating input, slogan
Phase 1c: Ergo. rename, font system, zinc colors, animated input, dot pattern,
          Interactive mode tab, header restructure (identity + account only),
          header solid background over dots, header micro-fixes (menu icon, tab alignment)

Phase 2a: OpenAI → Claude + Normalization Embedding ✅ COMPLETE
  - Replaced OpenAI SDK with @anthropic-ai/sdk (v0.88.0)
  - Solution generation on claude-sonnet-4-5
  - normalized_expression embedded in structured solution schema
  - normalized_expression used for deterministic validation retry
  - BUILD_VERSION set to "v2.0.0-claude-migration"
  - All OpenAI references removed from codebase
  - cost_meta.model reflects claude-sonnet-4-5

UI Pass 1 (UI_PASS_BRIEF_1.md) ✅ COMPLETE
  - Answer card visibility tier system: action cluster (Proof details | Advanced
    verification | View graph) converted from pill buttons to footnote-weight
    text links at text-zinc-600, reveal on hover. Badge + user_reason unchanged
    at full prominence (Tier 1). Suggestion chips confirmed gated behind
    artifact.suggestions.length > 0.
  - Empty state capability cues: example chips row added below composer in idle
    state, fading with isActive. 8 chips, clicking populates textarea via
    existing setQuestion. "Try an example" label in zinc-600.
    NOTE: Chips were superseded and removed in UI Pass 2 (see below).

UI Pass 2 (UI_FIXES_BRIEF.md) ✅ COMPLETE
  - Ghost text: after solve, submitted question shows as dimmed placeholder;
    textarea clears. ghostQuestion state set in doSolve finally block. User
    types to replace — no deletion required.
  - Input locked during generation: textarea, Math/Physics tabs, and Interactive
    bookmark all get disabled={loading} with disabled:opacity-50 cursor styling.
  - Study mode removed: studyMode state, workspace button, and study flow
    conditional render block all deleted. Solution sections always render.
  - Bookmark hitbox fixed: z-index raised from 5/15 to 22/25, ensuring full
    visual area is above the mode tabs (z-20) and registers clicks correctly.
  - Example chips replaced with rotating placeholder: EXAMPLE_CHIPS constant
    removed, chips div removed. MATH_EXAMPLES and PHYSICS_EXAMPLES updated to
    full problem strings (5 math, 4 physics). Placeholder rotates through them
    via existing exampleIndex/useEffect cycle. ghostQuestion takes priority.

Phase 2b (PHASE_2B_BRIEF.md) ✅ COMPLETE
  - Math symbol keyboard: SYMBOL_MAP + KEYBOARD_ROWS constants, mathKeyboardOpen
    state, insertSymbol() inserts at cursor position. Renders as absolute panel
    above composer, animates in (kbFadeIn 200ms). Σ button toggles it.
    OPEN_MATH_KEYBOARD suggestion opens keyboard fully.
  - Format hint: showFormatHint state, mode-aware before/after examples panel
    (math: equation notation; physics: include units + what to solve for).
    Renders above composer alongside keyboard. Resets in doSolve.
    SHOW_FORMAT_EXAMPLE suggestion shows it.
  - Advanced verification taste gate: 3 uses/month free (resets on page reload —
    intentional, Phase 5 enforces server-side). handleAdvancedVerification()
    checks counter, either runs check or shows Pro gate.
    runAdvancedVerification() calls /solve with advanced:true, shows secondary
    badge + method + match/differ result. Emerald = confirmed, amber = differs.
    Pro upsell gate: emerald CTA button (href="#" placeholder for Phase 5 Stripe).
    Both action cluster button and RUN_ADVANCED_VERIFICATION suggestion wired.
  - Backend: /solve reads advanced flag, passes advancedVerificationUsed to
    buildProblemArtifact, reflected in cost_meta.advanced_verification_used.
  - artifact.js: structuredSolution now used for both math AND physics (removed
    mode === "math" guard); advancedVerificationUsed param wired through.
  - BUILD_VERSION: "v2.2.0-suggestion-wiring"

Phase 2c (PHASE_2C_BRIEF.md) ✅ COMPLETE
  - Math system prompt rewritten for student audience: explains reasoning not
    just mechanics, concept field explicitly instructed to explain *why* in
    plain language (2–3 sentences), step titles must be descriptive.
  - Math user prompt: concept field description updated to student-facing
    instruction.
  - Physics path migrated from legacy raw-text to structured JSON (mirrors
    math path): physicsSystemPrompt + physicsUserPrompt defined inline,
    model call returns JSON parsed into structuredSolution + normalizedExpression.
    concept field now live for physics. "Why this works" works for both modes.
  - detailLevel switch deleted entirely (dead code, never wired in frontend).
  - Physics verification unchanged: still { status: 'unavailable',
    reason: 'physics_not_supported' }.
  - BUILD_VERSION: "v2.1.0-prompt-overhaul"

UI Fixes 2 (UI_FIXES_2_BRIEF.md) ✅ COMPLETE
  - Typo sanitizer: sanitizeCommonTypos() collapses repeated connector words
    (and/or/with only — math terms untouched). Applied before all processing
    in /solve. hadTypos flag drives 'input_may_have_typos' reason → PARSER_FAILED.
  - Prose detection: detectMixedProseInput() flags prose+math mixing. Sets
    'mixed_prose_input' reason → PARSER_AMBIGUOUS → surfaces OPEN_MATH_KEYBOARD
    + SHOW_FORMAT_EXAMPLE chips. Does not block solve.
  - artifact.js: mapVerificationToReasonCode handles 'input_may_have_typos'
    and 'mixed_prose_input' reason codes (checked before normalizedKind unknown).
  - Logo click: Ergo. wordmark wrapped in button; onClick resets all state to
    idle (artifact, question, ghostQuestion, panels, keyboard). No page reload.
  - KaTeX scaling: final answer at [&_.katex]:text-[1.4em]; section equations
    at [&_.katex]:text-[1.1em] with left-aligned overflow-x-auto wrapper.
  - Section titles demoted to label style: text-[13px] font-medium uppercase
    tracking-[0.12em] text-zinc-400 (was bold 17px heading).
  - Explanation text: text-[14px] leading-7 text-zinc-300 (was 15px leading-8).
  - "Why this works" button: state-aware colors (zinc-500 closed / zinc-300
    open), mt-3 (was mt-4). Concept panel: left-border treatment
    (border-l border-white/[0.08] bg-white/[0.02]), leading-7 text-zinc-400.
  - BUILD_VERSION: "v2.5.0-fixes"

✅ Phase 3 — Graph ✅ COMPLETE
  - Math and physics system/user prompts extended: model now returns `graphable: boolean`
    and `graph_expression: string` (Desmos-ready) alongside the solution JSON.
  - `artifact.js`: extracts `graphable`/`graph_expression` from `structuredSolution`,
    applies guard (if expression empty but graphable true → force false), writes
    `graph: { graphable, expression }` to the artifact.
  - Frontend: `Artifact` type updated with `graph?: { graphable, expression }`.
  - `showGraph` state added (boolean, false); reset in `doSolve` and logo click.
  - "View graph" in action cluster renders only when `artifact.graph?.graphable === true`;
    completely hidden otherwise.
  - Graph modal: fixed `z-50 bg-zinc-950/90 backdrop-blur-sm` overlay, centered
    `max-w-2xl` container, close on backdrop click or × button, "Graph" zinc-500 label,
    Desmos embed at `h-[480px]`, "Open in Desmos ↗" text link bottom-right.
  - Desmos embed API loaded via script tag (apiKey: dcb31709b452b1cf9dc26972add0fae6).
    Calculator initialized on modal open with `expressions: false, keypad: false,
    settingsMenu: false, zoomButtons: true`. Expression set via `setExpression`.
  - BUILD_VERSION: "v3.0.0-graph"

✅ Phase 3b — CAS Verification + Physics Audit ✅ COMPLETE
  - CLAUDE.md Section 6 Hard Rule clarified: "no AI checks AI" scoped to math
    correctness only; physics AI audit explicitly permitted as independent method.
  - backend/wolfram.js: queries Wolfram Full Results API with the expression,
    extracts Result pod plaintext, returns { success, result, raw }. Uses native
    fetch. No new dependencies.
  - backend/physicsAudit.js: second Claude call (claude-sonnet-4-5, temp 0.3)
    instructed to solve via different physical method. Returns { agrees,
    audit_answer, method, confidence, note, dimensional }. Lightweight unit-presence
    regex check on final_answer_latex for dimensional analysis.
  - backend/index.js: when advanced:true — math path calls wolfram.js, loose
    string comparison determines verdict (confirmed/discrepancy/unavailable);
    physics path calls physicsAudit.js. Results passed to buildProblemArtifact
    under casResult / auditResult.
  - artifact.js: buildProblemArtifact accepts casResult + auditResult. Writes
    cas: { verdict, wolfram_result, expression_checked, used } and audit:
    { verdict, audit_answer, method, confidence, note, dimensional, used }.
    cost_meta now includes cas_used and audit_used booleans.
  - Frontend: Artifact type updated with cas and audit fields. advancedVerifResult
    state now holds full Artifact (not just verification). Math advanced panel
    shows Wolfram verdict: emerald "Confirmed by Wolfram Alpha", amber
    "Wolfram Alpha returned a different result" + result in JetBrains Mono,
    zinc "Wolfram Alpha could not evaluate this expression". Physics advanced
    panel labeled "AUDIT" (not "ADVANCED CHECK"), shows consistent/inconsistent
    + method + dimensional analysis line. Never uses "Verified" for physics.
  - BUILD_VERSION: "v3.1.0-cas"

✅ Prompt Rewrite (PROMPT_REWRITE.md) ✅ COMPLETE
  - Math system prompt: audience reframed to technically literate grad/advanced
    undergrad — "justify the move, don't describe it." explanation 2–3 sentences
    dense; concept 1–2 sentences naming the principle and applying it directly,
    no definitions, no scaffolding. overview shortened to one sentence.
  - Math user prompt: JSON field descriptions updated to match new register.
    graphable/graph_expression defaults now shown as false/"" in schema.
  - Physics system prompt: same audience reframe. explanation "justify the
    approach, don't walk through it." concept "name the law, state why it
    applies to this specific configuration." overview one sentence.
  - Physics user prompt: JSON field descriptions updated to match. Same
    structural defaults as math.
  - No logic, variable names, JSON parsing, or verification code changed.
  - BUILD_VERSION: "v3.2.0-prompts"

✅ Fix Brief 01 — 7 post-Phase-3b bug fixes ✅ COMPLETE
  - FIX 1: normalizeQuestionForModel() rewritten to strip ONLY conversational
    filler (please, can you, could you, help me, i need, what is, tell me,
    give me). All math operation verbs (differentiate, integrate, factor,
    expand, simplify, etc.) pass through unchanged. "differentiate x^3 * ln(x)"
    now reaches the model with the verb intact.
  - FIX 2: wolfram.js — stripLatexForWolfram() added. Converts \frac, \sqrt,
    removes \text{}, \left, \right, \quad, \implies, converts \cdot → *.
    Applied to final_answer_latex before every Wolfram API call. Logs both
    raw and stripped expression in dev mode.
  - FIX 3: Desmos setExpression now called with 100ms delay after
    GraphingCalculator init, ensuring Desmos internal state is ready before
    the expression is set.
  - FIX 4: artifact.js — physics badge overridden post-audit: when
    auditResult.used === true, badge → "checked", method → "cross_method_audit",
    user_reason reflects agrees/disagrees. Without audit: user_reason →
    "Use Cross-Method Audit for an independent check." Old "not available for
    physics" string removed entirely.
  - FIX 5: Frontend — certainty dot suppressed when badge === "checked".
    Only shown for "verified" and "discrepancy". checked badge user_reason →
    "Deterministic verification not available for this problem type. Use
    Advanced Verification for a deeper check."
  - FIX 6: detectMixedProseInput() — MATH_INSTRUCTION_PHRASES exemption list
    added (find the eigenvalues, differentiate, integrate, factor, etc.).
    Inputs starting with recognized math instruction phrases never flagged as
    mixed prose.
  - FIX 7: verifyDirectEquality() added — for single-equation inputs where
    both sides are fully numeric (no free variables), evaluates both sides with
    math.js and compares with 1e-10 tolerance. Called as fast path in
    verifyMathAnswer(). Covers sin(pi/4) = sqrt(2)/2, cos(0) = 1, 2^8 = 256,
    and all pure trig/numeric evaluations previously returning VALIDATION_INCONCLUSIVE.
  - BUILD_VERSION: "v3.2.2-fixes"

✅ Fix Brief 02 — CAS stripping + physics badge ✅ COMPLETE
  - FIX 2 (completed): wolfram.js — stripLatexForWolfram() rewritten.
    Named functions (\ln, \log, \sin, \cos, \tan, \exp) now converted to
    plain text before catch-all strips remaining LaTeX commands. Implicit
    multiplication inserted post-cleanup: 3x → 3*x, x(x+1) → x*(x+1).
    Equation-type answers (final_answer_latex contains "var =") now route
    to Wolfram as "original equation, candidate values" for substitution
    verification rather than sending the answer string directly.
  - FIX 4 (completed): index.js — runPhysicsAudit() result spread with
    { used: true } at call site. artifact.js condition
    (auditResult.used === true) now evaluates correctly. Physics badge
    overrides to "checked" post-audit with method and audit outcome in
    user_reason. Static "not available for physics" string already removed
    in Fix Brief 01 — no further changes to artifact.js required.
  - BUILD_VERSION: "v3.2.2-fixes"

✅ Model Switch — Haiku for solution generation ✅ COMPLETE
  - claude-haiku-4-5 replaces claude-sonnet-4-5 for primary /solve call.
  - physicsAudit.js unchanged — stays on claude-sonnet-4-5.
  - Passed quality bar on 8-problem test matrix (MODEL_COMPARISON.md): 69/80 Haiku vs 69/80 Sonnet (100%).
  - Cost per solve reduced from ~$0.004–0.005 to ~$0.0008–0.001.
  - SOLUTION_MODEL env var allows override. artifact.js cost_meta.model reads from env.
  - BUILD_VERSION: "v3.2.3-haiku"
  - claude-haiku-4-5 replaces claude-sonnet-4-5 for primary /solve call.
  - physicsAudit.js unchanged — stays on claude-sonnet-4-5.
  - Passed quality bar on 8-problem test matrix (MODEL_COMPARISON.md): 69/80 Haiku vs 69/80 Sonnet (100%).
  - Cost per solve reduced from ~$0.004–0.005 to ~$0.0008–0.001.
  - SOLUTION_MODEL env var allows override. artifact.js cost_meta.model reads from env.
  - BUILD_VERSION: "v3.2.3-haiku"

✅ Phase 3c — Left Panel + Graph Popover ✅ COMPLETE
  - Left panel: 240px fixed, always-visible. Renders Ergo. logo (top, DM Serif
    Display 22px), Home button, Sessions section with sign-in CTA (pre-auth
    no-op), Settings/Help at bottom. bg-zinc-950 with border-r white/[0.04]
    separator. Main content shifted right by ml-60.
  - handleReset() extracted — called by both the panel Ergo. logo, the panel
    Home button, and the header Ergo. button. Resets artifact, question,
    ghostQuestion, panels, keyboard, graphOpen.
  - Sign in button is no-op pre-Phase 5.
  - Graph popover replaces graph modal: fixed top-20 right-6, w-[500px]
    h-[400px], floats over solution content (does not push). Header strip with
    "GRAPH" label and × close button (SVG X icon). Desmos embed (h-[360px])
    fills body. "Open in Desmos ↗" URL-parameter link at bottom-right of embed.
    100ms setExpression delay preserved (Fix 3).
  - State: graphOpen replaces old showGraph. Resets to false on new solve,
    handleReset, or × click. Framer Motion AnimatePresence: opacity 0→1,
    scale 0.95→1, 200ms ease-out on open; reverse on close.
  - Dot pattern left edge pinned to 240px so it only covers the content area.
  - Input composer positioning updated: left: calc(50%+120px) centers in
    content area; width: calc(100%-240px) when active fills content area only.
  - Right rail removed entirely. No vestigial right-side panel code remains.
  - Post-3c polish: hamburger menu removed; profile icon wired to sign-in
    handler; left panel logo removed then restored; border white/[0.08].
  - Top header removed entirely. Left panel is the sole navigation surface:
    Ergo. logo at top (DM Serif Display 22px, resets state on click), Home
    button, Sessions CTA, then Profile / Settings / Help anchored at bottom.
    Profile click is same no-op handler as Sign in (Phase 5 wires both).
    Main canvas extends from viewport top — no header eating vertical space.
  - History icon (workspace top-left placeholder) removed entirely.
  - BUILD_VERSION: "v3.3.3-layout"

✅ Phase 3d — Performance + Animations ✅ COMPLETE
  - Sequential progress indicator: 4 stages (Parsing → Generating solution
    → Running verification → Building proof). Client-side timing with 600ms /
    2400ms / 3600ms transitions. SolveStage type + solveStageRef tracks current
    stage. On API response: clears scheduled timers, snaps remaining stages at
    100ms intervals, sets 'complete' (fade), then 'idle' after 300ms. On error:
    clears timers, resets to idle immediately. handleReset also clears all
    timers. Renders as SolveProgress component below content, hidden when idle.
  - Streaming investigation: Option A — streaming is viable and worth it now.
    Model response dominates at median ~12,990ms, P95 ~17,345ms. Backend
    processing (verification + artifact) is negligible at median <5ms total,
    P95 ~30ms. Streaming would deliver time-to-first-content improvement of
    ~12s median. Architectural plan: swap client.messages.create() for
    client.messages.stream(), emit SSE chunks to client, frontend renders
    partial solution sections as they arrive. Implementation deferred post-launch.
  - Artifact construction profiling: all sub-stages (badge/certainty mapping,
    suggestion building, assembly) complete in <1ms synchronously. No awaits
    in buildProblemArtifact — it is entirely synchronous. No unnecessary
    sequential operations identified. No refactoring needed.
  - Performance baseline (v3.4.0-perf, 12 solves, Sonnet 4.5):

    | Stage              | Median (ms) | P95 (ms) |
    |--------------------|-------------|----------|
    | Model response     | 12,990      | 17,345   |
    | Verification       | 1           | 29       |
    | Artifact construct | <1          | 1        |
    | Total              | 12,992      | 17,346   |

    | Artifact sub-stage | Median (ms) |
    |--------------------|-------------|
    | Badge/certainty    | <1          |
    | Suggestion build   | <1          |
    | Assembly           | <1          |

  - Profiling logs removed from backend after measurement.
  - BUILD_VERSION: "v3.4.0-perf"

✅ CAS Refactor — Wolfram architecture rebuild ✅ COMPLETE
  - Root cause: previous architecture sent Claude's answer to Wolfram (a
    question-answering engine). Wolfram returned null for all problem types
    because it expected questions, not answers.
  - Three confirmed failure modes (diagnostic v3.4.0-perf):
    (1) Equations: comma syntax interpreted as simultaneous conditions →
        NoSolutionsFromReduce pod, never a Result pod
    (2) Differentiation/integration: bare answer expression sent → Wolfram
        returned analysis pods (Plots, Derivative, Integral) with no Result
    (3) Integration constant C treated as free variable → 3D plot pods only
  - Fix 1: buildWolframQuery() in wolfram.js — constructs correct query from
    original question by problem kind:
      differentiation → d/dx[expr]
      integration     → integrate expr (constant C stripped)
      simplification  → bare expression (Wolfram handles natively)
      equation        → solve expr (only when Tier 1 unavailable)
      system/inequality/unknown → skip Wolfram (Tier 1 covers or unsupported)
  - Fix 2: queryWolfram() now accepts kind parameter, searches pod titles
    appropriate to the query kind (Derivative pod for differentiation,
    Indefinite integral pod for integration, etc.)
  - Fix 3: compareWithWolfram() replaces broken .includes() comparison.
    Three-tier: numeric sampling at 3 points (1e-6 tolerance) → normalized
    string compare → unavailable (never false-positive as discrepancy).
    Extracts RHS from Wolfram's "d/dx(...)=result" prefix for calc kinds.
    Converts ln()→log() for math.js compatibility (math.js natural log is log()).
  - Fix 4: stripLatexForWolfram implicit mult block — three new rules:
    (a) letter→known function: xsin(→x*sin(, xcos(→x*cos(
    (b) negative lookbehind (?<!\^) protects ^2( (power notation) from
        becoming ^2*(
    (c) ^digit→letter rule: x^2ln→x^2*ln (power followed by function name)
  - Fix 5: detectOperationKind() in index.js — detects differentiation,
    integration, simplification from question verb before falling back to
    normalized.kind (which only returns equation/system/inequality/expression)
  - Fix 6: CAS routing in index.js — equations skip Wolfram when Tier 1
    validates; unknown/expression kinds skip entirely; all skips log reason
  - All 5 verification tests confirmed:
    Test 1 (differentiation): d/dx[x^3*ln(x)] → confirmed
    Test 2 (integration): integrate x^2*sin(x) → confirmed
    Test 3 (equation/Tier1): x^2-5x+6=0 → skipped (Tier 1 handled)
    Test 4 (simplification): simplify sin^2(x)+cos^2(x) → confirmed
    Test 5 (unknown): → skipped cleanly
  - BUILD_VERSION: "v3.5.1-cas"

✅ Task 3e-1 — Auto-fire advanced verification on first solve ✅ COMPLETE
  - hasSeenAdvancedVerification: boolean state (default false). First solve
    sends advanced:true automatically. setHasSeenAdvancedVerification(true)
    after first solve completes. advancedVerifUsed counter not incremented.
  - Bug fix: doSolve was storing CAS result in artifact but advancedVerifResult
    was left null (reset at solve start). Added setAdvancedVerifResult(artifact)
    in the shouldAutoFire branch so the panel populates on auto-fire.

✅ Task 3e-2 fixes — In-place discrepancy split layout corrections ✅ COMPLETE
  - Fix 1: Split moved inside Final Answer box, replacing centered BlockMath.
    Header strip (amber) + two-column row + subtitle row render in-place.
    No second panel appended below. Box transforms internally.
  - Fix 2: Right column uses KaTeXBoundary error boundary. Attempts BlockMath;
    falls back to JetBrains Mono plaintext if KaTeX parse error. key prop on
    boundary ensures reset when wolfram_result changes.
  - Fix 3: displayedSuggestions filters RUN_ADVANCED_VERIFICATION chip when
    advancedVerifResult is populated. Used in render instead of artifact.suggestions.
  - Fix 4: Advanced verification button disabled={!!advancedVerifResult} with
    text-zinc-700 cursor-not-allowed pointer-events-none when used.
  - Problem 4: Removed border border-amber-500/40 from symbol circle (old
    appended-panel version). New in-box symbol is bare glyph (≠/!/=) with
    no border, no circle, no line — just centered amber text.
  - BUILD_VERSION: "v3.5.2-3e2-fix"

✅ Post-3e-2 polish — split extended to confirmed state + UX fixes ✅ COMPLETE
  - splitKind replaces showDiscrepancySplit (binary → 3-value:
    'discrepancy' | 'confirmed' | null). Confirmed verdict now renders the
    same two-column split layout with emerald colors instead of amber:
    emerald header strip "✓ Confirmed", = symbol, emerald text.
    Discrepancy keeps amber header "⚠ Discrepancy Detected", ≠/! symbol.
  - user_reason (one-line verification summary) hidden once advancedVerifResult
    is populated. "Deterministic verification not available..." no longer
    persists after advanced verification runs.
  - Single-column panel now only renders when splitKind === null (unavailable
    verdict). confirmed and consistent cases fully handled by the split.
  - Column headers "Primary solution" and "Wolfram Alpha" / "Alternate method"
    centered above their respective columns (text-center added).

✅ Phase 3e Polish — Verification split + UI hierarchy fixes ✅ COMPLETE
  - Right column in confirmed/discrepancy split: switched from KaTeXBoundary to
    direct JetBrains Mono rendering (Wolfram returns plaintext, not valid LaTeX).
    Null/empty fallback: italic "Result unavailable" in zinc-500.
  - Unavailable state: replaced single-column info panel with one-line note
    (text-[12px] text-zinc-500 mt-2). Badge remains visible.
  - Progress indicator timing: dwell times extended — parsing→generating 1200ms
    (was 600ms), generating→verifying 4500ms (was 2400ms), verifying→building
    7000ms (was 3600ms). Snap interval on early completion: 300ms (was 100ms).
    Fade delay: delay+400ms (was delay+300ms). Stages feel earned, not rushed.
  - Composer z-index: changed from fixed z-50 class to dynamic inline style
    (zIndex: isActive ? 20 : 10). Active state at 20 sits above solution content
    but below graph popover (z-40) and left panel (z-30).
  - Solution content bottom padding: pb-[220px] → pb-[280px] to prevent tab
    strip from overlapping the last section on scroll.
  - Mode tabs dim during loading: opacity 0.4 when loading, 1 otherwise
    (transition-opacity duration-200). Soft visual cue matching disabled state.
  - Action cluster ghost visibility: opacity-0 by default, group-hover:opacity-100
    on Final Answer card hover (200ms transition). Stays opacity-100 when
    showProofDetails is true — Hide proof button remains visible while reading.
  - BUILD_VERSION: "v3.5.2-polish"

✅ Phase 3e-3 — Wedge Animation Sequence ✅ COMPLETE
  - Two animation paths:
    Path A (auto-fire, first solve): data parks in pendingAdvancedResult ref,
      advancedResultReady set true, ~2350ms pure choreography sequence.
    Path B (manual click): animation starts on button click, real API request
      runs in parallel, 50ms poll loop in reveal check waits for response.
  - startWedgeSequence(): line draw (CSS scaleY 0→1, 300ms, 50ms initial delay),
    answer slides via Framer Motion layout prop (300ms simultaneous), 4 loading
    messages at 600ms intervals starting at 350ms.
  - triggerReveal(): commits advancedVerifResult via setAdvancedVerifResult,
    branches on kind. Discrepancy: header slides in (200ms), result fades (300ms).
    Confirmed: line retracts (300ms), snaps back with header+result (400ms).
    Unavailable: line retracts, done at 400ms.
  - artifactRef tracks current artifact to avoid stale closures in triggerReveal.
  - wedgeActive (wedgePhase !== idle && !!artifact) gates which JSX path renders.
  - Badge hidden while wedgeActive; reappears only when done + splitKind null.
  - Line: amber during loading, transitions to white/8 after reveal.
  - BUILD_VERSION: "v3.5.3-wedge-anim"

✅ Wolfram Query Normalization ✅ COMPLETE
  - Root cause of ~90% Wolfram unavailable/could-not-evaluate results:
    buildWolframQuery() received raw user question and used regex to construct
    Wolfram queries. Failed for typos, all-caps, unusual phrasing, LaTeX input.
  - Fix: model generates wolfram_query field in same solution call (zero extra
    cost, zero extra latency). Model handles all normalization: typos, caps,
    unusual phrasing, LaTeX — produces clean Wolfram Alpha query syntax.
  - Critical distinction preserved: wolfram_query targets Wolfram syntax
    (d/dx[...], ln(x), natural language) — different from normalized_expression
    which targets math.js syntax (explicit operators, log() for natural log).
    These cannot share the same normalized form.
  - wolfram_query field added to math system prompt and user prompt JSON schema.
    Equations/systems always return null (Tier 1 handles those). All other
    problem types return Wolfram-ready query string.
  - inferKindFromQuery() added to wolfram.js — reads the query the model wrote
    to determine pod lookup kind. Replaces detectOperationKind() in CAS path.
    detectOperationKind() left in codebase but no longer called in CAS routing.
  - CAS routing block in index.js fully replaced: uses wolframQuery from
    structuredSolution.wolfram_query. If null: skips Wolfram, verdict unavailable.
    If present: calls queryWolfram(wolframQuery, inferKindFromQuery(wolframQuery)),
    then compareWithWolfram().
  - BUILD_VERSION: "v3.5.3-wolfram-query"

✅ compareWithWolfram Accuracy Fixes ✅ COMPLETE
  - Bug 1: Claude's final_answer_latex sometimes written as "A = B"
    (simplification chain). math.js cannot evaluate an equation — all sample
    points threw, verdict fell to unavailable. Fix: toMathjs() now extracts
    RHS via split('=').pop() after stripLatexForWolfram runs. Applied to
    both Claude's answer and Wolfram's result universally (replaces the old
    extractRhs parameter that only fired for calc kinds).
  - Bug 2: Wolfram uses sec(), csc(), cot() — math.js has no these functions.
    evaluate() threw "Undefined function sec", sample points silently skipped,
    attemptCount === 0, tryNumericSample returned null → unavailable.
    Fix: expandTrigShorthands() added at module level in wolfram.js. Expands
    sec(x)→(1/cos(x)), csc(x)→(1/sin(x)), cot(x)→(cos(x)/sin(x)) before
    math.js evaluation. Called inside toMathjs() after = extraction.
    Known limitation: regex only handles single-depth parens — nested args
    like sec(cos(x)) fall through to unavailable (acceptable, uncommon).
  - Confirmed fix: "diferentiate ln(x^3)/cos(x)" now returns
    cas.verdict: "confirmed" where previously it returned "unavailable"
    despite Wolfram successfully returning a result.
  - BUILD_VERSION: "v3.5.4-compare-fix"

✅ Polish Brief 01 ✅ COMPLETE
  - wolfram.js: added .replace(/\)\s+\(/, ')*(') before the existing ')(' rule
    in stripLatexForWolfram. Handles Wolfram's space-separated implicit mult
    (") (" with space) that the adjacent ")(" rule missed. Fixes remaining
    cas.verdict: "unavailable" for trig results with sec/csc/cot + space terms.
  - Action cluster visibility: ghosts (opacity-0, group-hover:opacity-100)
    only when splitKind !== null (split is showing). When splitKind === null:
    always opacity-100 at text-zinc-500. Proof-open exception preserved.
  - Advanced verification loading messages: "Querying external solver...",
    "Parsing result...", "Comparing answers...", "Finalising verdict...".
    Dwell time increased to 1500ms per message (was 600ms). Messages stack
    and persist until result arrives, then fade together.
  - Math/Physics tabs: opacity-40 when artifact !== null (solution displayed),
    full opacity on hover via onMouseEnter/Leave. Full opacity when no artifact.
    Interactive bookmark tab unaffected.
  - Solution sections: replaced card borders + FlowDivider with vertical
    connector line (absolute left-0 w-px bg-white/[0.08]) and step dots
    (7px rounded-full bg-zinc-700 ring-1 ring-zinc-900). Steps feel
    continuous and proof-like. FlowDivider component and all instances removed.
    "Why this works" toggle preserved (renamed "Hide concept" when open).
  - BUILD_VERSION: "v3.5.5-polish"

✅ Polish Brief 02 — Solution Presentation Pass ✅ COMPLETE
  - Math + physics system prompts: overview rule updated to require specific
    expression/values, not just problem type. Examples added to both prompts
    showing expected specificity ("differentiate sin(x²) using the chain rule"
    not "differentiation of composite function").
  - Overview demoted to subtitle: no longer a labeled section. Renders as
    single text-[12px] text-zinc-600 line directly below answer box (mt-3,
    no container, no label). Conditional on non-empty string.
  - Section titles: text-[15px] text-zinc-100 font-medium leading-snug (was
    text-[13px] text-zinc-200). One step up in size and brightness.
  - Partial right-side step separators: absolute bottom-0 right-0, h-px,
    bg-white/[0.04], width calc(100%/6). Between all steps except last.
  - Compact answer box: outer card py-4 (was py-5). Split columns use
    min-h-[140px] flex-col items-center justify-center px-5 py-4 (was
    flex-1 pr-2/pl-2 with no explicit height). items-center on flex row.
  - Sticky answer bar: IntersectionObserver on answerBoxRef. Fixed bar at
    left:240px right:0 height:40px z-[25], bg-zinc-950/90 backdrop-blur-sm,
    border-b white/[0.06]. Contains: 2px color indicator (emerald/amber/
    zinc-600), InlineMath at 0.85em, split symbol in matching color.
    translate-y + opacity transition 300ms. Resets on new solve/handleReset.
  - BUILD_VERSION: "v3.5.8-polish-03b"

✅ Polish Brief 03a — Four Small Fixes ✅ COMPLETE
  - Explanation text: text-[14px] text-zinc-300 (was text-[13px] text-zinc-400).
  - Step separators: bg-white/[0.07] (was bg-white/[0.04]). Visible as
    intentional line rather than invisible artifact.
  - Overview text: text-[13px] text-zinc-400 (was text-[12px] text-zinc-600).
  - Concept field prompts (math + physics): updated to instruct explicit
    component mapping for composition/substitution/multi-part rules. Direct
    standard derivatives exempt from forced tracing. 2–3 sentence target.
    Never restate summary_latex. Physics version names specific quantities.
  - BUILD_VERSION: "v3.5.8-polish-03b"

✅ Polish Brief 03b — Sticky Answer Bar Rethink ✅ COMPLETE
  - Previous bar (Polish Brief 02) deleted entirely — was visually heavy
    (backdrop-blur, border-bottom, 40px height, oversized KaTeX).
  - Rebuilt: h-9 (36px), fixed top-0 left-[240px] right-0, z-[25],
    bg-zinc-950/75 (no blur, no border), shadow-sm only.
  - Content: 2px color bar (emerald/amber/zinc-700) → "SOLUTION" label
    (10px uppercase tracking-widest zinc-500) → separator dot (zinc-700)
    → InlineMath at 0.82em with display-mode inline overrides → badge pill
    (10px rounded-full, color-matched). Long answers truncate via
    overflow-hidden whitespace-nowrap.
  - Badge pill: "Confirmed" (emerald), "Discrepancy" (amber), "Checked"/
    "Not verified" (zinc). Derived from splitKind + verification.badge.
  - State/ref/observer logic (showStickyBar, answerBoxRef,
    IntersectionObserver) unchanged from Polish Brief 02.
  - BUILD_VERSION: "v3.5.8-polish-03b"

🔲 Phase 4 — Deployment
Vercel (frontend) + Railway/Render (backend), domain, meta/OG tags, env-var API URL.

🔲 Phase 5 — Auth & Monetization
Accounts, free tier limiting, Pro gating, Stripe.

🔲 Phase 6 — Interactive Mode (Full)
Conversational follow-up on solved problems, concept exploration, related examples.

🔲 Phase 7 — Analytics
Verification tier tracking, failure reasons, suggestion usage, conversion funnel,
cost-per-solve.
```

---

## Section 10 — Current Code State (replace entire section)

```
10. Current Code State

Backend (/backend)
  - Express + @anthropic-ai/sdk (OpenAI fully removed)
  - Model: claude-sonnet-4-5 for solution generation (SOLUTION_MODEL env var override supported)
  - /solve: working; reads mode, ignores detailLevel (removed)
  - Validation engine: solid (equation substitution, system checks,
    inequality, numeric, MVP fallbacks)
  - artifact.js: badge, certainty, reason_code, user_reason, suggestions
  - Tier 2 normalization: LIVE — normalized_expression embedded in solution
    call, returned alongside solution, used for deterministic validation retry
  - normalizeQuestionForModel(): utility function exists to strip method verbs
    ("factor", "expand", etc.) from question before model call — carry forward
    in all future prompt changes
  - Math prompt: student-audience system prompt, concept field explicitly
    instructed to explain *why* in plain language
  - Physics prompt: structured JSON path, concept field live, mirrors math path.
    detailLevel switch removed. temperature: 0.3.
  - Physics verification: unchanged, returns unavailable/physics_not_supported
  - artifact.js: structuredSolution used for both modes (mode guard removed);
    advancedVerificationUsed param accepted and written to cost_meta
  - Verification input priority: normalized_expression is now primary input to
    verifyMathAnswer; raw input (mathPayload) is fallback only. If model returns
    no normalized_expression, raw input is sole attempt. normalizedUsed flag
    reflects which input actually produced the final result.
  - sanitizeCommonTypos(): collapses repeated connector words (and/or/with) at
    input entry. hadTypos flag → 'input_may_have_typos' reason on unavailable.
  - detectMixedProseInput(): heuristic prose+math flag. MATH_INSTRUCTION_PHRASES
    exemption list prevents false positives on valid math instructions (find the
    eigenvalues, differentiate, integrate, etc.). Does not block solve.
  - artifact.js: 'input_may_have_typos' → PARSER_FAILED;
    'mixed_prose_input' → PARSER_AMBIGUOUS. Both surface correct chips.
  - Math/physics prompts: `graphable` and `graph_expression` fields added to
    JSON schema. Model instructs when to set true and provides Desmos-ready
    expression string.
  - artifact.js: extracts graphable/graph_expression from structuredSolution;
    guard forces graphable:false if expression is empty. Writes
    `graph: { graphable, expression }` to artifact at top level.
  - wolfram.js: four exported functions:
      stripLatexForWolfram(latex) — LaTeX to plain math conversion including
        letter→function implicit mult (xsin(→x*sin(), power→letter rule
        (x^2ln→x^2*ln), negative lookbehind protecting ^2( from ^2*(.
      buildWolframQuery(question, kind) — legacy regex-based query builder.
        Still in codebase, no longer called in CAS path.
      compareWithWolfram(claudeAnswer, wolframResult, kind) — three-tier:
        numeric sampling → string normalize → unavailable. toMathjs() helper:
        strips LaTeX, extracts RHS when expression contains = (handles model
        writing simplification steps as "A = B"), expands trig shorthands
        (sec→1/cos, csc→1/sin, cot→cos/sin) via expandTrigShorthands() for
        math.js compatibility. Converts ln()→log(). Never false-positive.
        Known limit: expandTrigShorthands regex is single-depth paren only.
      inferKindFromQuery(query) — reads model-generated query string to determine
        Wolfram pod lookup kind (differentiation/integration/simplification/equation).
        Replaces detectOperationKind() in CAS routing.
  - wolfram_query: model generates Wolfram Alpha-ready query in same solution
    call (zero extra cost/latency). Targets Wolfram syntax specifically
    (d/dx[...], ln(x)) — distinct from normalized_expression (math.js syntax).
    Equations/systems return null; Tier 1 handles those. Extracted in index.js
    parsing block as wolframQueryFromModel, stored on structuredSolution.
  - physicsAudit.js: LIVE — second Claude call (claude-sonnet-4-5, temp 0.3)
    instructed to use a different physical method. Returns { agrees,
    audit_answer, method, confidence, note, dimensional }. Lightweight unit
    regex for dimensional analysis.
  - CAS routing (index.js): wolframQuery = structuredSolution.wolfram_query.
    If null → skip (log reason), verdict unavailable. If present →
    queryWolfram(wolframQuery, inferKindFromQuery(wolframQuery)) →
    compareWithWolfram(). Physics path unchanged (uses physicsAudit.js).
  - artifact.js: accepts casResult + auditResult. Writes cas: { verdict,
    wolfram_result, expression_checked, used } and audit: { verdict,
    audit_answer, method, confidence, note, dimensional, used }.
    cost_meta includes cas_used and audit_used booleans.
  - Math/physics system prompts: audience reframed to technically literate
    grad students. explanation "justify the move, don't describe it" (2–3
    sentences dense). concept "name the principle, apply it directly" (1–2
    sentences, no definitions). overview one sentence. No logic changes.
  - normalizeQuestionForModel(): strips only conversational filler (please,
    can you, could you, etc.). All math operation verbs preserved intact.
  - verifyDirectEquality(): new fast path in verifyMathAnswer — evaluates
    both sides of single-equation inputs numerically via math.js. Covers
    sin(pi/4)=sqrt(2)/2, cos(0)=1, and all pure trig/numeric evaluations.
    Called before substitution path; falls through if free variables present.
  - artifact.js: physics badge override — when auditResult.used, sets
    badge→"checked", method→"cross_method_audit", user_reason reflects audit
    outcome. Without audit: "Use Cross-Method Audit for an independent check."
  - Solution model reverted to claude-sonnet-4-5 (founder decision).
  - SOLUTION_MODEL env var allows override. artifact.js cost_meta.model reads from env.
  - BUILD_VERSION: "v3.5.8-polish-03b"

Frontend (/frontend/src/app/page.tsx)
  - Next.js + Tailwind + KaTeX + Framer Motion
  - Geist Sans base, DM Serif Display for wordmark + slogan,
    JetBrains Mono for proof values
  - Zinc monochrome color system (no blue except badges)
  - Layout structure: [left panel 240px fixed] [main content with ml-60]
  - No top header. Left panel is the sole navigation surface (fixed left-0
    top-0 h-screen w-60 z-30, bg-zinc-950, border-r white/[0.08]):
    Ergo. logo at top (DM Serif Display 22px, calls handleReset()), Home
    button, SESSIONS section (sign-in CTA, no-op pre-Phase 5), then Profile /
    Settings / Help anchored at bottom (mt-auto). Profile click = same no-op
    as Sign in. Main canvas extends from viewport top (pt-8 only).
  - handleReset(): clears artifact, question, ghostQuestion, all panels,
    mathKeyboardOpen, graphOpen. Called by panel logo and panel Home.
  - Animated input (idle centered in content area → active bottom, 380ms ease-out)
    left: calc(50%+120px), transform: translateX(-50%). Width: 700px idle,
    calc(100%-240px) active — fills content area width exactly.
  - Dot pattern background: left edge pinned at 240px, fades on solve.
  - Slogan: centered in content area via left: calc(50%+120px)
    transform: translateX(-50%) translateY(-50%). Fades on solve.
  - Interactive mode bookmark tab (state persists across solves, UI only)
    z-index 22/25 to ensure full hitbox above mode tabs
  - History: placeholder removed entirely
  - Right rail: removed entirely — no vestigial code
  - Study mode: removed
  - Ghost text: submitted question persists as placeholder after solve;
    cleared when user types (ghostQuestion state)
  - Input locked during loading: textarea + tabs + bookmark disabled={loading}
  - Textarea placeholder: ghostQuestion (priority) || rotating examples
  - MATH_EXAMPLES (5) + PHYSICS_EXAMPLES (4): full problem strings, rotate
    as placeholder at 2500ms interval
  - Action cluster: opacity-0 by default, group-hover:opacity-100 on Final Answer
    card (200ms transition). Stays opacity-100 when showProofDetails is true.
    Advanced verification button: disabled={!!advancedVerifResult} with
    text-zinc-700 cursor-not-allowed pointer-events-none when used.
  - Suggestion chips: displayedSuggestions filters RUN_ADVANCED_VERIFICATION
    when advancedVerifResult is populated.
  - Math keyboard: symbol overlay, insert at cursor, Σ toggle
  - Format hint: mode-aware panel, renders above composer on showFormatHint
  - Advanced verification: auto-fires on first solve (hasSeenAdvancedVerification
    state). taste gate (3/month free), Pro upsell gate (href="#" placeholder).
    advancedVerifResult holds full Artifact. splitKind ('discrepancy' |
    'confirmed' | null) drives in-box split layout:
      confirmed → emerald header "✓ Confirmed", = symbol, emerald color
      discrepancy → amber header "⚠ Discrepancy Detected", ≠/! symbol
      null → simple one-line note ("External check unavailable...") below answer
    Split renders inside Final Answer box replacing centered BlockMath.
    Right column: direct JetBrains Mono rendering (Wolfram returns plaintext
    not valid LaTeX). Null fallback: italic "Result unavailable" in zinc-500.
    Column headers centered. user_reason hidden once advancedVerifResult set.
    Wedge animation: Path A (auto-fire) parks data in pendingAdvancedResult
    ref, runs ~2350ms choreography. Path B (manual) starts animation on click,
    polls for API response at 50ms. artifactRef prevents stale closure in
    triggerReveal. wedgeActive gates JSX branch.
  - Composer: zIndex dynamic via inline style (isActive ? 20 : 10). Removed
    fixed z-50 class. Active at 20 — above solution content, below graph
    popover (z-40) and left panel (z-30).
  - Mode tabs: opacity 0.4 during loading, 1 otherwise (transition-opacity 200ms).
  - Solution bottom padding: pb-[280px] (was 220px) prevents tab strip overlap.
  - KaTeX scaling: final answer [&_.katex]:text-[1.4em]; section equations
    [&_.katex]:text-[1.1em]; left-aligned, overflow-x-auto wrapper on sections
  - Section titles: label style (13px uppercase tracking zinc-400)
  - Explanation text: 14px leading-7 zinc-300
  - "Why this works": state-aware colors, mt-3, concept panel left-border
  - Graph: graphOpen state (replaces showGraph). "View graph" renders only
    when artifact.graph.graphable === true; hidden otherwise. Graph popover:
    fixed top-20 right-6, w-[500px] h-[400px], z-40, floats over content
    (does not push layout). Header strip: "GRAPH" label + SVG × close button.
    Desmos embed h-[360px], "Open in Desmos ↗" URL-param link bottom-right.
    Framer Motion AnimatePresence: opacity+scale on open/close. 100ms
    setExpression delay preserved. Graph modal (fixed inset-0 backdrop) removed.
  - Artifact type: cas?, audit?, graph? all unchanged.
  - Certainty dot suppressed when badge === "checked".
  - Action cluster physics button: "Cross-method audit".
```

## 11a. What Claude Code Should Never Do

- Re-introduce a permanent right rail
- Collapse or hide procedural solve sections
- Use "Step 1 / Step 2 / Step 3" structure
- Create "AI checks AI" correctness architecture
- Make a separate API call for normalization (it's embedded in the solution call)
- Add generic suggestion chips not tied to failure reason
- Duplicate controls in multiple places
- Add verbose copy to the header
- Make the graph panel persistent layout
- Guess at code structure — always read the actual file first
- Reintroduce any blue colors (except emerald/amber functional badges)
- Use Inter or any font other than Geist Sans for UI text
- Reset `interactiveMode` state on new solves — it persists
- Use OpenAI after Phase 2a is complete
- Strategic open questions are logged in STRATEGIC_DECISIONS.md. Do not act on them. Reference only when explicitly asked or when a trigger condition is met.
- Build for an engineer-in-industry use case. The audience is students in technical
  programs. See STRATEGIC_DECISIONS.md for full audience decision reasoning.

---
## 11b. What Claude Code Must Always Do

- After completing any phase or named task, update CLAUDE.md immediately:
  mark the phase ✅ complete, add a brief bullet list of what was actually
  implemented, and update Section 10 (Current Code State) to reflect the
  new state. Do this before closing the session.
---
## 12. One-Paragraph Product Summary

Ergo. is a trust-first math and physics solver whose differentiator is visible correctness, not just AI output. It serves anyone who needs a correct, verifiable answer — engineers, researchers, advanced students, professionals. The solve experience is a single vertical flow: input → answer → visible verification state → overview → visible procedural sections → optional depth on demand. Radically minimal: no rail, no duplicated controls, no chat feel, no collapsed steps. Deterministic validation (math.js) is the backbone. Normalization is embedded in the solution call at zero extra cost. CAS is gated behind the paid tier ($12/month Pro). The interface feels like an environment — dark, precise, monochrome zinc, DM Serif Display for identity, Geist Sans for everything functional. The business target is 250–300 Pro users for $2,000+/month net, driven by SEO and a free tier conversion funnel.
