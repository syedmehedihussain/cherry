-- Rewind (V2.1 w7.9): the next turn resumes Claude's session only up to this entry.
ALTER TABLE sessions ADD COLUMN resume_at TEXT;
