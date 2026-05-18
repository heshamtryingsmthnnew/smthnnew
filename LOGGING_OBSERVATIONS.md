# LOGGING_OBSERVATIONS.md — debug.observation Tracking

Every `debug.observation` event added to the codebase during testing is logged here.
This file exists to prevent debug call sites from rotting into production.

**Hard rule:** Every entry must be resolved before Phase 6 launch. Resolution means one of:
- **Promote** — observation pattern is a real failure mode, add a structured event kind in `backend/eventKinds.js` and replace the call site
- **Delete** — observation never fired, or fired once and was investigated, remove the call site
- **Keep as debug** — only valid for observations that are genuinely transient (e.g. instrumenting a specific bug hunt for one week)

---

## Template

```
### YYYY-MM-DD — [short description]
- **File:** path/to/file.js, line N
- **Context:** what triggered adding this observation
- **Payload shape:** what fields it logs
- **Status:** ACTIVE | PROMOTED to <kind> | DELETED | KEPT
- **Resolution date:**
- **Notes:**
```

---

## Active Observations

(none yet)

---

## Weekly Review

### Week of YYYY-MM-DD
- Total observations active:
- Promoted:
- Deleted:
- Patterns noted:
