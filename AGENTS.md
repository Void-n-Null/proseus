# Proseus

Local-first AI chat/roleplay application built with Bun, Hono, React, and SQLite.

## Cursor Cloud specific instructions

### Runtime

This project runs exclusively on **Bun** (not Node.js). It uses Bun-specific APIs (`Bun.serve`, `bun:sqlite`, Bun HMR, `bun-plugin-tailwind`). Bun must be installed via `curl -fsSL https://bun.sh/install | bash` and added to `PATH` before any commands will work.

### Key commands

All commands are defined in `package.json`:

- **Dev server**: `bun run dev` — starts on `http://localhost:3000` with hot module reloading
- **Tests**: `bun test` — runs the full test suite (193 tests across 10 files)
- **Type checking**: `bun run typecheck` — runs `bunx tsc --noEmit`

There is no separate lint command configured; type checking via `bun run typecheck` serves as the primary static analysis step.

### Architecture

Single full-stack application — Hono API backend + React SPA frontend served from one Bun process. No external databases or services required; SQLite is embedded via `bun:sqlite` (auto-creates `proseus.db` on first run). An encryption key (`.proseus-key`) is auto-generated on first startup for encrypting API keys at rest.

### Gotchas

- The project has no `README.md`, no ESLint config, and no separate lint script.
- `sharp` (image processing) requires native binaries — `bun install` handles this automatically.
- The `bun.lock` is the canonical lockfile; do not use npm/yarn/pnpm.
- Database file (`proseus.db`) and key file (`.proseus-key`) are created automatically in the workspace root on first run — these are gitignored.
