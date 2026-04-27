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
- Normalization: embedded in solution call — no separate model
- CAS future: claude-sonnet-4-5
- OpenAI: fully removed

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
  - BUILD_VERSION: "v3.2.1-fixes"

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
  - Model: claude-sonnet-4-5 for all solution generation
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
  - wolfram.js: LIVE — queries Wolfram Full Results API (native fetch). Extracts
    Result pod plaintext. Returns { success, result, raw }. WOLFRAM_APP_ID from
    env. No new npm dependencies.
  - physicsAudit.js: LIVE — second Claude call (claude-sonnet-4-5, temp 0.3)
    instructed to use a different physical method. Returns { agrees,
    audit_answer, method, confidence, note, dimensional }. Lightweight unit
    regex for dimensional analysis.
  - /solve: when advanced:true — math path calls wolfram.js, loose comparison
    yields verdict (confirmed/discrepancy/unavailable). Physics path calls
    physicsAudit.js. Both results passed into buildProblemArtifact.
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
  - wolfram.js: stripLatexForWolfram() converts LaTeX to plain math before
    every Wolfram API call. Logs raw + stripped expression.
  - verifyDirectEquality(): new fast path in verifyMathAnswer — evaluates
    both sides of single-equation inputs numerically via math.js. Covers
    sin(pi/4)=sqrt(2)/2, cos(0)=1, and all pure trig/numeric evaluations.
    Called before substitution path; falls through if free variables present.
  - artifact.js: physics badge override — when auditResult.used, sets
    badge→"checked", method→"cross_method_audit", user_reason reflects audit
    outcome. Without audit: "Use Cross-Method Audit for an independent check."
  - BUILD_VERSION: "v3.2.1-fixes"

Frontend (/frontend/src/app/page.tsx)
  - Next.js + Tailwind + KaTeX
  - Geist Sans base, DM Serif Display for wordmark + slogan,
    JetBrains Mono for proof values
  - Zinc monochrome color system (no blue except badges)
  - Animated input (idle centered → active bottom, 380ms ease-out)
  - Dot pattern background (empty state, fades on solve)
  - Interactive mode bookmark tab (state persists across solves, UI only)
    z-index 22/25 to ensure full hitbox above mode tabs
  - Header: Ergo. wordmark is now a button — onClick resets all state to idle.
    No page reload. Profile + plain-lines menu unchanged.
  - History: workspace top-left placeholder
  - Right rail: removed
  - Study mode: removed (state, button, and study flow block all gone)
  - Ghost text: submitted question persists as placeholder after solve;
    cleared when user types (ghostQuestion state)
  - Input locked during loading: textarea + tabs + bookmark disabled={loading}
  - Textarea placeholder: ghostQuestion (priority) || rotating examples
  - MATH_EXAMPLES (5) + PHYSICS_EXAMPLES (4): full problem strings, rotate
    as placeholder at 2500ms interval
  - Action cluster: footnote-weight text links (zinc-600), not pill buttons
  - Suggestion chips: gated behind artifact.suggestions.length > 0 only
  - Math keyboard: symbol overlay, insert at cursor, Σ toggle
  - Format hint: mode-aware panel, renders above composer on showFormatHint
  - Advanced verification: taste gate (3/month free), Pro upsell gate
    (href="#" placeholder). advancedVerifResult now holds full Artifact.
    Math panel: Wolfram verdict — emerald "Confirmed by Wolfram Alpha",
    amber "Wolfram Alpha returned a different result" + result in JetBrains
    Mono, zinc "Wolfram Alpha could not evaluate this expression".
    Physics panel: labeled "AUDIT"; shows consistent/inconsistent verdict,
    method used, dimensional analysis line. Never uses "Verified" for physics.
  - KaTeX scaling: final answer [&_.katex]:text-[1.4em]; section equations
    [&_.katex]:text-[1.1em]; left-aligned, overflow-x-auto wrapper on sections
  - Section titles: label style (13px uppercase tracking zinc-400, not bold 17px)
  - Explanation text: 14px leading-7 zinc-300 (was 15px leading-8 zinc-200)
  - "Why this works": state-aware colors, mt-3, concept panel left-border
    (border-l border-white/[0.08] bg-white/[0.02] leading-7 zinc-400)
  - Graph: LIVE — Artifact type includes `graph?: { graphable, expression }`.
    Desmos script loaded once on mount. showGraph state resets on doSolve and
    logo click. "View graph" renders only when artifact.graph.graphable === true;
    hidden entirely otherwise. Graph modal: fixed z-50 overlay, max-w-2xl
    container, h-[480px] Desmos embed, "Open in Desmos ↗" link, close on
    backdrop or × button. Calculator options: expressions/keypad/settingsMenu
    false, zoomButtons true.
  - Artifact type: includes cas?: { verdict, wolfram_result, expression_checked,
    used } and audit?: { verdict, audit_answer, method, confidence, note,
    dimensional, used }.
  - Certainty dot suppressed when badge === "checked" — only shown for
    "verified" and "discrepancy_detected".
  - Desmos setExpression called with 100ms delay after GraphingCalculator
    init to ensure internal Desmos state is ready.
  - Action cluster physics button: "Cross-method audit" (was "Advanced verification").
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
