# Contributing to Cherry

Thanks for helping. Cherry is small and opinionated, so a short read first saves time.

## Set up

```bash
git clone https://github.com/syedmehedihussain/cherry.git
cd cherry
mise install && pnpm install
pnpm dev        # daemon on 127.0.0.1:4317, web on 127.0.0.1:5173
```

Read [`CLAUDE.md`](CLAUDE.md) (the project rules) and [`docs/README.md`](docs/README.md) (a map
of the docs) before a larger change.

## Before you open a pull request

```bash
pnpm lint && pnpm typecheck
pnpm test        # unit tests
pnpm test:e2e    # browser tests (Chromium)
```

All four must pass; CI runs the same checks.

## How we work

- **One change per pull request**, with conventional commit messages (`feat:`, `fix:`, `docs:`).
- **Real choices become ADRs** in [`docs/adr/`](docs/adr/) (copy `template.md`).
- **Match the design.** Use the tokens in `docs/design/tokens.css`, not raw colours.
- **Safety rules are not optional**: loopback only, no edit without approval, secret files are
  never read. See [`docs/security.md`](docs/security.md).
- **Token budget**: an automatic Claude call must be small, capped and on Haiku; anything bigger
  runs only on a click (ADR-0022).
- **New dependencies** need a reason in the pull request; the stack is pinned in ADR-0003.

## Reporting bugs

Open an issue with what you did, what you expected, what happened, and the output of
`cherry doctor`. For security problems, follow [`SECURITY.md`](SECURITY.md) instead.
