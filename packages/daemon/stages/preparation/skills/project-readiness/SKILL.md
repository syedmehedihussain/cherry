---
name: project-readiness
description: Check that a project is ready to build (repo, guide, tooling, tests, config, CI, structure) and report each item as ready, missing or broken with evidence. Use when asked if a project is ready, what is missing, or to set a project up before development.
---

# Project readiness check

Work through the list in order. For each line record **ready**, **missing** or **broken**, and
the evidence: the file you read or the command you ran and its result. Do not mark anything
ready from memory or from a file name alone.

## 1. Plan and design
- A PRD or a spec for the current round exists (`docs/prd.md`, `docs/specs/*.md`).
- The roadmap has the milestone being built, with numbered tasks and a Done when list.
- Architecture and data model docs exist when the project has more than one part or stores data.
- The docs agree with each other (same names, same stack, no contradicting ADRs).

## 2. Repository
- `git status` works; the default branch is named; there is a first commit.
- `.gitignore` covers the stack: dependencies, build output, caches, `.env*` except examples,
  editor and OS files.
- No secrets are tracked: search the tracked files (`git ls-files`) for key-like strings and
  for files named `.env`, `*.pem`, `*.key`, `id_*`.
- A remote exists if the project is meant to be on GitHub (`git remote -v`).

## 3. Project guide
- `CLAUDE.md` says how to install, run, test, lint and typecheck, and lists the project rules.
- `README.md` says what the project is and how to start it.

## 4. Tooling
- The runtime version is pinned (`mise.toml`, `.tool-versions`, `.nvmrc`, `pyproject.toml`,
  `rust-toolchain.toml`, …).
- Dependencies install cleanly with the project's own command.
- The commands in CLAUDE.md exist and pass: run each one, one at a time.

## 5. Tests
- A test runner is set up and at least one test passes.
- End-to-end tests are set up when the plan has user flows that need them.

## 6. Configuration
- `.env.example` (or the stack's equivalent) lists every variable the code reads, with
  placeholder values. Find the variables by searching the code (`process.env`, `os.environ`,
  `env::var`, …).

## 7. CI
- When the project uses GitHub: a workflow in `.github/workflows/` runs install, tests and lint
  on push and pull request, with the same runtime version as the pin.

## 8. Structure
- The folders the architecture names exist, even if empty apart from a placeholder.

## Report

Write the result as a checklist grouped by the sections above, then:
- **Fix now** — the missing or broken items Claude can fix, smallest first.
- **Needs you** — what only the user can do (accounts, secrets, domains, paid services).
- **Ready to build?** — yes or no, in one line.

When fixing, add to existing files instead of replacing them, and never write real secrets.
