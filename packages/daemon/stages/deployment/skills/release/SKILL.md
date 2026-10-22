---
name: release
description: Ship a finished milestone safely - readiness gate, version and CHANGELOG, commit, push or pull request, deploy, verify and a rollback plan. Use when asked to release, ship, deploy, publish or tag a version.
---

# Release

Stop at the first red step and say what is wrong. Pushing, publishing and deploying are seen
by other people: before each one, say what it will do and how to undo it, and let the user
approve it.

## 1. Gate
- The milestone's Done when list is met: check each line against the code or by running it.
- `git status` is clean, or every change belongs to this release.
- Install, tests, typecheck and lint pass locally (the commands in CLAUDE.md).
- CI is green on the branch: `gh run list --branch <branch> --limit 5`.

## 2. Prepare
- Version: bump it where the project keeps it (`package.json`, `pyproject.toml`,
  `Cargo.toml`, …) following semver: breaking change = major, feature = minor, fix = patch.
  Skip if the project does not version.
- CHANGELOG: add an entry at the top in the project's existing style, written for users:
  what they can now do, what was fixed, anything they must change.
- Docs and README still describe what ships; `_project/STATUS.md` says what was released.

## 3. Ship
- Commit with the project's message style (for example `chore(release): 1.2.0`).
- Push the branch, or open a pull request with `gh pr create` when the project merges through
  pull requests. Never force-push to main or master.
- Tag the release when the project tags (`git tag v1.2.0`, push the tag), and create the
  GitHub release from the CHANGELOG entry (`gh release create`).
- Deploy with the project's own command or workflow; do not invent a new deploy path.

## 4. Verify
- Watch the workflow run to the end (`gh run watch` or `gh run view`).
- Check the deployed thing answers: open the URL, run the installed command, or read the
  package page. Report the links.

## 5. Rollback plan
Write down, before or right after shipping: the last good version or commit, the command to
roll back (revert and redeploy, or redeploy the previous tag), and how to check it worked.
If the project has no `docs/runbook.md`, offer to write one with deploy, rollback and health
checks.
