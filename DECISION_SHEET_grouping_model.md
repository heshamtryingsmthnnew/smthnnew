# DECISION SHEET — Grouping Model: Durable Sessions + Collections-of-Sessions

**Status:** Proposed. Awaiting founder lock on the one open sub-decision (sidebar axis presentation). Everything else decided.
**Tier:** Consequential / partially irreversible. Redefines the core data model and unwinds a previously-locked feature (Collections-of-solves, CLAUDE.md §15). Full sheet, not proceed-on-lean.
**Supersedes:** CLAUDE.md §15 (Collections as Pro-only groups of *solves*); the "Do Not Build in Phase 5a" entries for manual session switching / continue-this-session (those become *the* model, not deferred); relevant STRATEGIC_DECISIONS grouping entries.
**Does NOT change:** the solve atom, verification architecture, the sessions table existing (Pivot 10 stands and is *reinforced* by this), share/export living at the solve level (extended, not replaced).

---

## 1. The decision in one paragraph

Ergo has one grouping primitive that matters at the work level — the **session** — and it becomes **durable**: auto-started by the 4-hour clock when no session is active, but reopenable, renameable, pinnable, shareable, and exportable. New solves append to whatever session is active, and reopening a session makes it active again. Above sessions sits a second, coarser, *optional* primitive — the **collection** — which groups **sessions** (not solves): a course, a final, a semester. "Hw 1" and "Hw 2" are sessions; "Calc 1" is a collection holding them. Collections-of-solves (the old §15 spec) is deleted; the join table it specced is repointed from solves to sessions.

This collapses a redundancy: previously sessions (auto, by time) and collections (manual, by topic) were two answers to the *same* question — "group my solves" — which is why grouping felt frictional. They now answer *different questions at different scales*: session = "what is this body of work," collection = "what course does this work belong to." No overlap; both earn their place.

---

## 2. Why this, and why now

**The friction that started it:** a student names a session after a homework, returns the next day, and the 4-hour rule has already orphaned it into a new auto-named session. "Keep adding to my ongoing homework" had no home. The original answer was Collections — but Collections is Pro-only and Phase 5b, so the free-tier student got nothing, and Collections requires manual per-solve curation, which is *more* friction than the problem it solves.

**The realization:** every session-based product (ChatGPT, Claude, Slack) lets you reopen a thread and continue, with recency bumping it to the top. Those products fuse "time container" and "topic container" into one object. Ergo had *split* them — which is cleaner in theory but is exactly what made "continue working" feel missing. Durable sessions re-fuse them at the work level.

**Why now is the right time, not a disruption:** Collections is fully specced but **not built**. Deleting a spec is cheap; unbuilding shipped code is not. Catching this before Phase 5b is the cheapest possible moment. Pivot 10 (sessions as first-class entities) was made *partly for* future sharing/export — this direction is the natural completion of Pivot 10, not a reversal of it.

**What this resolves for free:** the "should clicking a session activate it" debate evaporates. With durable sessions, clicking-to-activate isn't a risky override bolted onto the clock — it's the *defining behavior* of the primitive. The 4-hour rule demotes from "authority over `activeSessionId`" to "default auto-creation trigger when the user isn't in any session." One authority, not two arbitrating. The architecture tension that made me push back earlier dissolves.

---

## 3. Locked answers

| Question | Decision | Rationale |
|---|---|---|
| Single grouping primitive at work level? | **Yes — durable session.** Collections-of-solves deleted. | Removes redundancy; one obvious place for "my ongoing work." |
| Do collections survive? | **Yes — repurposed to group *sessions*, not solves.** | Different scale (course vs. homework). Earns its place; no longer redundant. |
| Session ↔ collection cardinality? | **Many-to-many.** A session can sit in multiple collections (e.g. "Hw 3" in both "Calc 1" and "Final Review"). | Same join-table cost as the old spec, just repointed. Handles "final review pulls from several homeworks" naturally. Means collections are tags-on-sessions, not a strict folder tree — UI must reflect "add to collection," not "move into folder." |
| Must a session be in a collection? | **No — optional.** Sessions float loose (time-sorted) by default; collecting is a deliberate Pro action. | Forcing every one-off solve into a course bucket is friction. Default state = loose. |
| Multi-group at the *solve* level (one solve in many groups)? | **Not built. Banked as a future per-solve tag, trigger-gated.** | The 90%+ student case is linear ongoing work, which durable sessions model perfectly. One-solve-in-five-topics is a power-user library fantasy; don't carry a subsystem for it. Revisit trigger in §7. |

