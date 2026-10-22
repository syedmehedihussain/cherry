-- Per-project switches kept by Cherry, not in the project folder (ADR-0030: autoCommit).
CREATE TABLE project_settings (
  project_id TEXT NOT NULL,
  key        TEXT NOT NULL,
  value      TEXT NOT NULL,
  PRIMARY KEY (project_id, key)
);
