# Contributing to Proseus

Thanks for contributing.

This project aims to stay maintainable, reliable, readable, and stable. Proseus is intentionally scoped as a local-first, single-user app, so contributions should strengthen that direction rather than expand it into a multi-user platform.

## Before You Start

- Keep changes focused and easy to review.
- For larger feature work or scope changes, open a discussion or issue first so the direction is clear before implementation.
- If your change affects user behavior, docs, data handling, or network exposure, update the relevant documentation in the same pull request.

## Local Setup

### Requirements

- [Bun](https://bun.sh)

### Install dependencies

```bash
bun install
```

### Run the app

```bash
bun run dev
```

The local app starts at `http://localhost:8075`.

Production-style local run:

```bash
bun run start
```

LAN mode is available when explicitly requested:

```bash
bun run dev:lan
# or
bun run start:lan
```

## Quality Checks

Run the full check suite before opening a pull request:

```bash
bun run typecheck
bun test
bun run preflight
```

## Contribution Guidelines

- Prefer simple, explicit code over clever abstractions.
- Preserve local-first and single-user assumptions unless a scope change has been discussed in advance.
- Avoid introducing hidden state, surprising network behavior, or unclear data ownership.
- Add or update tests when changing behavior.
- Keep docs aligned with the product as it actually works.
- Avoid drive-by refactors in unrelated areas.

## Pull Requests

When opening a pull request:

- Describe the user-visible behavior change clearly.
- Call out any data model, storage, networking, or security implications.
- Include screenshots or recordings for UI changes when helpful.
- Mention any follow-up work that is intentionally out of scope.

## Scope Notes

Contributions that reinforce the existing product shape are much more likely to fit well than changes that broaden the mission without prior discussion.
