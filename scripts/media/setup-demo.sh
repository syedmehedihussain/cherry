#!/usr/bin/env bash
# Builds a demo HOME with made-up projects for Cherry screenshots. Nothing real inside.
set -euo pipefail
D="$1"
rm -rf "$D"; mkdir -p "$D/Projects"
export GIT_AUTHOR_NAME="Ada Park" GIT_AUTHOR_EMAIL="ada@example.com" GIT_COMMITTER_NAME="Ada Park" GIT_COMMITTER_EMAIL="ada@example.com" GIT_CONFIG_GLOBAL=/dev/null
w() { mkdir -p "$(dirname "$1")"; cat > "$1"; }
commit() { local dir=$1 msg=$2 date=$3; git -C "$dir" add -A; GIT_AUTHOR_DATE="$date" GIT_COMMITTER_DATE="$date" git -C "$dir" commit -q -m "$msg"; }

# ---------- orbit-notes: the hero project ----------
P="$D/Projects/orbit-notes"
mkdir -p "$P"; git -C "$P" init -q -b main
w "$P/_project/project.json" <<'J'
{"schema":1,"name":"orbit-notes","summary":"Fast local-first Markdown notes with tags and search","phase":"development","stack":["TypeScript","Node 22","SQLite"]}
J
w "$P/_project/STATUS.md" <<'J'
---
name: orbit-notes
status: active
summary: Fast local-first Markdown notes with tags and search
---

## Building now

Theme support: a light and dark theme the user can switch from the header.

## Where we left off

Full-text search ships behind the `/` shortcut and returns results in under 20 ms on 5,000 notes. Tags are stored in their own table so renames are a single update.

## Next steps

- [ ] Add a theme toggle in the header
- [ ] Export a note as PDF
- [ ] Sync folder watcher for notes edited outside the app

## Done recently

- Search with ranking and highlighted matches
- Tag editor with rename and merge
EOF_STATUS_PLACEHOLDER
J
sed -i '/EOF_STATUS_PLACEHOLDER/d' "$P/_project/STATUS.md"
w "$P/_project/notes.md" <<'J'
## Ideas

- Keyboard-first: every action has a shortcut.
- Maybe a daily note template.
J
w "$P/CLAUDE.md" <<'J'
# CLAUDE.md — orbit-notes

Local-first Markdown notes. Node 22 + TypeScript, SQLite via better-sqlite3, plain HTML/CSS UI.

## Rules

1. Notes are plain `.md` files on disk; the database is only an index.
2. No network calls. Everything works offline.
3. Small commits, conventional messages.
J
w "$P/README.md" <<'J'
# orbit-notes

Fast, local-first Markdown notes with tags and instant search.

- Notes are plain Markdown files in a folder you choose.
- Full-text search with ranking (`/` to focus).
- Tags with rename and merge.

```bash
npm install
npm run dev
```
J
w "$P/docs/prd.md" <<'J'
# Product requirements — orbit-notes

## Problem

Note apps either lock notes in a database or are slow on large folders.

## Goals

- Open a 5,000-note folder in under a second.
- Search returns in under 50 ms.
- Notes stay plain Markdown files.

## Non-goals

- Collaboration and sync servers.
J
w "$P/docs/adr/0001-notes-are-files.md" <<'J'
# 0001 — Notes are files, the database is an index

- **Status:** Accepted

We keep every note as a `.md` file and rebuild the SQLite index from disk on start.
J
w "$P/docs/adr/0002-sqlite-fts5-search.md" <<'J'
# 0002 — SQLite FTS5 for search

- **Status:** Accepted

FTS5 gives ranking and highlighting with no extra service.
J
w "$P/package.json" <<'J'
{
  "name": "orbit-notes",
  "version": "0.4.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "node server.js",
    "test": "node --test"
  },
  "dependencies": {
    "express": "^5.1.0"
  }
}
J
mkdir -p "$P/node_modules"
w "$P/.gitignore" <<'J'
node_modules/
.env
*.log
J
w "$P/src/theme.ts" <<'J'
export type Theme = 'light' | 'dark';

const KEY = 'orbit.theme';

