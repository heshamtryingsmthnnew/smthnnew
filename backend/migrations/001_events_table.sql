CREATE TABLE IF NOT EXISTS events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  kind            TEXT NOT NULL,
  severity        TEXT NOT NULL CHECK (severity IN ('info', 'warn', 'error')),
  correlation_id  TEXT,
  user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id      TEXT,
  build_version   TEXT,
  payload         JSONB DEFAULT '{}'::jsonb,
  message         TEXT
);

CREATE INDEX IF NOT EXISTS idx_events_kind_created  ON events (kind, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_correlation   ON events (correlation_id) WHERE correlation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_events_user_created  ON events (user_id, created_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_events_severity      ON events (severity, created_at DESC) WHERE severity IN ('warn', 'error');

ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- Service role only — events are internal observability, never user-facing.
-- No SELECT policy for authenticated users. No anon access.
