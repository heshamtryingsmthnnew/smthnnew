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

### 2026-05-21 — JPEG extraction bug investigation: entry metadata
- **File:** backend/index.js, /extract-problem handler, top of function
- **Context:** Diagnosing why JPEG uploads return mode: 'none' or fail entirely. Captures file metadata at handler entry to identify whether the issue is upstream (multer/upload) or downstream (vision API/parse).
- **Payload shape:** _diag_session, where, has_file, file_mimetype, file_size_bytes, file_original_name, content_type_header, content_length_header
- **Status:** ACTIVE
- **Resolution date:** (pending)
- **Notes:** Tagged with _diag_session: "jpeg_bug_2026_05" for filtered querying. Resolves once root cause is identified and surgical fix lands.

### 2026-05-21 — JPEG extraction bug investigation: pre-API state
- **File:** backend/index.js, /extract-problem handler, after base64 conversion
- **Context:** Captures the media_type string sent to Anthropic and the first 24 base64 chars (format signature). Distinguishes "buffer corrupted on upload" from "buffer intact but vision API rejects".
- **Payload shape:** _diag_session, where, media_type_sent_to_anthropic, base64_length, base64_first_24_chars, buffer_size_bytes
- **Status:** ACTIVE
- **Resolution date:** (pending)
- **Notes:** base64 signatures — JPEG starts with /9j/, PNG with iVBORw0KGgo, GIF with R0lGODlh.

### 2026-05-21 — JPEG extraction bug investigation: model response
- **File:** backend/index.js, /extract-problem handler, after Claude vision call
- **Context:** Captures the full raw model response (up to 5KB), the cleaned version, stop reason, and token usage. This is the primary evidence for diagnosing whether the model returned [] for a valid image, returned malformed JSON, or returned something we failed to parse correctly.
- **Payload shape:** _diag_session, where, media_type_sent_to_anthropic, raw_response_length, raw_response_text (truncated 5000), cleaned_response_length, cleaned_response_text (truncated 5000), response_stop_reason, response_usage
- **Status:** ACTIVE
- **Resolution date:** (pending)
- **Notes:** Most important observation in this investigation. Truncated at 5000 chars per field to stay under the 2KB payload guidance (relaxed here for diagnostic value).

### 2026-05-21 — JPEG extraction bug investigation: parsed array state
- **File:** backend/index.js, /extract-problem handler, after JSON.parse
- **Context:** Captures the parsed problems array length and a preview of the first 5 entries. Distinguishes "model returned empty array" from "model returned data we then filtered out".
- **Payload shape:** _diag_session, where, problems_count, problems_preview (first 5 entries, each truncated to 200 chars), parse_succeeded
- **Status:** ACTIVE
- **Resolution date:** (pending)
- **Notes:** parse_succeeded is true if problems.length > 0 OR cleaned response was literally "[]" (valid empty array, not parse failure).

### 2026-05-21 — JPEG extraction bug investigation: outer catch
- **File:** backend/index.js, /extract-problem handler, top of catch block
- **Context:** Deep error context if anything between handler entry and the parse step throws. Captures error name, message, status, type, and whether it appears to be an Anthropic SDK error vs something else.
- **Payload shape:** _diag_session, where, file_mimetype, file_size_bytes, error_name, error_message (500 chars), error_status, error_type, is_anthropic_error
- **Status:** ACTIVE
- **Resolution date:** (pending)
- **Notes:** Fires before the existing extract.exception structured event. Both events share the same correlation_id.

---

## Weekly Review

### Week of YYYY-MM-DD
- Total observations active:
- Promoted:
- Deleted:
- Patterns noted:
