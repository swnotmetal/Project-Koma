CREATE TABLE gate_feedback_v2 (
  id TEXT PRIMARY KEY,
  prompt TEXT NOT NULL CHECK (length(prompt) BETWEEN 1 AND 1000),
  expires_at TEXT NOT NULL
) STRICT;

INSERT INTO gate_feedback_v2 (id, prompt, expires_at)
  SELECT id, prompt, expires_at FROM gate_feedback;

DROP TABLE gate_feedback;
ALTER TABLE gate_feedback_v2 RENAME TO gate_feedback;

CREATE INDEX idx_gate_feedback_expires_at
  ON gate_feedback (expires_at);
