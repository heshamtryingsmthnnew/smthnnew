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

### Pivot 7: Per-user data layer added
Phase 4 introduces Supabase as the data backbone. Auth, history, and the
library all live in Postgres. Anonymous solves still work fully — auth is
optional, surfaces history. The library accumulates regardless of auth state.

### Pivot 9: Batch as workflow tool, not answer dump
Phase 5 adds batch solve. Design discipline locked: click-through-only-
for-answers, no bulk export, discrepancy-first navigation. Batch must
make verification more visible per problem, not less, even though more
problems are processed at once. This is the line that keeps Ergo aligned
with trust-first identity rather than drifting toward homework-dump.

### Pivot 8: Deployment re-sequenced after feature build
Original plan was to deploy a single-solve product first (old Phase 4),
then add auth and features. Re-sequenced so that History + Auth + Batch
ship before deployment. Rationale: the public's first exposure to Ergo
should be the workflow product, not a single-feature version that would
generate "neat, never came back" reactions. Deployment becomes Phase 6.

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

### Session Tab (Phase 5a)
- Fixed top-0, h-9, centered in content area.
  left: calc(50% + sidebarWidth/2), transform: translateX(-50%).
  Responsive to sidebar collapse state via sidebarWidth computed var.
  z-[26] — sits above sticky answer bar (z-[25]), below left panel (z-30).
- Empty state: low-opacity (8–12%) DM Serif Display "Ergo." watermark
  inside a subtle tab frame. No fill. No animation on the element itself.
- After first solve: watermark fades out, session title fades in.
  200–300ms content swap. Element does not animate — content only.
- After 2+ solves in session: forward/back arrows flank the title for
  navigating between problems in that session.
- Click title: inline rename (contentEditable or input swap).
- Chevron/dots icon: opens session switcher (v1 scope TBD).
- Sticky answer bar shifts from top-0 to top-9 to sit directly below
  session tab. Both are always-present strips; sticky bar still uses
  IntersectionObserver to slide in only when answer box scrolls out of view.
- Solution view: pt-20 to accommodate both strips stacked at the top.

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

### Step-Level Verification (locked)

Pre-Deployment Phase 5b feature. Architecture is final.

**What it does:** Each solution section is classified by step kind.
Only deterministically-checkable steps are verified. All others are
labeled honestly. No AI correctness judgment anywhere in this path.

**Model output change — one new field per section:**
`step_kind: 'transformation' | 'derivation' | 'application' | 'evaluation' | 'conceptual'`
No new LaTeX fields. Zero additional equation output. Negligible token cost.

**Server verification logic (deterministic only, no AI):**
- `transformation` — equivalence check: compare this section's
  `summary_latex` against the previous section's `summary_latex`
  using existing numeric sampling (math.js). Verdict: verified |
  mismatch | unverifiable. Never false-positive — inconclusive
  sampling falls through to unverifiable, never mismatch.
- `evaluation` — numeric equality check on both sides if evaluable.
- `derivation`, `application`, `conceptual` — not equivalence-checkable.
  No badge. Labeled honestly in UI. Never faked as verified.

**Free vs Pro gating:**
- Free: step badges visible on transformation/evaluation sections
  (verified / mismatch / unverifiable / method-applied labels)
- Pro: step diagnostic on mismatch — which step failed, evaluated
  forms on both sides. Diagnostic is informational only. Never
  overrides the final answer badge.

**Hard rule:** The model classifies step_kind only. It never assesses,
confirms, or checks correctness of any step. Classification is a
labeling task. Deterministic math.js is the sole correctness authority
for transformation steps. Fully consistent with the no-AI-checks-AI rule.

**Bridge to future proprietary CAS:**
The step_kind taxonomy is permanent infrastructure. When a proprietary
CAS ships (logged in STRATEGIC_DECISIONS.md), derivation and application
steps gain verification coverage without any refactor. The UI and
architecture are unchanged — more step kinds earn badges over time.

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

### Deployment + Monetization
Phase 6 combines deployment and Stripe. The product ships with
monetization on day one. No free-only launch period.
Rationale: free-only launch generates API costs with no revenue signal
and no conversion data to optimize against.

### Pro Tier Value (locked)
Pro is not limit removal only. The following are Pro-exclusive:
- CAS / Advanced verification
- Step diagnostics (mismatch detail)
- Collections (create, organize, auto-organize)
- Export: PDF, LaTeX, Anki — single solve and collections
- Batch solve up to 50 problems (free: 15)
- Full solve history

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

✅ Model Switch — Haiku tested, reverted to Sonnet ✅ COMPLETE
  - claude-haiku-4-5 tested for primary /solve call. Passed quality bar:
    69/80 Haiku vs 69/80 Sonnet (100%) on 8-problem test matrix (MODEL_COMPARISON.md).
  - Reverted to claude-sonnet-4-5 by founder decision. Haiku not in production.
  - physicsAudit.js stays on claude-sonnet-4-5.
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

✅ CAS Observability — Phase 1 of comparison-layer rebuild ✅ COMPLETE
  - Root motivation: compareWithWolfram has accreted six fix passes of regex
    rules. Cases do not converge. Real production failure data required before
    any further redesign. Test harness deferred to Phase 2.
  - backend/casLogger.js: new module. logCasEvent(event) appends JSONL to
    backend/logs/cas-events.jsonl. Directory created on module load via
    mkdirSync recursive. Synchronous appendFileSync. Write failures logged
    to console, never thrown — CAS path unaffected by logger failures.
  - backend/index.js: logCasEvent called at end of math-mode CAS branch,
    both success and skip paths. Skip path logged with wolfram_success:false,
    wolfram_result:null, verdict:unavailable (intentional — measures model
    null-query rate).
  - Event schema: timestamp, build_version, question, mode, wolfram_query,
    wolfram_kind, wolfram_success, wolfram_result, claude_answer, verdict,
    numeric_attempts (null — Phase 2), numeric_matches (null — Phase 2).
  - backend/scripts/read-cas-log.js: utility reader. Total count, verdict
    breakdown, kind breakdown, last N events with truncated fields.
    Node stdlib only. Skips malformed lines without crashing.
  - backend/logs/ added to backend/.gitignore.
  - compareWithWolfram, prompts, schema, model calls, frontend: all unchanged.
  - Phase 2 (regression harness) blocked on real captured data.
  - BUILD_VERSION: "v3.6.0-cas-compare-rebuild"

