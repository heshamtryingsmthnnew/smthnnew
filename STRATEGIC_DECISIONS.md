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
## RESOLVED — Batch Solve Is Pro-Only

**Status:** Decided. Not up for revisitation unless Phase 6+ usage data
strongly contradicts it (specifically: high free-tier engagement with batch
that converts to Pro).

### Decision

Batch solve is a Pro-only feature with UI absent on the free tier. Free
tier is single-solve only. Same treatment as Export and Collections: not
hidden, not disabled, not rendered.

### Why this was decided

The original Phase 5 design gated batch by quota (15 free / 50 Pro). That
framing treated batch and single-solve as the same product feature with
different volume limits. They are not.

Batch without CAS produces an experience that is **worse than single-solve**
on the problem types the target audience actually solves:

- Single-solve forces engagement with each problem's verification badge
  individually. Unavailable badges are honest, contextual, and paired with
  a clear "Use Advanced Verification" suggestion. The unavailable state is
  framed as a moment of choice, not a failure.
- Batch renders 15 problems as a list. Approximately 12 carry unavailable
  badges on a typical calculus problem set. The user's takeaway is "Ergo's
  verification is mostly broken on the stuff I care about" — not "I should
  upgrade for CAS." It is anti-marketing.

The batch value proposition requires CAS to land. CAS covers derivatives,
integrals, simplification, and Wolfram-queryable expressions — exactly the
long tail of student problem sets where batch is useful. With CAS, badge
distribution on a 15-problem set shifts to mostly verified or confirmed,
and batch becomes a real workflow product. Without CAS, it is a list that
makes the verification layer look broken.

### What this means for future decisions

- All batch UI surfaces (input bar entry, sidebar indicator, batch modal,
  result panel, Phase 5a secondary expanding panel) are wrapped in a
  single gate constant. Free tier sees none of it.
- Phase 5a batch panel refactor inherits this gating automatically.
- Phase 6 replaces the env-driven gate (BATCH_DEV_ALLOW backend,
  NEXT_PUBLIC_SHOW_BATCH_UI frontend) with a real `user.is_pro === true`
  check on the user record. No other code needs to change at that point.
- SEO and onboarding content should reference batch as a Pro feature when
  showcasing it. Free-tier marketing should focus on single-solve and the
  verification layer, not "you get to try batch."

### Trigger to revisit

Unlikely to revisit. Possible triggers:

1. **Post-Phase-6 conversion data shows batch is rarely a conversion driver.**
   If Pro users barely use batch and free users never request it, the
   architectural decision to gate it was correct but the marketing emphasis
   should shift away from batch as a Pro value prop.
2. **A "lite batch" mode without CAS becomes viable** — for example, if a
   proprietary CAS ships (see OPEN QUESTION 3) and runs at near-zero
   marginal cost, batch could become free-tier-viable because verification
   coverage would no longer depend on Wolfram. Re-read this entry before
   making that change.

### How to apply if revisiting

Re-read the reasoning above first. The "anti-marketing" risk is the load-
bearing argument. If batch verification coverage on student problem sets
exceeds ~70% verified-or-confirmed without Pro features, the argument
weakens and reopening this decision becomes valid. Until then: locked.

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
## OPEN QUESTION 3 — When to build SymPy CAS (self-hosted replacement for Wolfram)

**Status:** Unresolved. Deferred until triggered by cost, rate limits, or feature need.

### The trade-off

**Wolfram Alpha API (current):**
- Cost: $4.99/month base + $0.01/call after 10k
- At 250 Pro users (3 advanced checks/day average): ~$130/month
- At 1,000 Pro users: ~$520/month
- Rate limit: 10 requests/second (paid tier) — can bottleneck at high concurrency
- Coverage: ~95% of undergrad math, obscure special functions, non-elementary integrals
- No maintenance burden, but vendor lock-in risk (pricing changes, API deprecation, ToS enforcement)

**SymPy (self-hosted Python sidecar):**
- Cost: $30–50/month fixed infrastructure (Railway/Render instance)
- Breakeven: ~50 Pro users. After that, SymPy is cheaper every month.
- At 250 Pro users: ~$30/month → saves $100/month vs Wolfram
- At 1,000 Pro users: ~$50/month → saves $470/month vs Wolfram
- No rate limits you don't control — scales to 100+ req/sec with more instances
- Coverage: ~85% of undergrad math through second-year calculus and linear algebra
- Deterministic, inspectable — stronger trust signal than Wolfram black box
- Enables step-level verification (check each solution section independently) without 8× cost
- Slower: 500ms–2s vs Wolfram's 200–500ms (mitigated by async + caching)
- Build time: 2–3 weeks (Python FastAPI service, SymPy wrapper, deploy, wire into Node backend)

### Benefits of SymPy

1. **Cost control** — fixed infrastructure cost, unbounded usage
2. **No rate limits you don't control** — you own the scaling
3. **No vendor lock-in** — open-source BSD license, you own the runtime
4. **Richer output for step-level verification** — symbolic objects you can programmatically inspect
5. **Deterministic = trust-aligned** — every step is reproducible and traceable
6. **Physics fallback potential** — sympy.physics.mechanics for symbolic mechanics, units, dimensional analysis

