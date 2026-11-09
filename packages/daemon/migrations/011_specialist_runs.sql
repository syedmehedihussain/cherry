-- Each finished specialist (ECC subagent) run, so a stage's required checks can be verified (ADR-0062).
CREATE TABLE specialist_runs (
  id TEXT PRIMARY KEY,
  at INTEGER NOT NULL,
  project_id TEXT NOT NULL,
  stage TEXT NOT NULL,
  agent TEXT NOT NULL
);
CREATE INDEX specialist_runs_stage ON specialist_runs (project_id, stage, at);