✅ CAS Comparison Rebuild — Phase 2: harness + model equivalence tier ✅ COMPLETE
  - Harness: backend/wolfram_compare_test.js — 10 test cases covering WORKING,
    B1 (inverse trig), B2 (log as ln), B3 (nested trig), CORRECT_DISCREPANCY,
    CORRECT_UNAVAILABLE. Loads dotenv for API key. Run with
    node backend/wolfram_compare_test.js.
  - Baseline before changes: 6/10 (B1: 0/2, B2: 0/2).
  - compareWithWolfram: now async. Two fixes beyond the brief:
    (a) Markdown fence stripping — model wraps JSON in ```json``` blocks,
        stripped before JSON.parse.
    (b) Space-separated implicit mult in toMathjs() — Wolfram outputs
        "x^2 log(x)" with space; three targeted replace rules added for
        ^N-space-letter, digit-space-func(), letter-space-func() patterns.
  - String normalization tier (old Tier B) removed entirely.
  - Model equivalence tier: checkEquivalenceWithModel() calls
    claude-haiku-4-5-20251001, temperature 0, 8s timeout, strict JSON.
    Handles B1, B2, B3, algebraic equivalence. All failures degrade to unavailable.
  - Sample points expanded from 3 to 5 in tryNumericSample.
  - Final harness: 10/10 (all categories passing).
  - index.js: compareWithWolfram call updated to await.
  - casLogger.js: verdict_tier: null placeholder added for Phase 3.
  - BUILD_VERSION: "v3.6.0-cas-compare-rebuild"

✅ UI Polish Brief 04 — Identity Pass ✅ COMPLETE
  - Section layout: reordered to title → explanation → equation. Equation
    container gets pl-4 border-l border-white/[0.06] indent treatment —
    reads as derived result rather than preamble. Same border-l language
    as step connector line.
  - Answer box: min-h confirmed absent from single-answer path. Card height
    is content-sized. Split view min-h-[140px] on columns preserved.
  - Overview: text-[14px] leading-6 text-zinc-200 font-medium. Reads at
    same visual tier as section titles.
  - Logo: pl-3 added to wordmark button — aligns left edge with sidebar
    nav items (Home, Profile, etc.).
  - Grain texture: fixed inset-0 z-0 SVG feTurbulence overlay at opacity
    0.028. Always present. fractalNoise baseFrequency 0.65, 3 octaves,
    saturate 0. Adds material depth without adding color or pattern.
  - Line motif extended to three locations:
    (1) Input focus accent: absolute left-0 1px amber line inside composer
        container, opacity-40 on focus via inputFocused state. onFocus/onBlur
        wired to textarea. Matches wedge line visual language.
    (2) Slogan underline: 1px w-8 centered horizontal line below "The answer,
        and the proof." at bg-white/20. Marks slogan as unit.
    (3) Sidebar bottom section: border-t border-white/[0.06] on the mt-auto
        container div, pt-3 for spacing. Separate border div removed.
  - BUILD_VERSION: "v3.7.0-identity"

✅ UI Polish Brief 05 — Split Fix + Rail Pattern ✅ COMPLETE
  - Split height alignment: items-start → items-center on two-column container.
    Both columns now vertically center their content. Divider line and =/≠
    symbol align with midpoint of both expressions.
  - Wolfram result display: RHS extraction — raw pod plaintext for diff/integral
    included d/dx(...) = prefix. Now splits on '=' and takes last segment for
    display. wolframDisplay computed inline before return. Applied to both
    static split path and wedge path. KaTeXBoundary wraps right column in
    both paths: attempts BlockMath at 1.1em, falls back to JetBrains Mono
    text-sm on parse failure.
  - Amber input accent removed: inputFocused state, onFocus/onBlur handlers,
    and absolute amber line element all removed from composer.
  - Grain opacity: 0.028 → 0.055. Visible as material texture.
  - Left rail pattern: vertical stripe SVG data URI on sidebar aside element.
    1px white stripe every 12px, rgba(255,255,255,0.03). backgroundRepeat
    repeat-x, backgroundSize 12px 100%. h-full replaces h-screen.
    border-white/[0.06] (was 0.08).
  - Slogan underline (from Polish Brief 04) preserved.
  - BUILD_VERSION: "v3.7.2-polish-05"

✅ Performance + Wolfram Coverage Brief ✅ COMPLETE
  - max_tokens: 2048 → 1200 on both math and physics solve calls. Eliminates
    tail latency from reserving unused token window.
  - CAS decoupled from /solve: isAdvanced block removed entirely. New POST
    /verify endpoint accepts { mode, wolfram_query, final_answer_latex,
    question, structured_solution } and runs CAS (math) or audit (physics)
    independently. casLogger call moved to /verify.
  - artifact.js: wolfram_query added to solution object in artifact output.
    Frontend reads this to pass to /verify without re-running the model.
  - Frontend: /solve always called without advanced flag — { question, mode }
    only. After solve returns and artifact renders, shouldAutoFire triggers
    background /verify call (not awaited — answer visible immediately).
    mergedArtifact constructed from solveArtifact + verifyData, parked in
    pendingAdvancedResult.current. advancedResultReady set on response or
    catch (no-op result on failure). Manual advanced verify button updated
    to call /verify instead of /solve+advanced:true, same merge logic.
  - Artifact TypeScript type: wolfram_query: string | null added to solution.
  - /solve call uses NEXT_PUBLIC_API_URL env var (with localhost fallback).
  - Wolfram limit support: inferKindFromQuery detects lim/limit queries →
    returns 'limit'. podTargets.limit: ['Limit', 'Value', 'Limit result'].
  - Wolfram implicit differentiation: math system prompt updated with carve-out
    and two examples. inferKindFromQuery detects implicit/implicitly/dy/dx+= →
    returns 'differentiation' (Derivative pod). Before equation check.
  - compareWithWolfram toMathjs(): ∞ and 'infinity' → 'Infinity' added
    immediately after integration constant stripping.
  - BUILD_VERSION: "v3.8.0-perf-wolfram"

✅ Polish Brief 06 — Fixes + Sidebar Collapse ✅ COMPLETE
  - Wolfram implicit_differentiation: new kind in inferKindFromQuery (detects
    'implicit'/'implicitly'/dy/dx+eq). podTargets.implicit_differentiation:
    ['Result', 'Derivative', 'Derivative of input']. Targets Result pod first
    (where Wolfram places implicit diff answer). Check added before plain
    differentiation check.
  - Graph prompt tightened: graphable:true restricted to explicit y=f(x),
    parametric, or direct inequalities only. Explicit false for derivatives,
    implicit expressions, piecewise. Same restriction applied to physics prompt.
    artifact.js guard added for dy/dx and unresolved implicit expressions
    (expression contains dy/dx, or dy, or = with both x and y and doesn't
    start with y=). graphExpression changed from const to let.
  - Answer box height: outer card py-4 → py-5. min-h-[140px] already isolated
    inside splitKind !== null conditional (no further change needed).
  - Sidebar collapse: sidebarCollapsed state. Width 240→56px on toggle via
    inline style (transition-all duration-200). Ergo.→E. when collapsed. Nav
    labels hidden, icons centered (justify-center px-0 vs gap-3 px-3).
    Sessions section hidden when collapsed. Chevron toggle button top-right of
    sidebar header row. sidebarWidth + contentOffset computed vars update
    sticky bar left, slogan left, main content marginLeft, dot pattern left,
    and composer left/width dynamically.
  - Advanced verification: RUN_ADVANCED_VERIFICATION chip now highlights the
    Advanced verification button (ring-1 ring-white/20, text-zinc-100, 2s
    pulse via setTimeout) instead of firing separately. advancedVerifFired
    state — button disabled+opacity-40 after firing, resets on new solve.
    Disabled condition changed from !!advancedVerifResult to advancedVerifFired.
  - Scrollbar: scrollbar-width:none + -ms-overflow-style:none +
    ::-webkit-scrollbar {display:none} in globals.css. Scroll still works.
  - Dot matrix: rgba opacity 0.08→0.28, radius 1px→1.5px. Perceptibly
    visible in idle state.
  - Sidebar corner accent: absolute bottom-0 left-0 h-20 w-20 div with SVG
    diagonal crosshatch data URI at rgba(255,255,255,0.07). maskImage radial
    gradient fades from corner. Replaces full-width vertical stripe from
    Polish Brief 04/05 — backgroundImage on aside element removed.
  - BUILD_VERSION: "v3.9.0-polish-06"

