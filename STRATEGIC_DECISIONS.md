# STRATEGIC_DECISIONS.md — Ergo.

**Purpose:** Log of open strategic questions that should not drive current implementation but need to be revisited at specific future trigger points. Do not act on these. Reference only when explicitly asked or when a trigger condition is met.

**How to use this file:** When a trigger below is hit, re-read the full entry before making direction decisions. The reasoning matters more than the conclusion.

---

## OPEN QUESTION 1 — What actually makes Ergo. subscribable?

**Status:** Unresolved. Deferred until post-Phase 5 with real conversion data.

### The concern

The current planned Pro tier (CAS verification, advanced verification, history, unlimited queries) is functionally solid but may not be differentiated enough to justify switching from existing tools (Wolfram Alpha, ChatGPT, Thetawise, etc.) or paying $12/month.

Correctness is invisible until it fails. Most users don't remember the failures clearly enough to change tools. "Better answers" is a weak standalone wedge in a market where perceived accuracy across AI solvers is already high.

Validation remains essential as a **trust layer and credibility engine** — but may not be sufficient as the **primary monetization driver**.

### What this does NOT mean

- Do not rip out validation architecture
- Do not pivot away from the trust-first identity
- Do not dilute current product scope chasing a new monetization story
- Do not let this question delay Phases 2b through 5

### Trigger to revisit

After Phase 5 has shipped and collected **30 days of real conversion data** from a live free tier. Specifically:
- Free-to-Pro conversion rate
- Which features Pro users actually use
- Cancellation reasons
- Whether users hit the free tier ceiling and churn vs. convert

If conversion is below ~2%, this question becomes urgent and this doc should be re-read before deciding next direction.

---

## OPEN QUESTION 2 — Project-context solver vs. report generator vs. neither

**Status:** Unresolved. Exploratory only. Not on the roadmap.

### The two directions considered

**Direction A: Report generator / academic output system**
Generate structured lab reports, academic writeups, submission-ready documents from solver outputs. Includes conversational report builder, live structure management, citations, exports.

**Verdict:** Rejected as primary expansion path for three reasons:
1. Crowded market — every LLM can produce a lab report
2. Violates the "not a chat UI, not an environment webpage" identity constraints in CLAUDE.md
3. Audience drift toward students, re-entering the positioning we pivoted away from
4. 6–9 month build that dilutes trust brand before monetization is proven

**Direction B: Workspace-aware / project-context solver**
Solver maintains context across a user's ongoing project: unit consistency across solves, symbol and variable conventions, format awareness, workflow memory. Does not generate documents. Stays aligned with the trust-first solver identity.

**Verdict:** Strong candidate. Preserves core identity. Genuinely differentiated. Useful to engineers, researchers, students — the full audience, not a subset. Report generation, if ever built, is downstream of this.

**Direction C: Neither, yet**
Ship the current plan, measure real usage, let the next expansion be data-driven rather than reasoned-from-first-principles.

**Verdict:** Default. This is what the current roadmap does.

### The deeper realization

"Project context" as a feature only matters if users have *projects* — i.e. repeated related solves over time. This is an empirical question about usage patterns. Cannot be answered by reasoning. Must be observed.

### Trigger to revisit

Two possible triggers:
1. **After 30 days of Phase 5 usage data**, check whether users return multiple times and work on related problems across sessions. If yes, project context is a real need. If no, it's a solution to a problem nobody has.
2. **If a user explicitly requests** workspace/project features more than twice, re-read this doc before dismissing it.

---
## RESOLVED — Audience

**Status:** Decided. Not up for revisitation unless Phase 5 conversion data strongly contradicts it.

### Decision

Primary audience: **students in technical programs** — advanced undergrad, grad students, anyone working through math-heavy coursework who needs a correct verifiable answer, not hints or guidance.

