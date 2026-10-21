-- Background agents always run in Auto (ADR-0028). Steps only a person may do (push, publish,
-- deploy, rm -r) are skipped and kept here as a JSON array of commands.
ALTER TABLE agents ADD COLUMN needs_json TEXT NOT NULL DEFAULT '[]';
