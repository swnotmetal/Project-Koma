CREATE TABLE IF NOT EXISTS gate_feedback (
  id TEXT PRIMARY KEY,
  prompt TEXT NOT NULL CHECK (length(prompt) BETWEEN 1 AND 1000),
  domain TEXT NOT NULL CHECK (domain IN ('general', 'code', 'support', 'reference', 'legal')),
  returned_verdict TEXT NOT NULL CHECK (returned_verdict IN ('allowed', 'blocked')),
  expected_verdict TEXT NOT NULL CHECK (expected_verdict IN ('allowed', 'blocked')),
  submitted_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  CHECK (returned_verdict <> expected_verdict)
) STRICT;

CREATE INDEX IF NOT EXISTS idx_gate_feedback_expires_at
  ON gate_feedback (expires_at);