This is NOT:
- The homework-helper / study-app market (Thetawise, Chegg, Photomath)
- Engineers in industry (smaller audience, slower adoption, product builder has no first-hand knowledge of this user)
- A general AI wrapper for anyone

The quality bar is Ergo. standards applied to a student audience. The product feels like a precision instrument, not a friendly tutor.

### Why this was decided

The product has been implicitly designed for students from the start — the verification trust layer, the clean solve flow, the concern about lab reports, the slogan. Making it explicit removes ambiguity from every future design decision.

Engineers were considered but rejected as primary audience because: smaller addressable market, longer adoption cycle, product builder has no direct experience with engineering workflows, and the validation architecture needed would be similar anyway.

### What this means for future decisions

- SEO targets student problem types and course-level keywords, not industry use cases
- Pricing must be student-sensitive ($12/month is at the ceiling, not a floor)
- Validation coverage roadmap prioritizes calculus, linear algebra, ODEs — the student curriculum path
- Tone and empty state copy should resonate with someone doing a problem set, not filing an engineering report
- "Lab report generation" and similar academic writing features remain out of scope — see Open Question 2

---

## RESOLVED — Validation Architecture Map

**Status:** Architecture decided. Implementation deferred by tier.

### Current state (honest)

Tier 1 deterministic (math.js) covers roughly 40% of student submissions: linear equations, quadratics, simple systems, basic inequalities, numeric expressions. For everything else, badge shows "unavailable" — which is honest and correct behavior.

### Future expansion path (in order)

**Near-term (post-Phase 5, if validation gaps are hurting conversion):**
Tier 3 CAS via SymPy (self-hosted Python sidecar) or Wolfram Alpha API. Covers ~70-75% of symbolic math through second-year calculus and linear algebra. Invoked only on explicit user request. Gated behind Pro tier. Never runs automatically. Never used as "AI checks AI."

**Medium-term:**
Constraint verification for word problems. Extract numeric facts from problem statement, verify answer satisfies stated constraints. Deterministic, no CAS needed, extends coverage to a wide range of applied problems without re-solving.

**Longer-term:**
Step-level verification. Verify each solution section against the previous one rather than just final answer against original input. Requires schema extension (more granular structured output) and matching verification logic. Most useful to students — tells them which step is wrong, not just that the answer is wrong.

### What never gets built

- "AI checks AI" correctness architecture — AI reruns with corrected answer, AI validates AI output. Prohibited permanently.
- CAS as default for all unverified problems — cost scales with usage, defeats the cheap-defaults cost strategy
- Silent auto-correction when CAS and AI disagree — disagreement surfaces as a discrepancy the user can see, not a hidden rerun

### Word problems

CAS does not solve the word problem verification challenge. CAS operates on expressions, not natural language. Word problems require constraint extraction first, which is a parsing problem upstream of CAS. Honest "unavailable" is the correct badge for word problems until constraint verification is built. Do not attempt to force CAS onto word problems.

### Trigger to act on this

If post-Phase 5 data shows users hitting "unavailable" on problem types that CAS would cover, and that friction is measurable in churn or conversion, prioritize Tier 3 CAS integration. Otherwise defer — the current architecture is honest and functional for what it covers.

---

## META-NOTE ON TIMING

Both open questions share the same discipline: **do not redesign before shipping.**

The risk profile of Ergo. right now is not "we built the wrong thing" — it's "we never find out what we built because we kept redesigning before measuring." Strategic reflection is useful. Strategic reflection as a reason to defer shipping is not.

If either question above starts pulling focus away from Phases 2b through 5, that's a signal to close this file and get back to the roadmap.

---

## REVISION LOG

- **Initial draft** — Logged after conversation about moving from "validated solver" to potential "workflow environment." Decided to defer all expansion decisions until post-Phase 5 conversion data exists.
- **Second entry** — Added audience decision (students, locked), validation architecture map (three-tier expansion path, word problem separation, CAS scope and limits), and build order confirmation (UI pass → 2b → 2c → 3 → 4 → 5).