---

## 4. LOCKED — sidebar presentation: separate surfaces

The two axes (time-recency vs. by-course) are put on **separate surfaces** rather than sharing the sidebar's vertical space.

- **Session sidebar** stays structurally as-is, with one change: the time buckets (Today / This week / Older) are **replaced by a single most-recently-used sort.** This surface answers the high-frequency daily question: "what was I just working on." Always visible.
- **Collections** are *not* in the session sidebar. They live on a separate destination — a button in the nav region (under Batch solve) that opens a **collections page**: collections listed, each expandable to the sessions inside it. This surface answers the lower-frequency question: "show me my courses." A deliberate navigation, not always-visible.

**Why this beats the two shared-sidebar options considered (toggle / stacked headers):** separating the surfaces eliminates the duplicate-appearance problem entirely — a session that is both collected *and* recently-touched never has to render twice, because the recency axis and the course axis never share a surface. No disambiguation chip needed; the con of the stacked-header approach disappears rather than being mitigated.

**The cost (real, correctly placed):** a user who navigates *by course* must leave the session list to reach course structure (open collections page → open the course = two clicks) vs. having it always in the sidebar. This loads the cost onto the *rarer* action: recency-navigation ("get back to what I was doing") is the high-frequency daily reach and stays always-visible; course-navigation ("start studying for Calc 1") is lower-frequency and is one click away. Putting the high-frequency axis resident and the low-frequency axis one-click-away is the correct optimization. The cost is real but sits on the right action.

**Open execution note for the brief (not a blocking decision):** dropping time buckets for a flat recency sort is a clean simplification at ~10 sessions but degrades to an undifferentiated scroll at ~50. Don't let "remove buckets" silently become "remove all scannability." Keep a *light* recency structure — at minimum a faint divider after the recent handful (e.g. an "earlier" break) — short of full Today/Week/Older bucketing. Resolve at brief-writing time.

**Top-tier execution note (the actual win/loss line):** the data model is right; its elegance is only *felt* if each surface reads cleanly. The session sidebar must instantly read as "recent work, freshest first." The collections page must instantly read as "my courses, each holding its sessions." If either surface is ambiguous, the model's coherence is invisible to the user. This is where median execution loses and 1–5% wins — not in the schema.

---

## 5. What unwinds (must be tracked or a future chat rebuilds it)

CLAUDE.md and STRATEGIC_DECISIONS contain locked statements this contradicts. Each must be edited in the same commit that locks this sheet, or stale references will trigger a "helpful" rebuild:

