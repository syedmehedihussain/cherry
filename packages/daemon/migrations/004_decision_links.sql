-- Decisions tab (ADR-0026): the chat turn or agent that Cherry started to make an approved
-- change. The decision's state itself lives in the ADR file.
CREATE TABLE decision_links (
  project_id  TEXT NOT NULL,
  adr_number  INTEGER NOT NULL,
  kind        TEXT NOT NULL,          -- chat | agent
  ref         TEXT NOT NULL,          -- turn id or agent id
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (project_id, adr_number)
);
CREATE INDEX decision_links_ref ON decision_links (kind, ref);
