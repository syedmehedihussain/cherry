-- V4 o12: tokens, cost and time of every chat turn, per model, for the Claude usage and Invoice
-- tabs. cost_usd is what the API would charge (the plan covers it); it keeps a budget per project.
CREATE TABLE turn_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  project_id TEXT NOT NULL,
  stage TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cache_read_tokens INTEGER NOT NULL,
  cost_usd REAL NOT NULL,
  duration_ms INTEGER NOT NULL,
  -- 1 on the first row of a turn (a turn has a row per model).
  first_row INTEGER NOT NULL
);
CREATE INDEX turn_usage_project ON turn_usage (project_id, at);
