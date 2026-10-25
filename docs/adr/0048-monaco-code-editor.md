# 0048 — Monaco for file tabs in Development

- **Status:** Accepted
- **Date:** 2026-10-25
- **Decided by:** Claude (V3 server run), for review. The user chose Monaco (docs/v3-redesign.md,
  answer 2); this records how it is used.

## Context

V3 makes Development feel like VS Code with Claude Code as the first tab (ADR-0045). The file
viewer had a plain textarea for edits (ADR-0021). The user picked Monaco, the editor inside VS
Code. It must not send anything off the machine, and it is large (about 4 MB of script).

## Options

1. **`monaco-editor` with `@monaco-editor/react`, bundled by Vite.** Trade-off: a big chunk, but
   it loads only with the first file tab.
2. **`@monaco-editor/react` with its default CDN loader.** Trade-off: smaller install, but the
   browser fetches the editor from jsDelivr, which leaves the machine.
3. **CodeMirror 6.** Trade-off: smaller, but not what the user asked for and not VS Code's keys.

## Decision

We chose **1**.

- `lib/monaco.ts` imports the local `monaco-editor`, sets `MonacoEnvironment.getWorker` to Vite
  `?worker` bundles (editor, JSON, CSS, HTML, TypeScript) and calls `loader.config({ monaco })`,
  so the React wrapper never uses its CDN.
- The editor is a lazy chunk: the page loads it with the first file tab.
- The theme is built at run time from `tokens.css`, so all four Cherry themes carry over.
- Save keeps the ADR-0021 rule: Ctrl+S writes one text file after the unchanged-on-disk check.
  A conflict offers Reload from disk or Overwrite with mine. Secret and binary files stay
  blocked.
- A file Claude changed in the chat shows a band with Show diff (Monaco's inline diff against
  the last commit) and Undo (puts the last committed text in the buffer; nothing is written
  until Save). Lines that differ from the last commit are marked in the gutter.
- An unsaved buffer survives a tab switch; closing the tab drops it (and asks first).

## Consequences

- Good: VS Code keys, find, multi-cursor, folding and IntelliSense for TS/JSON/CSS/HTML.
- Bad / cost: the web build grows by the Monaco chunk and its workers.
- Follow-up: none.
