-- Auto mode for background agents (ADR-0025): commands run without asking, except push,
-- publish and rm -r.
ALTER TABLE agents ADD COLUMN auto INTEGER NOT NULL DEFAULT 0;