- **CLAUDE.md §15 (Collections):** rewrite from "Pro groups of *solves*" to "Pro groups of *sessions*." Delete: per-solve multi-select checkbox UI, `collection_solves` join, auto-organize-by-problem-kind endpoint. Replace with: `collection_sessions` join (many-to-many), "add session to collection" action, optional membership.
- **CLAUDE.md "Do Not Build in Phase 5a":** the three entries — manual session creation, manual session switching of new solves, "continue this session" — are no longer *deferred*; they become the **defined behavior** of durable sessions. Remove from the Do-Not list; relocate to the durable-session spec as core behavior.
- **CLAUDE.md "Do Not" global list:** the line *"Load a solve when a user clicks a session header — loading is always at problem level, never triggered by session click"* — this is the locked constraint the whole discussion reverses. It must be explicitly removed and replaced with the new click behavior (clicking a session activates it: sets it active for new solves, displays its most recent solve or empty composer per the entry-behavior decision still to be specced). **This is the single most important deletion — it is the line a future chat will otherwise enforce against the new behavior.**
- **CLAUDE.md "Do Not" line:** *"Allow collection delete to cascade-delete constituent solves"* — update to "constituent sessions" and confirm the rule still holds (deleting a collection must not delete its sessions).
- **STRATEGIC_DECISIONS — the deferred "manual session control" rationale:** mark superseded by this sheet, with a pointer.
- **STRATEGIC_DECISIONS — the project-context / Direction B entry:** note that durable sessions are a step *toward* project-context (a durable session IS lightweight project context); cross-reference.
- **Share/Export specs (§14, §16):** currently solve-level. Decide whether session-level share/export is in scope now or banked (recommend banking session-level share to its own brief — it's a meaningful surface, not a free addition).

---

## 6. Build sequencing (NOT a brief — sequencing only; briefs written on request)

This is too big for one brief. Proposed order, smallest-irreversible-first:

1. **Durable sessions (backend + activation).** Demote the 4-hour rule to "auto-create when no active session." Add: manual activation (reopening a session sets `activeSessionId`), activation persists until Home or until another session is selected (see §6a). New solves append to the active session regardless of the clock. `last_solve_at` updates on append so recency-sort works. This is the load-bearing change; everything else depends on it.
2. **Sidebar recency + reopen UX.** Reopened/appended sessions bump by recency; the session sidebar sorts most-recently-used (time buckets removed, light recency divider retained — see §4). Wire the click-to-activate behavior (replaces the deleted Do-Not constraint). **Home behavior — promoted from bug to spec:** in the durable model, Home is the user's primary *deactivation* gesture (per §6a: the clock creates, only the user deactivates). Home must clear `displayedSessionId` AND `activeSessionId`, returning to the no-active-session state, and revert the notch to the watermark. The current shipped bug (notch retains the session name on an empty Home screen, because `handleReset` clears the artifact but not the session pointers) is fixed *as part of defining this behavior* — it is not a separate polish item. After Home, the next solve auto-creates a fresh session via the 4-hour rule, exactly as a cold start.
3. **Collections-of-sessions (Pro).** The repointed join, "add session to collection," optional membership. Collections live on a **separate collections page** (nav button under Batch solve), not in the session sidebar (§4).
4. **Session-level share/export (banked — own brief if/when).**

Tier B (stop-and-report) candidates within this: any change touching the atomic `get_or_create_active_session` function — it was hardened against races deliberately; teaching it to accept a manual-active override must not reintroduce a race. That step gets its own scrutiny, not an autonomous loop.

### 6a. Activation expiry — LOCKED (founder deferred to recommendation)

When a user manually activates an old session, that activation **persists until explicit exit (Home, or selecting another session). No 4-hour clock expiry on a manually-activated session.** Rationale: the clock's only remaining job is auto-*creation* when nothing is active; once the user has expressed intent by opening a session, the clock must not silently override it — that would reintroduce the exact orphaning friction this whole change exists to kill. The clock creates; the user deactivates.

### 6b. Session entry behavior — LOCKED (founder deferred to recommendation)

Activating a session by click shows the **empty composer with the notch showing the session name; arrows available to page its solves.** It does NOT auto-load the most recent solve. Rationale: activating a session is "I'm going to work *in* here," not "show me an old answer" — and not auto-firing `DISPLAY_SOLVE` avoids a wasted render/fetch on every activation. (Reopening a *specific solve* from within the session — via arrows or a future solve list — is the path to viewing old answers; activation alone is for working.)

---

## 7. Revisit triggers (for the banked item)

**Per-solve multi-group (tags):** build only if (a) founder's own NYUAD coursework use surfaces a real need to file one solve under multiple topics, OR (b) post-launch data shows users repeatedly wanting a solve in more than one session/collection. Until then, sessions-as-linear + collections-of-sessions covers the modeled behavior. Additive when/if needed (a tag table is cheap); no need to carry it now.

---

## 8. Projections (per protocol)

**Realistic (skilled execution):** The nested model ships clean because the pieces largely exist — durable sessions modify what's shipped; collections-of-sessions is a *smaller* build than collections-of-solves (no per-solve checkbox UI, no auto-organize). The product simplifies: one work-level primitive, one coarser optional primitive, a clear mental map. Free-tier students get "keep working" without a Pro wall. Collision cases (cross-day reactivation, two-tab races on the active pointer) get patched as they surface.

**Top-tier (1–5%):** The hierarchy is self-evident to a new user with zero explanation — a session fills as you work, courses hold sessions, mapping directly onto how students already think (assignments inside courses). That intuitiveness is the prize, and it's a genuine differentiator going into a technical program where the alternative tools have no concept of durable, verifiable, course-organized work. The win-or-lose line is entirely in the sidebar's two-axis presentation: get it clean and the model's coherence is felt without being explained; let it clutter and the elegant data model is invisible.

---

## 9. What's locked vs. deferred

**Locked:** §3 (all five), §4 (separate surfaces — recency sidebar + separate collections page), §6a (persist-until-exit), §6b (empty composer on activation), §6 step-2 Home-as-deactivation behavior.
**Open execution detail (resolve at brief-writing, not blocking):** the light recency divider in the flat session sidebar (§4).
**Deferred (logged, triggered):** per-solve tags (§7), session-level share/export (own brief).
**Write on request:** Brief for step 1 (durable sessions) first; the rest follow in sequence (§6).

The whole sheet is now locked except one non-blocking presentation detail. Ready to convert to briefs on request — recommend starting with step 1 (durable sessions backend + activation), since every other step depends on it.