/** The saved theme, or the system preference on first start. */
export function currentTheme(): Theme {
  const saved = localStorage.getItem(KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}
J
w "$P/src/search.ts" <<'J'
import type { Database } from 'better-sqlite3';

export interface Hit {
  path: string;
  title: string;
  snippet: string;
}

/** Ranked full-text search over the notes index (ADR-0002). */
export function search(db: Database, query: string, limit = 20): Hit[] {
  if (!query.trim()) return [];
  return db
    .prepare(
      `SELECT path, title, snippet(notes, 2, '<mark>', '</mark>', '…', 12) AS snippet
         FROM notes WHERE notes MATCH ? ORDER BY rank LIMIT ?`,
    )
    .all(query, limit) as Hit[];
}
J
w "$P/src/tags.ts" <<'J'
import type { Database } from 'better-sqlite3';

export function renameTag(db: Database, from: string, to: string): void {
  db.prepare('UPDATE tags SET name = ? WHERE name = ?').run(to, from);
}
J
w "$P/src/header.ts" <<'J'
import { applyTheme, currentTheme } from './theme.ts';

export function mountHeader(root: HTMLElement): void {
  root.innerHTML = `<h1>orbit</h1><input id="q" placeholder="Search notes  /" />`;
  applyTheme(currentTheme());
}
J
w "$P/index.html" <<'J'
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>orbit notes</title>
<style>
  :root { color-scheme: dark; --bg:#0b0b0c; --s1:#151517; --b:#26262a; --t1:#f2f2f2; --t2:#a1a1aa; --accent:#ff5a4e; }
  * { box-sizing: border-box; }
  body { margin:0; font: 15px/1.5 system-ui, sans-serif; background:var(--bg); color:var(--t1); display:grid; grid-template-columns: 260px 1fr; height:100vh; }
  aside { border-right:1px solid var(--b); padding:20px; }
  h1 { font-size:18px; margin:0 0 16px; letter-spacing:-.02em; } h1 span { color:var(--accent); }
  input { width:100%; padding:9px 12px; border-radius:10px; border:1px solid var(--b); background:var(--s1); color:var(--t1); font:inherit; }
  ul { list-style:none; padding:0; margin:18px 0 0; } li { padding:8px 10px; border-radius:8px; color:var(--t2); } li.on { background:var(--s1); color:var(--t1); }
  main { padding:40px 56px; max-width:760px; } h2 { font-size:28px; margin:0 0 6px; letter-spacing:-.02em; } .tags span { display:inline-block; margin-right:6px; padding:2px 10px; border-radius:99px; border:1px solid var(--b); color:var(--t2); font-size:12px; }
  p { color:#d4d4d8; } mark { background: color-mix(in srgb, var(--accent) 30%, transparent); color: var(--t1); border-radius: 3px; padding: 0 2px; }
</style>
</head>
<body>
<aside><h1>orbit<span>.</span></h1><input placeholder="Search notes   /" value="launch" />
<ul><li class="on">Launch checklist</li><li>Reading list</li><li>Weekly review — Oct 6</li><li>Ideas for search ranking</li><li>Trip to Lisbon</li></ul></aside>
<main><h2>Launch checklist</h2><div class="tags"><span>#work</span><span>#launch</span></div>
<p>Before the <mark>launch</mark> on Friday:</p>
<p>1. Freeze the schema and tag the release.<br/>2. Write the changelog from the merged PRs.<br/>3. Record a two-minute demo of search and tags.<br/>4. Post the <mark>launch</mark> note to the team.</p></main>
</body></html>
J
w "$P/server.js" <<'J'
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';

const port = 5180;
createServer((req, res) => {
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.end(readFileSync(new URL('./index.html', import.meta.url)));
}).listen(port, '127.0.0.1', () => {
  console.log('\n  orbit-notes dev server\n');
  console.log(`  ➜  Local:   http://localhost:${port}/`);
  console.log('  ➜  Watching src/ for changes');
});
J
w "$P/test/search.test.js" <<'J'
import test from 'node:test';
test('search returns ranked hits', () => {});
J
echo "_project/" >> "$P/.git/info/exclude"
commit "$P" "chore: project skeleton" "2026-09-20T10:00:00"
commit "$P" "feat(search): ranked full-text search with highlights" "2026-10-02T15:20:00" --allow-empty 2>/dev/null || true
w "$P/src/search.ts.bak" <<'J'
J
rm "$P/src/search.ts.bak"
echo "// tag merge" >> "$P/src/tags.ts"; commit "$P" "feat(tags): rename and merge tags" "2026-10-08T11:05:00"
echo "// highlight tweaks" >> "$P/src/search.ts"; commit "$P" "feat(search): highlight matches in results" "2026-10-11T17:40:00"
# One uncommitted change for the git box.
sed -i 's|placeholder="Search notes  /"|placeholder="Search notes  (press /)"|' "$P/src/header.ts"

# ---------- smaller projects for Home ----------
mk() { # name summary phase stack status-body
  local P="$D/Projects/$1"; mkdir -p "$P"; git -C "$P" init -q -b main
  printf '{"schema":1,"name":"%s","summary":"%s","phase":"%s","stack":%s}\n' "$1" "$2" "$3" "$4" | w "$P/_project/project.json"
  printf '%b' "$5" | w "$P/_project/STATUS.md"
  printf '# %s\n\n%s\n' "$1" "$2" | w "$P/README.md"
  echo "_project/" >> "$P/.git/info/exclude"
  commit "$P" "chore: start $1" "$6"
}
mk atlas-api "REST API for mission tracking with role-based access" preparation '["Node 22","Fastify","Postgres"]' "## Where we left off\nThe data model and API contract are written; auth is decided (ADR-0004).\n\n## Next steps\n- [ ] Scaffold the Fastify app and the first migration\n" "2026-10-10T09:00:00"
mk pixel-garden "A cozy browser game where plants grow from your commits" design '["TypeScript","Canvas"]' "## Where we left off\nArt direction picked: 16-colour palette, 32px tiles.\n\n## Next steps\n- [ ] Sketch the garden screen and the plant growth stages\n" "2026-10-07T20:00:00"
mk weather-bot "Telegram bot that sends a rain warning before you leave home" plan '["Python 3.13"]' "## Where we left off\nIdea written down; survey not started.\n\n## Next steps\n- [ ] Run the survey and pick a weather API\n" "2026-10-01T08:30:00"
mk ledger-cli "Plain-text budgeting from the terminal" deployment '["Rust"]' "## Where we left off\nv1.2 is on crates.io. Only bug fixes now.\n\n## Next steps\n- [ ] Answer the open issue about CSV dates\n" "2026-09-12T12:00:00"
echo done
