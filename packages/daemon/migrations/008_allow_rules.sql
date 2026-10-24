-- "Always allow here" rules per project (V2.1 w7.7, ADR-0043): run:<command> or tool:<name>.
CREATE TABLE allow_rules (
  project_id TEXT NOT NULL,
  rule       TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (project_id, rule)
);
