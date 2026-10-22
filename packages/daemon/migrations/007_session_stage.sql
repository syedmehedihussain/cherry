-- Lifecycle stages (ADR-0034): one chat per project and stage. Older chats are Development.
ALTER TABLE sessions ADD COLUMN stage TEXT NOT NULL DEFAULT 'development';