✅ Polish Brief 07 — Sidebar Hover-Peek + Display Fixes ✅ COMPLETE
  - Sidebar hover-peek: sidebarCollapsed + sidebarPeeking states.
    sidebarOpen = !sidebarCollapsed || sidebarPeeking. Toggle button (panel
    icon SVG — rect+line) visible only when !sidebarCollapsed. Collapsed →
    button gone, no expand button shown. onMouseEnter when collapsed:
    sidebarPeeking=true (expands visually to w-60). onMouseLeave: resets to
    false. Click while peeking: setSidebarCollapsed(false) + setSidebarPeeking(false)
    → locks open. cursor-pointer on aside when peeking. stopPropagation on
    all inner buttons to avoid triggering aside onClick. Logo E./Ergo., nav
    labels, sessions section, bottom labels all conditioned on sidebarOpen.
    sidebarWidth = sidebarOpen ? 240 : 56. All dependent elements (sticky bar
    left, slogan, main content marginLeft, dot pattern left, composer left/width)
    track sidebarWidth dynamically.
  - Dot matrix: rgba(255,255,255,0.28) 1.5px → rgba(255,255,255,0.18) 1px.
    Ambient texture, not foreground pattern.
  - advancedVerifFired: set true only in handleAdvancedVerification (manual
    click path). Auto-fire background /verify path confirmed not setting it.
    Button greys only after explicit user action.
  - Bottom frame: mb-1 added to answer card outer div. Creates 4px gap below
    card so bottom border reads as frame below the split view.
  - Overview separator: h-px bg-white/[0.05] mt-4 mb-2 div between overview
    and sections. Conditional on both overview and sections being non-empty.
    mt-4 on section container reduced to mt-2 (separator provides spacing).
  - Wolfram log→ln: wolframDisplay adds .replace(/\blog\(/g, 'ln(') after RHS
    extraction. Display-only — compareWithWolfram logic unchanged.
  - BUILD_VERSION: "v3.9.1-polish-07"

✅ Image Upload — Single Problem Extraction ✅ COMPLETE
  - POST /extract-problem: multer memory storage, 10MB limit, image/* only.
    Calls claude-haiku-4-5-20251001 with vision. Extracts problems as JSON
    array. Returns mode: single/multiple/none. multer added to package.json.
  - Single: drops directly into question state. Multiple: disambiguation UI
    replaces textarea — user picks one, drops into question state. None:
    inline error auto-clears after 4s.
  - Disambiguation prompt: "Found N problems — which one would you like to
    solve?" with one button per problem. Cancel returns to normal composer.
  - Upload icon button wired to hidden file input (accept image/jpeg,png,gif,webp).
    imageExtracting drives spinner animation. extractedProblems drives
    disambiguation view. extractError drives inline error text below composer.
  - attachedFile state removed entirely — replaced by extraction flow.
  - Image never stored — memory only for duration of extraction call.
  - Solve flow, verification, and all existing logic unchanged.
  - BUILD_VERSION: "v3.9.2-image-upload"

✅ Polish Brief 08 — Frame, Ghost Fix, Image Drop/Paste ✅ COMPLETE
  - shouldGhost: wedgePhase === 'done' && splitKind !== null. Replaces all
    previous splitKind !== null ghost conditions. Correct semantic gate —
    framing and ghosting only active after full wedge sequence completes.
  - Split bottom frame: border-b border-white/[0.06] pb-3 on split columns
    container (gated on shouldGhost). border-t border-white/[0.06] pt-3 mt-0
    on action cluster (gated on shouldGhost). Split reads as framed unit.
  - Ghost fix: wedgePhase resets to 'idle' in doSolve. Subsequent solves
    never ghost until a new verification sequence runs to completion.
  - handleImageFile(file): extracted from handleImageUpload. Shared by file
    input onChange, onPaste, and onDrop handlers. Type validation added
    (unsupported type surfaces extractError). No logic duplication.
  - Paste: onPaste on textarea. Checks clipboardData.items for image/*.
    Calls handleImageFile on first match. Non-image paste passes through.
  - Drag-drop: onDragOver/onDragLeave/onDrop on composer container div.
    isDraggingOver state. onDragLeave uses relatedTarget containment check.
    border-white/[0.10] → border-white/[0.20] during drag (150ms transition).
  - Overlay: absolute inset-0 z-10 pointer-events-none, shown when
    isDraggingOver. Upload icon + "Drop image here" + extraction subtitle.
    bg-zinc-950/95 — textarea faintly visible underneath.
  - BUILD_VERSION: "v3.9.3-polish-08"

✅ Phase 4 — History + Library + Auth ✅ COMPLETE
  - Supabase Auth (magic link only) wired into frontend and backend.
    Redirect URL configured for localhost:3000 — production URL added
    during Phase 6 deployment.
  - solves table in Supabase Postgres logs every solve, anonymous or
    authenticated. Library asset accumulates passively. Internal use only.
  - Anonymous session ID via sessionStorage (NOT localStorage); rotates per
    tab session; 24-hour merge window on sign-in to prevent shared-device
    contamination.
  - /history/list and /history/get/:id endpoints. RLS enforces user-owned
    reads. Backend uses service_role for inserts.
  - Lazy revalidation on history load: stale solves re-run Tier 1 (math.js)
    only. Tier 3 never auto-runs. Badge changes surface as a zinc-500 line
    under the badge: "Re-verified [date] under engine [build_version]."
  - Sidebar Sessions list: signed-out / signed-in-empty / signed-in-populated
    states. Click-to-load hydrates artifact into main workspace.
  - Fire-and-forget DB writes — solve responses never blocked on logging.
  - /auth/merge-session: anonymous solves merged into user account on sign-in
    (24hr window cap). Session ID cleared from sessionStorage post-merge.
  - Sign-in modal: email input + magic link. Profile button shows email +
    sign out when authenticated.
  - BUILD_VERSION: "v4.0.0-history"

✅ Phase 5 — Batch Solve ✅ COMPLETE
  - "Batch solve" entry in main workspace, opens 3-stage modal:
    Input (paste or upload) → Review (editable extracted problems) → Processing.
  - /batch/extract: text or document (PDF/DOCX/image) → JSON array of problems.
    One Sonnet call regardless of input size. Cap 50 problems.
  - /batch/solve: SSE stream, 3-parallel processing chunks. Each problem
    goes through solveOne() (model + normalization + verification + DB log).
    Per-problem events streamed: started / completed / failed.
  - Server-authoritative caps: 15 problems/batch free, 50/batch Pro (Pro flag
    check is permissive in v1, real gate in Phase 7). Per-problem quota
    accounting against daily 15/day limit.
  - In-session async: tab close ends the job. beforeunload warning when
    batch is mid-flight.
  - Persistent sidebar progress indicator while batch runs.
  - Result view: summary opens with discrepant problem focused if any exist.
    Click-through-only-for-answers: final answers ONLY visible when a problem
    is individually expanded. No bulk export, copy, download, or share.
  - solveOne() extracted as standalone function — /batch/solve reuses exact
    same model call, verification, and artifact construction path as /solve.
  - cancel-on-disconnect: req.on('close') aborts remaining processing.
  - BUILD_VERSION: "v4.1.0-batch"

✅ Pre-5a — Event Log Infrastructure ✅ COMPLETE
  - Supabase migration: events table (id, created_at, kind, severity, correlation_id,
    user_id, session_id, build_version, payload jsonb, message) with indexes on
    (kind, created_at), (correlation_id), (user_id, created_at), (severity, created_at).
    RLS enabled, service_role only.
  - backend/eventKinds.js: locked vocabulary of 17 kinds (16 structured + debug.observation).
    Runtime-enforced via assertValidKind() — unknown kinds throw.
  - backend/eventLog.js: logEvent() fire-and-forget, newCorrelationId() utility.
    Failures fall back to backend/logs/events-fallback.jsonl (sync append).
  - backend/scripts/read-events.js: query utility with kind/severity/correlation_id/
    time-range filters and aggregations.
  - LOGGING_OBSERVATIONS.md created at repo root — tracks every debug.observation
    call site for pre-Phase-6 cleanup.
  - backend/.gitignore: logs/ and *.jsonl excluded.
  - Imports wired in backend/index.js but no instrumentation yet (deferred to Commit 2).
  - BUILD_VERSION: "v4.2.0-events"

✅ Pre-5a — Backend Instrumentation ✅ COMPLETE
  - logEvent wired into all known failure points across /solve, /verify, /extract-problem,
    /batch/solve, /batch/extract, /auth/merge-session, /history/get/:id revalidation.
  - 16 structured event kinds instrumented. debug.observation reserved for ad-hoc use.
  - newCorrelationId() generated at /solve entry. Threaded into /verify via request body.
    Frontend captures correlation_id from /solve response and passes back on /verify calls.
  - /solve response shape extended with { correlation_id, solve_id, session_id }.
    Foundation for Phase 5a optimistic insert (option C). Older clients ignore new fields.
  - insertSolve() now returns inserted row { id, session_id, user_id, created_at }.
    /solve awaits insertSolve before responding (~50–100ms added latency). Failure path
    logs solve.exception and degrades to null solve_id/session_id in response.
  - solveOne() (used by /batch/solve) deliberately NOT modified — batch events fire at
    batch handler layer via batch.problem_failed.
  - No solve correctness, prompt, verification, or UI behavior changed.
  - BUILD_VERSION: "v4.2.1-instrumented"

🔲 Phase 5a — Session Model + Sidebar Restructure + Quick Wins

  JPEG Extraction Bug — diagnose before any code change:
  - Pull actual error output from /extract-problem logs first.
  - Do not write a fix blind. Candidates: Anthropic vision API rejection
    of JPEG format, multer memory buffer issue losing file data, model
    returning mode: none for valid images, 10MB size limit hit.
  - Identify root cause from log evidence, then fix surgically.

  Quick Wins (independent, no dependencies):
  - Batch modal: center it and increase size. Pure CSS/layout tuning.
  - Shared handleImageFile: already extracted in Polish Brief 08 for
    main composer. Extend to wire into: batch modal file input,
    batch modal drop zone, batch modal paste handler. Single source
    of truth. No logic duplication.
  - "Batch solve" entry: remove from input bar area. Add to sidebar
    at same level as Sessions / Profile / Settings. Click opens the
    3-stage batch modal. No other behavior change.

  Session Data Model:
  - Add session_id column to existing solves table. Do not create a
    separate sessions table in v1 — derive all session metadata from
    queries on this column.
  - Session ID derivation: 4-hour clustering rule. A new solve gets
    the session_id of the most recent solve by the same user within
    the last 4 hours. If none exists, a new session_id is generated.
    Threshold value must be defined as a named constant in code
    (SESSION_CLUSTER_HOURS = 4) — configurable without a search/replace.
  - Auto-naming: session name = first problem's kind + date.
    Example: "Calculus, Nov 7". Stored as a derivable label, not a
    separate DB column in v1 (compute from first solve in session).
  - PATCH /sessions/:id/rename endpoint: updates the session name for
    all solves sharing that session_id. Requires auth JWT.
  - /history/list updated: returns solves grouped by session_id with
    session metadata (name, solve count, last_updated).

  Sidebar Restructure + Optimistic Insert (ship as one unit — coupled):
  - Three-level hierarchy: time bucket > session > problem.
  - Time buckets: Today / Yesterday / This week / Older.
    Today bucket: auto-expanded on load.
    Sessions within Today: auto-expanded.
    All other buckets and their sessions: collapsed by default.
  - Sessions within each bucket auto-grouped by session_id.
    Displayed with auto-generated name and solve count.
  - Problems within each session listed as clickable rows showing
    truncated question text and verification badge.
  - Session header click: expand/collapse that session. No solve load.
    Loading is always at problem level — never triggered by session click.
  - Problem click: load that solve artifact into main workspace.
    Top-center session tab updates to reflect that session name.
  - Optimistic insert: on solve fire (/solve called), a new problem row
    appears immediately under the current session in the sidebar with
    a subtle "solving..." state. Reconcile (update badge, question text)
    when /solve returns. If solve fails, remove the optimistic row.
  - New solves always go to the current time-cluster session.
    Loading an old solve is a view-only action. Firing a new solve
    always creates or extends the current 4-hour-window session,
    regardless of what old solve is currently displayed in the workspace.
    Top-center tab updates to current session on solve fire.

  Top-Center Session Tab:
  - See Section 5 (Layout Blueprint) for full visual spec.
  - State management: one source of truth shared between the session tab
    and the sidebar. Same state object drives both surfaces.
  - Session tab reflects the active session (current 4-hour window).
    When user loads an old solve, tab shows that solve's session name
    but new solves still fire into the current session.

  Batch Entry + Result Panel Refactor (replaces Phase 5 full-screen overlay):
  - "Batch solve" entry: now in sidebar as noted in Quick Wins above.
  - Batch result view: full-screen overlay (Phase 5) is deleted entirely.
    Replaced by a secondary expanding panel.
  - Secondary panel: slides out to the right of the main sidebar when
    a batch job is active, pushing the main content area right.
    Panel is contextual — absent when no batch is active.
    Honors the no-permanent-rail principle.
  - Trigger: click the batch progress indicator in the main sidebar
    (pulsing amber dot while processing, colored dot when complete).
    Panel expands. Click again or click outside to collapse.
  - Panel contents: queue list. Each item shows question (truncated),
    position in queue, and badge (or "solving..." state while pending).
    Click any queue item → loads that solve artifact into the main
    single-solve renderer in the workspace. Full solve view, not a
    summary. Discrepancy-first: auto-expand first discrepant item on
    batch complete.
  - Panel width: fixed, not resizable in v1. Reasonable minimum to
    show truncated question + badge without wrapping.
  - Batch session: each batch job is its own session. Auto-named from
    extraction source — filename if input was a document
    ("Problems from notes.pdf"), first problem text if raw input.
    Does not merge into the surrounding time-cluster session.
    Appears in sidebar hierarchy under its time bucket as a named
    session like any other.

  Do Not Build in Phase 5a (log in STRATEGIC_DECISIONS.md):
  - Manual session creation
  - Manual session switching of new solves into old sessions
  - "Continue this session" feature
  Rationale: auto-grouping + view-only old sessions is the correct v1
  model. Post-launch candidates — revisit when user behavior data shows
  meaningful demand for manual control.

🔲 Phase 5b — Pre-Deployment Features

  Step-Level Verification:
  - Add `step_kind` enum to solution JSON schema in math and physics
    system prompts. Values: transformation | derivation | application |
    evaluation | conceptual. No other schema changes.
  - Server logic in artifact.js or index.js:
    transformation → numeric equivalence check on consecutive
    summary_latex values via existing math.js sampling.
    evaluation → numeric equality check.
    All other kinds → not checked, no badge.
  - step_verification array added to artifact output:
    [{ section_index, step_kind, status: 'verified' | 'mismatch' |
    'unverifiable' | 'not_checked', evaluated_a, evaluated_b }]
    evaluated_a/b populated only on mismatch (Pro diagnostic data).
  - Frontend: per-section step badge renders beneath section title.
    Free: badge label only. Pro: mismatch expands inline diagnostic
    showing evaluated forms. Badge colors: emerald verified,
    amber mismatch, zinc unverifiable/not_checked.

  Collections (Pro-only):
  - Schema: `collections` table (id, user_id, name, created_at) +
    `collection_solves` join table (collection_id, solve_id).
    Many-to-many. No default collection.
  - Auto-organize: POST /collections/auto-organize clusters user's
    existing solves by problem_kind and question text server-side.
    No AI call. Returns suggested collection names + solve lists.
    User accepts, renames, or dismisses. Partial acceptance allowed.
    Never overwrites existing collections.
  - Manual multi-select: checkbox on hover over history items.
    Bulk action bar on selection. Assign to existing or new collection.
  - Endpoints: POST /collections, DELETE /collections/:id,
    POST /collections/:id/solves (single or array),
    DELETE /collections/:id/solves/:solve_id,
    GET /collections (list with solve counts),
    POST /collections/auto-organize.
  - UI: Collections opens as a tab in the solve area.
    Default: grid of collection cards (name, solve count, top 3
    problem_kind badges, last updated). Toggle to list view.
    View preference persists in localStorage.
    Click collection → solve list inside (same toggle).
    Click solve → loads artifact into workspace.
  - Free tier: Collections tab shows Pro upsell. No CRUD.
  - No collection sharing. Export covers that use case.
  - Collection delete does not delete constituent solves.

  Share Permalinks + Public Solve Pages (same system):
  - See Section 14 for full spec.
  - Schema additions to solves table: share_hash varchar(8) unique,
    is_public boolean default false, canonical_slug text nullable.
  - POST /share: generates share_hash, sets is_public if quality gate
    passes, claims canonical_slug if available for that problem.
  - DELETE /share/:hash: sets is_public false. Hash returns 410 Gone.
    canonical_slug and SEO page unaffected if already promoted.

  Export (Pro-only):
  - See Section 16 for full spec.
  - Formats: PDF, LaTeX, Anki — all three for single solve and collection.
  - POST /export/solve/:id and POST /export/collection/:id.
    Body: { format: 'pdf' | 'latex' | 'anki' }. Pro JWT required.
  - Free tier: Export entry point absent from UI entirely. Not hidden,
    not disabled — not rendered for free users.

🔲 Phase 6 — Deployment + Monetization (combined)
  - Vercel (frontend) + Railway/Render (backend), custom domain.
  - NEXT_PUBLIC_API_URL env var wired for production.
  - Production Supabase Auth redirect URL configured.
  - Meta/OG tags. Schema.org structured data on public solve pages.
  - Sitemap generation for canonical /solve/[type]/[slug] pages.
  - Stripe: subscription checkout, webhook handler
    (customer.subscription.created / updated / deleted),
    subscription status stored on Supabase user record.
    Pro flag read server-side on every gated request.
    Never trust client-side Pro claim.
  - Price: $12/month at launch. Test $15 after 30 days conversion data.
  - ToS at deployment: solving on Ergo. grants Ergo. perpetual right
    to use verified problem statements and solutions as canonical
    reference content without user attribution.

🔲 Phase 7 — Interactive Mode (Full)
  Conversational follow-up on solved problems. UI already scaffolded
  (interactive bookmark tab, interactiveMode state). Full behavior
  post-deployment only. interactiveMode never resets between solves.

🔲 Phase 8 — Analytics
  Verification tier hit rates by problem_kind, step verification
  mismatch rate by step_kind, failure reasons, suggestion usage,
  conversion funnel, cost-per-solve, share/SEO page click-through.
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
  - casLogger.js: logCasEvent() appends JSONL to backend/logs/cas-events.jsonl.
    Directory created on load. Sync write, failures swallowed. Phase 2 fields
    (numeric_attempts, numeric_matches) present as null placeholders.
  - scripts/read-cas-log.js: reads cas-events.jsonl, prints verdict/kind
    breakdowns + last N events. Node stdlib only.
  - BUILD_VERSION: "v3.6.0-cas-compare-rebuild"
  - eventLog.js: logEvent() fire-and-forget event writer; newCorrelationId() generator.
  - eventKinds.js: locked vocabulary (17 kinds), runtime-enforced.
  - scripts/read-events.js: query utility for events table.
  - logEvent + newCorrelationId imported in index.js — no call sites yet (Commit 2).
  - BUILD_VERSION: "v4.2.0-events"
  - All /solve failure points (model parse, verify throw, top-level catch) call logEvent
    with correlation_id from newCorrelationId(). insertSolve is awaited before res.json.
    Response now includes correlation_id, solve_id, session_id.
  - /verify reads correlation_id from request body. Instruments verify.cas_timeout,
    verify.cas_skipped, verify.compare_unavailable, audit.parse_fail.
  - /extract-problem, /batch/solve, /batch/extract, /auth/merge-session,
    /history/get/:id revalidation all instrumented with their respective event kinds.
  - solveOne unchanged. Batch instrumentation lives at handler layer.
  - BUILD_VERSION: "v4.2.1-instrumented"

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
  - Grain texture: fixed inset-0 z-0 SVG feTurbulence overlay at opacity 0.028.
    Always present under all content. fractalNoise 0.65 baseFrequency, 3 octaves.
  - Grain texture: fixed inset-0 z-0 SVG feTurbulence overlay at opacity 0.028.
  - Logo: pl-3 on wordmark button aligns left edge with Home/nav items.
  - inputFocused state: boolean, wired to textarea onFocus/onBlur. Drives
    absolute amber 1px focus line on left edge of composer container.
  - Slogan underline: h-px w-8 mx-auto mt-3 bg-white/20 below slogan text.
  - Sidebar bottom section: border-t border-white/[0.06] pt-3 on mt-auto
    container. Separate border div removed.
  - Section layout: reordered to title → explanation → equation. Equation
    container: py-2 pl-4 border-l border-white/[0.06].
  - Overview: text-[14px] leading-6 font-medium text-zinc-200.
  - wolframDisplay: computed from advancedVerifResult.cas.wolfram_result;
    strips prefix up to and including last '=' for clean RHS display.
    Applied to both static split and wedge paths via KaTeXBoundary.
  - Wedge two-column body: items-center (was items-start).
  - Sidebar: vertical stripe SVG data URI, 1px/12px, rgba(255,255,255,0.03).
    Grain opacity raised to 0.055. Amber focus accent removed entirely.
  - max_tokens: 1200 (both model calls). /solve no longer runs CAS/audit.
  - New POST /verify endpoint: CAS (math) or physics audit independently.
    casLogger moved to /verify. logCasEvent called on every /verify math call.
  - artifact.js: wolfram_query in solution output. Frontend Artifact type updated.
  - doSolve: /solve called without advanced flag. shouldAutoFire fires background
    /verify, merges result into pendingAdvancedResult. runAdvancedVerification
    calls /verify. Both use NEXT_PUBLIC_API_URL env var.
  - wolfram.js: limit kind (podTargets + inferKindFromQuery), implicit diff →
    differentiation kind. toMathjs: infinity normalization (∞ → Infinity).
  - BUILD_VERSION: "v4.1.0-batch"
  - currentCorrelationId state captures correlation_id returned by /solve.
    Threaded into auto-fire /verify call and manual runAdvancedVerification call.
    Cleared by handleReset. Future-use for frontend event logging.
  - PENDING Phase 5a change: sticky answer bar currently fixed at top-0
    (Polish Brief 03b). Must shift to top-9 when session tab is implemented
    to sit below the session tab strip. Solution view pt-20 required.
    Do not implement this sticky bar shift in isolation — it ships as part
    of Phase 5a alongside the session tab.

Phase 5 — Batch Solve (new)
  - backend: solveOne(rawInput, mode) standalone async function — full solve
    path (prompts, model call, JSON parse, verification, artifact build).
    Shared by /solve (which keeps its own inline copy) and /batch/solve.
  - pdf-parse + mammoth installed for PDF/DOCX text extraction.
  - /batch/extract: accepts text or document (PDF/DOCX/image), returns
    { problems: string[], truncated: boolean }. Claude splits text into
    individual problem strings. Image path reuses vision model.
  - /batch/solve: SSE endpoint. Auth+quota validated at entry. Processes in
    chunks of 3. Streams problem_started / problem_completed / problem_failed /
    batch_completed events. Each problem logged individually to solves table.
    req.on('close') cancels remaining work on disconnect.
  - Quota: getDailyUsage() counts solves rows in last 24h. Rejects batch if
    remaining < problems.length. FREE_BATCH_CAP=15, PRO_BATCH_CAP=50.
  - frontend: BatchProblem, BatchSummary, BatchModalStage types; FREE_BATCH_CAP
    constant; batchStage, batchProblems, batchSummary and related state.
  - 3-stage batch modal (input → review → triggers processing + closes).
  - Sidebar batch indicator: processing (pulsing amber dot + "N/M done") or
    complete (colored dot + summary counts). Click opens result view.
  - Batch result view: full-screen overlay left of sidebar. Summary header
    with color-coded counts. Per-problem cards (badge + user_reason visible;
    final answer hidden). Click card to expand inline (full artifact rendered
    including BlockMath). Discrepancy-first: auto-expand first discrepant problem.
    NOTE: This result view is superseded by Phase 5a — see Phase 5a
    batch result panel spec. Full-screen overlay is deleted in Phase 5a.
  - beforeunload warning while batchStage === 'processing'.
  - "Batch solve" text link between Physics tab and mode tabs row.

Phase 4 — History + Library + Auth (new)
  - backend/supabase.js: Supabase service_role client. insertSolve(),
    updateSolveVerification(), getUserFromToken() exported. Fire-and-forget
    pattern used everywhere.
  - /solve: fire-and-forget insertSolve() after res.json. Reads
    Authorization header (user_id) and X-Session-Id (anonymous) from
    request. DB failure never blocks user response.
  - /history/list (GET): requires auth JWT. Returns last 100 solves for
    user: id, created_at, raw_input (80-char truncated), mode, badge,
    problem_kind. Full artifact not returned here.
  - /history/get/:id (GET): requires auth JWT. 404 if not user-owned. Runs
    lazy Tier 1 revalidation if build_version is stale and mode=math and
    normalized_payload.type is not null/unknown. Maps new verification
    status → badge. Updates row async (fire-and-forget). Returns artifact +
    revalidation metadata (badge_changed, last_revalidated_at, version).
    Tier 3 (Wolfram) never runs here.
  - /auth/merge-session (POST): requires auth JWT. Updates solves rows where
    session_id=X and user_id IS NULL and created_at > now()-24h. Sets
    user_id, nulls session_id. Returns { merged: N }.
  - frontend/src/lib/supabase.ts: singleton Supabase anon client.
  - frontend/src/lib/session.ts: getSessionId() / clearSessionId() using
    sessionStorage (never localStorage). Format: anon_${uuid}.
  - page.tsx: supabase + session imported. HistorySolve type, relativeTime()
    utility, API_URL constant added. New state: user, historyList,
    historyLoading, showAuthModal, authEmail, authSent, authLoading,
    revalidationNote. useEffect subscribes to onAuthStateChange: SIGNED_IN
    triggers merge-session + fetchHistory + modal close; SIGNED_OUT clears
    list. loadHistoricalSolve() calls /history/get/:id, hydrates artifact +
    ghostQuestion + mode, sets revalidationNote if badge changed.
    handleSignIn() uses signInWithOtp. handleSignOut() calls signOut.
    doSolve adds X-Session-Id + Authorization headers. Sessions sidebar:
    3-state (signed out / empty / populated with click-to-load list).
    Profile bottom: shows email + sign-out when authed; sign-in modal opener
    when not. Sign-in modal with AnimatePresence. Re-verification note
    renders below user_reason (zinc-500, date + version).
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
- Expose the solves library as a public route, list, or browseable index
- Serve cached solutions from the solves table to users who didn't create them
- Auto-run Wolfram (or any Tier 3 CAS) during history load
- Use localStorage for anonymous session IDs (use sessionStorage only)
- Block /solve responses on database write success
- Add password-based auth, OAuth, or social sign-in providers in Phase 4
- Build a history page route, search, or filter UI in Phase 4
- Silently change a verification badge during revalidation without surfacing the change
- Show final answers in the batch summary view (only badges + user_reason)
- Add bulk export, copy-all, download-all, print-all, or share-all on batch results
- Persist batch job state to survive tab close (v1)
- Group batch solves under a separate batch entity (each problem is its own solves row)
- Allow keyboard shortcuts to advance through answers without per-problem expansion
- Skip the editable review step in the batch modal
- Allow batches to exceed server-side caps (15 free / 50 Pro)
- Process batch problems via a different code path than /solve
- Add step verification badges to derivation, application, or
  conceptual steps — these are not equivalence-checkable
- Use AI to assess, confirm, or check whether any solution step
  is correct (model classifies step_kind only — labeling, not judging)
- Surface user identity, email, or session data on public solve pages
- Serve another user's raw session artifact directly as a public page
  (always re-render from artifact record, anonymized)
- Overwrite or revoke a canonical_slug after it has been claimed
- Make Collections available on the free tier
- Make Export available on the free tier — absent from UI, not hidden
- Build a browse index or paginated list of public solve pages
- Gate the share link (/v/hash) behind Pro or authentication
- Run auto-organize using an AI call — algorithmic only
- Allow collection delete to cascade-delete constituent solves
- Strip verification badge or step status from exported files
- Defer Stripe to a post-deployment phase — ships with Phase 6
- Load a solve when a user clicks a session header — loading is always
  at problem level, never triggered by session click
- Fix the JPEG extraction bug without first pulling and reading actual
  logs from /extract-problem — diagnose before writing any code
- Merge a batch job's solves into the surrounding time-cluster session —
  batch is always its own named session
- Implement manual session creation in v1
- Implement manual session switching of new solves into old sessions in v1
- Implement a "continue this session" feature in v1
- Remove the optimistic sidebar row on solve fire before the /solve
  response returns — show "solving..." state, reconcile on return
- Create a separate sessions table — derive all session metadata from
  queries on the session_id column of the solves table in v1
- Hard-code the 4-hour session cluster threshold — it must be a named
  constant (SESSION_CLUSTER_HOURS) configurable in code
- Remove correlation_id, solve_id, or session_id from /solve response shape — they are
  load-bearing for Phase 5a optimistic insert (option C) and frontend event correlation
- Revert insertSolve to fire-and-forget — it is awaited before /solve response by design;
  the latency cost is paid to enable optimistic insert reconciliation
- Modify solveOne() to add correlation_id without explicit founder approval — batch
  instrumentation is intentionally handler-layer in this phase
- Add debug.observation call sites without a corresponding LOGGING_OBSERVATIONS.md entry
  in the same commit
- Log raw user questions in the events table payload field — payload carries derived
  structured data only; raw input lives in solves table only, joinable via correlation_id
- Add new event kinds without registering them in backend/eventKinds.js
- Soften the eventKinds.js runtime throw to a console.warn
- Ship debug.observation call sites to Phase 6 launch — every call site must be
  resolved (promoted/deleted/kept-with-justification) and tracked in LOGGING_OBSERVATIONS.md
- Create a separate Supabase project for events — same project as solves
- Make events table user-readable via RLS — service_role only, internal observability

---
## 11b. What Claude Code Must Always Do

- After completing any phase or named task, update CLAUDE.md immediately:
  mark the phase ✅ complete, add a brief bullet list of what was actually
  implemented, and update Section 10 (Current Code State) to reflect the
  new state. Do this before closing the session.
- When adding a debug.observation call site, also add a corresponding entry to
  LOGGING_OBSERVATIONS.md in the same commit. No exceptions.
- When adding a new structured event kind, register it in backend/eventKinds.js
  AND document it in CLAUDE.md Section 17 in the same commit.
---
## 12. Library & History (Locked)

### The library
Every solve is logged to the solves table in Supabase. This includes
anonymous solves. The library is an internal asset — never exposed as a
public route, never used to cache-serve answers to new users.

The library's value is to Ergo, not to users:
- Validation coverage decisions (which problem types appear most)
- Marketing surface (verified solve counts)
- SEO surface in future phases (canonical problems indexed individually)
- Analytics signal for product direction

### History
Per-user surface in the sidebar. Lists solves, click to load. Lazy
revalidation runs Tier 1 on view if build_version is stale. Badge changes
are surfaced visibly with a small zinc-500 line under the badge.

### Anonymous session handling
sessionStorage-based ID, rotates per tab. 24-hour merge window on sign-in.
Never localStorage. Never persists across tab close.

### Hard rules
- No public library route, ever
- No cache-serve of previously verified solutions to new users
- No Tier 3 (Wolfram) auto-revalidation — manual only
- No silent badge changes — re-verification is always visibly noted
- No localStorage for anonymous session IDs
- The artifact JSON is the source of truth in the solves table

### Batch
Batch solves are individually-logged solves. There is no separate batch
entity. The result view is rendered from the constituent solves at view time.

Hard rules for batch UX:
- Final answers NEVER appear in the summary view
- Discrepancies are surfaced with focused navigation (open the result view
  on the discrepant problem)
- No bulk export, copy, download, share, or print
- Per-problem engagement is required — no shortcuts to "see all answers"
- Server-authoritative quota: each problem in a batch counts as 1 solve
- Batch jobs do NOT survive tab close (in v1)

---
## 13. One-Paragraph Product Summary

Ergo. is a trust-first math and physics solver whose differentiator
is visible correctness at every level — final answer, individual
solution steps, and cross-method audit. It serves engineers,
researchers, and advanced students who need a correct, verifiable
answer. The solve experience is a single vertical flow: input →
answer → visible verification state → proof → optional depth on
demand. Radically minimal: no rail, no duplicated controls, no chat
feel. Deterministic validation (math.js) is the backbone. Step-level
verification classifies each solution step and runs equivalence checks
where deterministic methods apply — honest labeling everywhere else,
with a clear upgrade path to proprietary CAS coverage. CAS,
Collections, Export, and step diagnostics are gated behind Pro
($12/month). Verified solves become public canonical pages at
/solve/[type]/[slug], discoverable by search and sharable by any
user via /v/[hash] — share permalinks and SEO pages are the same
system. Collections let Pro users organize and auto-group their
library. Export produces PDF, LaTeX, and Anki decks for single
solves and collections. The product ships with Stripe on day one.
The business target is 250–300 Pro users for $2,000+/month net,
driven by SEO on the canonical solve pages and a free-to-paid
funnel gated on CAS, Collections, and Export.

---
## 14. Share Permalinks & Public Solve Pages

Share permalinks and public SEO solve pages are the same system.
One underlying solves record, two URL access paths.

### URL forms
- `/v/[8-char-base62-hash]` — share access. Works for any solve
  the user has shared, regardless of verification status.
- `/solve/[problem-type]/[slug]` — canonical SEO path. Exists only
  when quality gate passes AND no prior canonical version for this
  normalized problem has been claimed.

### Quality gate (locked)
Promotes to canonical indexable page only when:
  badge === 'verified' || cas.verdict === 'confirmed'
Below gate: noindex, hash access only. Share link always works.

### Slug generation
Derived from question text: lowercase, hyphens, LaTeX stripped to
readable form, problem-type prefix.
Example: /solve/integration/integrate-x-squared-sin-x
Deduplication: if canonical_slug already exists for a normalized
problem, the new solve does not claim a second slot. Existing page
is authoritative.

### Schema additions to solves table
- share_hash varchar(8) — generated on share, unique index
- is_public boolean default false
- canonical_slug text nullable — set once, never overwritten

### What renders on public pages (locked)
- Problem statement
- Final answer with verification badge
- Full solution sections with step badges
- One-line verification summary (user_reason)
- "Verified by Ergo." stamp
- CTA: "Solve your own problem →"
- Schema.org structured data (MathSolver or FAQPage type)

### What NEVER renders on public pages (locked)
- User identity, email, or any personal attribution
- Session or timestamp data tied to a user
- Raw session artifact served directly — always re-rendered from
  the artifact record, anonymized at generation time

### Crawl rules
- Canonical pages: indexable, in sitemap, schema.org markup
- Hash-only pages: noindex, nofollow
- Discrepancy or unverified solves: never promoted, never indexed

### Deletion and canonical ownership
- User can delete share access (DELETE /share/:hash → 410 Gone).
  is_public set to false. Canonical slug unaffected.
- Canonical slug is never revocable. Once claimed and indexed, it
  belongs to Ergo. regardless of original user account state.
  SEO surface cannot be fragile to user churn.

### Anonymous sharing
Anonymous users can share. Anonymous shares are quality-gated and
promoted to canonical if verified. Viral loop is never gated
behind authentication.

### Relationship to private library (Section 12)
Public pages and the private library are different surfaces of the
same data. No browse index, no paginated list, no "all public solves"
route. Public pages are individually reachable only. Ever.

---
## 15. Collections

Pro-exclusive. Not available on free tier.

### Purpose
Let Pro users organize their solve library into named collections
for exam prep, coursework, or topic grouping.

### Data model
- collections table: id, user_id, name, created_at
- collection_solves join table: collection_id, solve_id
- Many-to-many: one solve can belong to multiple collections
- No default collection
- No hierarchy — flat collections only in v1
- Collection delete does not delete constituent solves

### Adding solves
Manual multi-select: checkbox appears on hover over history/sessions
items. Bulk action bar appears on any selection. User assigns to
existing collection or creates new one from selection.

Auto-organize: POST /collections/auto-organize. Algorithmic clustering
using existing problem_kind and question fields — no AI call. Returns
suggested collection names with solve lists. User accepts, renames,
or dismisses each suggestion. Partial acceptance allowed. Never
overwrites existing collections.

### UI
Collections opens as a tab in the solve area. Not a sidebar panel,
not a modal.
- Default: grid of collection cards showing name, solve count, top 3
  problem_kind badges, last updated timestamp
- Toggle to list view — preference persists in localStorage
- Click collection → solve list (same grid/list toggle)
- Click solve → loads artifact into workspace
- Free tier: Collections tab visible, Pro upsell shown, no CRUD

### Hard rules
- Pro-only — free tier sees upsell only
- No collection sharing as a direct feature (Export covers this)
- No hierarchy in v1
- Auto-organize is always algorithmic, never an AI call
- Auto-organize never overwrites existing collections

---
## 16. Export

Pro-exclusive. No export access on free tier.

### Formats (all three for single solve and collection)
- PDF — formatted document: problem, answer, verification badge,
  solution sections with step badges, Ergo. attribution.
  Generated server-side.
- LaTeX — .tex file with document wrapper, math environments,
  sections as proof steps. Ready for Overleaf or pdflatex.
- Anki — .apkg flashcard deck (SQLite format via anki-apkg-export
  or equivalent). Front: problem statement. Back: final answer +
  key solution steps + verification badge status.
  Single solve: one card. Collection: one deck, one card per solve.

### Endpoints
- POST /export/solve/:id — body: { format: 'pdf' | 'latex' | 'anki' }
- POST /export/collection/:id — body: { format: 'pdf' | 'latex' | 'anki' }
Both require valid Pro JWT. Return file download with correct
Content-Disposition and MIME type.

### UI entry points
- Single solve: Export option in the action cluster. Click → format
  picker (PDF / LaTeX / Anki). Download triggers immediately.
- Collection: Export button in collection header. Same format picker.
  Collection PDF is paginated (one solve per section).
  Collection Anki creates one deck with one card per solve.

### Hard rules
- Pro-only — enforced server-side, not just UI-gated
- Free tier: Export entry point not rendered (absent, not hidden)
- No bulk export from flat history view — scoped to single solve
  or named collection only
- Exported files always include verification state — never strip
  badge or step status from any export format
- Anki cards: front/back only, no step diagnostics in card content

---
## 17. Event Logging

Structured event log for failure modes and observability. Backbone for Phase 8 analytics.

### Storage
Single `events` table in the same Supabase project as `solves`. Schema:
id, created_at, kind, severity, correlation_id, user_id, session_id, build_version, payload (jsonb), message.
RLS enabled, service_role only — no user-facing access to events.

### Module
`backend/eventLog.js` exports `logEvent()` and `newCorrelationId()`.
Fire-and-forget pattern. Failures fall back to `backend/logs/events-fallback.jsonl` (sync append).
Never blocks the caller. Throws only on vocabulary violation.

### Vocabulary (locked)
Defined in `backend/eventKinds.js`. Runtime-enforced — unknown kinds throw.
Current kinds:
- Solve: solve.success, solve.model_parse_fail, solve.verify_fail, solve.exception
- Verify: verify.cas_timeout, verify.cas_skipped, verify.compare_unavailable, audit.parse_fail
- Extract: extract.no_problems_found, extract.unsupported_mimetype, extract.exception
- Batch: batch.problem_failed, batch.extract_failed
- Auth/history: auth.merge_failed, history.revalidation_failed
- Frontend: frontend.katex_render_fail, frontend.desmos_init_fail, frontend.sse_stream_break
- Debug: debug.observation (testing-phase only, must be removed before Phase 6)

### Adding or removing kinds
- Add: register in `eventKinds.js`, document here, then instrument call sites.
- Remove: confirm zero call sites remain, then unregister.

### Correlation IDs
Generated at the start of every `/solve` with `newCorrelationId()`.
Returned in `/solve` response as `correlation_id`. Frontend passes back to `/verify`
and includes in frontend-originated events (when frontend logging ships).
One correlation_id = one user action traced end to end.

### debug.observation lifecycle
Intentionally outside the structured vocabulary. Every call site must be tracked in
`LOGGING_OBSERVATIONS.md` at repo root. Every observation must be resolved before
Phase 6 launch — promoted to a structured kind, kept as debug with justification,
or deleted. Shipping debug.observation to production is a hard rule violation.

### Payload discipline
The `payload` field carries derived structured data only:
problem_kind, mode, badge, latency_ms, model_used, error_message_summary, etc.
Raw user questions NEVER go in payload — they live in the `solves` table only,
joinable via correlation_id → solve_id.

### Sampling (deferred to post-Phase-6)
All events log at 100% during testing and early launch. Sampling thresholds for
high-volume events (verify.cas_skipped, solve.success) tuned post-launch with
real volume data. Errors never sampled.

### Query
`node backend/scripts/read-events.js [--kind=X] [--severity=Y] [--correlation=Z] [--since=ISO] [--limit=N]`
Prints recent events with aggregations by kind and severity.
