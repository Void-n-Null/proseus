# Proseus

Proseus is a modern AI chat app for character cards, personas, prompt control, and branching conversations. It is built to feel fast, flexible, and deeply customizable, with a polished local-first workflow and a stack optimized for responsive streaming chat.

## Why Proseus

- Fast, modern foundation: built with Bun, React 19, Hono, TanStack Query, Tailwind 4, and WebSocket streaming.
- Highly optimized chat flow: responsive streaming, efficient local state, and branch-aware conversations that stay smooth as chats evolve.
- Character-first design: import character cards, assign personas, and keep long-running conversations organized around the people you actually chat with.
- Deep prompt customization: tune prompt templates, post-history instructions, assistant prefill, and model selection without fighting the UI.
- Familiar chat ergonomics: customization inspired by the interfaces people already love, without losing clarity or performance.
- Practical interoperability: export chats as Proseus archives, plain text, or SillyTavern-compatible `.jsonl`.

## What Proseus Is

`v1.0` is meant to be a polished release focused on a great chat experience, strong local ownership, and a UI that feels modern instead of retrofitted.

Proseus currently focuses on:

- Character card import from PNG or JSON
- Personas and per-chat persona selection
- Configurable prompt templates
- Streaming chat generation over WebSocket
- Branching conversations with alternate message paths
- Model connections for `OpenRouter`, `Anthropic`, `OpenAI`, `Gemini`, and `xAI`
- UI customization and chat workflows inspired by popular roleplay and power-user chat tools
- Local export and backup workflows

## Quick Start

### Requirements

- [Bun](https://bun.sh)

### Run in development

```bash
bun install
bun run dev
```

Proseus starts at [http://localhost:8075](http://localhost:8075).

### Run in production-style local mode

```bash
bun run start
```

### Enable LAN access

LAN binding is opt-in.

```bash
bun run dev:lan
# or
bun run start:lan
```

## First-Run Flow

1. Open the model dashboard and connect at least one provider.
2. Choose a model for generation.
3. Import a PNG or JSON character card from the Characters sidebar, or create your own setup manually.
4. Optionally create or select a persona for the chat.
5. Start chatting, branch when needed, and export a backup when you want one.

## Core Concepts

### Character cards

Proseus is built around character-driven chats. You can import standard character card assets and use them as the basis for persistent conversations, alternate greetings, and prompt composition.

### Personas

Personas let you define the user side of the conversation instead of treating every chat as the same generic speaker. They can be reused across chats and swapped per conversation.

### Prompt templates

Prompt assembly is configurable rather than hidden. Proseus exposes the main prompt structure, character fields, persona content, post-history instructions, and assistant prefill so you can tune behavior without rewriting the whole stack.

### Branching conversations

Chats are stored as trees, not just flat logs. That makes it possible to regenerate messages, preserve alternate outcomes, and move through conversation branches without losing prior paths.

### Interface customization

Proseus aims for the best parts of popular chat interfaces: fast navigation, clear chat structure, flexible workflows, and room to shape the experience around how you actually write, roleplay, and iterate.

## Data Storage And Security

By default, Proseus stores its local state in the app directory:

- Database: `proseus.db`
- Encryption key: `.proseus-key`

To move both into a dedicated data directory, set `PROSEUS_DATA_DIR`:

```bash
PROSEUS_DATA_DIR=/path/to/proseus-data bun run start
```

Provider API keys are encrypted at rest. The database and the key file are both required to decrypt stored credentials, so both should be treated as sensitive local data.

## Backups And Export

For a full local backup, keep these together:

- `proseus.db`
- `.proseus-key`

If you restore the database without the matching key file, stored provider credentials will no longer decrypt.

For chat-level export, Proseus supports:

- Proseus archive: `.chat`
- SillyTavern-compatible transcript: `.jsonl`
- Plain text transcript: `.txt`

## Docker

Build and run:

```bash
docker build -t proseus .
docker run --rm -p 8075:8075 -v "$(pwd)/proseus-data:/app/data" proseus
```

The container stores persistent data in `/app/data` using `PROSEUS_DATA_DIR=/app/data`.

The image starts with LAN binding enabled so published ports are reachable from the host.

## Network Safety

`--lan` binds Proseus to `0.0.0.0` so other devices on your network can reach it. This release does not include a user authentication system. Only enable LAN mode on networks you trust.

## Troubleshooting

### Provider keys appear missing or stop decrypting

- Make sure you did not move the database without the matching `.proseus-key`.
- Make sure `PROSEUS_DATA_DIR` still points to the same directory you used previously.

### Another device cannot connect in LAN mode

- Confirm you started Proseus with `--lan`.
- Confirm your firewall allows inbound traffic on port `8075`.

### The app opens but generation fails

- Make sure at least one provider is connected.
- Make sure a model is selected.
- Reconnect the provider if the remote API key has been revoked or rotated.

## Contributing

Contributor workflow, local development checks, and pull request expectations live in [`CONTRIBUTING.md`](./CONTRIBUTING.md).