### Drawbacks of SymPy

1. **Slower** — 500ms–2s vs Wolfram's 200–500ms
2. **Narrower coverage** — 85% vs Wolfram's 95% (missing: obscure special functions, non-elementary integrals, advanced number theory)
3. **Maintenance burden** — you debug the sidecar, handle version updates, monitor uptime
4. **Initial build time** — 2–3 weeks opportunity cost vs shipping other features

### Triggers to build SymPy

Do NOT build speculatively. Build when one of these four conditions is met:

**Trigger 1: Wolfram costs hit $300+/month**  
At ~500 Pro users making $6,000/month revenue. SymPy saves $250+/month. 2–3 week build pays for itself in 3 months. ROI is clear.

**Trigger 2: Wolfram rate limits become a UX problem**  
If you're seeing `cas.verdict: "unavailable"` due to 429 errors during peak hours (not quota exhaustion, actual rate limiting), and students complain or churn measurably, SymPy removes the bottleneck.

**Trigger 3: You want to ship step-level divergence (Option B)**  
Multiple Wolfram calls per solve (3–8 calls/verification) at $0.01/call scales to 45% of Pro revenue. SymPy at $0.0001/call (compute cost only) makes step-level divergence economically viable. If this becomes the wedge needed to justify subscription, SymPy is the unlock.

**Trigger 4: Wolfram changes pricing or ToS**  
If they raise per-call price, shut down the Full Results API, or enforce new restrictions, you have no choice. Build SymPy immediately as escape hatch.

### Decision thresholds

| Monthly Wolfram Cost | Action |
|---|---|
| < $200 | Do nothing. Use Wolfram. |
| $200–300 | Monitor closely. Plan SymPy build. |
| $300+ | Build SymPy. 2–3 week sprint. |
| Rate limit failures in logs | Build SymPy regardless of cost. |

### What NOT to do

- Do not build SymPy pre-launch or pre-revenue "just in case"
- Do not build it for infrastructure elegance — only build when economics or UX force it
- Do not use SymPy as a reason to delay shipping Phases 3–5
- Do not build step-level verification (Option B) before SymPy exists — the Wolfram cost is prohibitive

### Realistic baseline (skilled execution)

Ship with Wolfram. Monitor costs and rate limits post-launch via backend logs and Wolfram dashboard. When Trigger 1 or 2 hits, allocate 2–3 weeks to build SymPy as a drop-in Wolfram replacement. Test in parallel (both wired in, backend chooses based on problem type or A/B flag). Swap when parity confirmed. Total delay to product roadmap: 0 weeks (you build it when revenue justifies it).

### Top-tier outcome (1–5% execution)

Build SymPy now as part of Phase 3 or 6. Ship with SymPy + Wolfram both wired in. Backend routing: SymPy for equations/systems/calculus (fast common case), Wolfram as fallback for edge cases (obscure functions, non-elementary integrals). Gives you cost control from day 1, lets you ship step-level divergence (Option B) without economic constraint, removes vendor dependency before it becomes a risk. Delay to roadmap: 2–3 weeks. Payoff: stronger wedge (step-level checks), lower costs (5× reduction at scale), no Wolfram dependency risk.

### Current decision

**Do not build SymPy pre-launch.** Wolfram works, cost is manageable at current scale ($0 — no users yet), and 2–3 weeks spent on SymPy infrastructure could instead ship Phase 4 (deployment) and Phase 5 (auth/monetization). Revenue and traction matter more than infrastructure optimization right now.

**Revisit when:** First trigger condition is met post-Phase 5. Add to roadmap as Phase 6 or 7 depending on timing.

---

*Add this section to STRATEGIC_DECISIONS.md after OPEN QUESTION 2, before the RESOLVED sections.*
---

## DEFERRED DECISION — Session Model: Manual Controls (Phase 5a)

**Status:** Deferred. Do not build in Phase 5a. Post-launch candidates.

### Deferred features
- Manual session creation
- Manual session switching (assigning new solves to old sessions)
- "Continue this session" feature

### Rationale
Auto-grouping via 4-hour clustering is the correct v1 model. Manual controls
add UI complexity before product-market fit is established. The 4-hour window
covers the realistic solve session length for a student working through a
problem set. Edge cases (returning to a session after a break) are acceptable
losses in v1 — the cost of the wrong grouping is low, the cost of building
manual controls before users demand them is high.

### Trigger condition
Re-evaluate when: >20% of support requests or user feedback explicitly
mentions wanting to organize solves into named sessions manually, OR when
usage patterns show a significant share of solves (>15%) occurring in
cross-day multi-session patterns that the 4-hour window consistently misgroups.

### How to apply
When trigger is met, read this entry first. Consider whether auto-grouping
improvements (longer window, smarter clustering by problem_kind) solve the
pain before adding manual controls. Manual session creation is the last resort.

---

## REVISION LOG

- **Initial draft** — Logged after conversation about moving from "validated solver" to potential "workflow environment." Decided to defer all expansion decisions until post-Phase 5 conversion data exists.
- **Second entry** — Added audience decision (students, locked), validation architecture map (three-tier expansion path, word problem separation, CAS scope and limits), and build order confirmation (UI pass → 2b → 2c → 3 → 4 → 5).