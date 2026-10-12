# Security policy

## Supported versions

Only the latest release gets fixes.

## Reporting a vulnerability

Please do not open a public issue. Email **syedmehedihussain@gmail.com** with:

- what the problem is and what an attacker could do with it,
- the steps to reproduce it,
- the Cherry version (`cherry --version`) and your OS.

You will get a reply within a few days. Once a fix is released, you will be credited unless
you ask not to be.

## Scope

Cherry runs on `127.0.0.1` and drives the local `claude` CLI. In scope: anything that lets a
web page, another local user or Claude itself get past the login, the approval step, the path
guard or the secret-file rules. The design is in [`docs/security.md`](docs/security.md).
