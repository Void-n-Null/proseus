Proseus is a local-first modern AI chat interface for character cards. It is built to feel fast, flexible, and deeply customizable, with a polished workflow and stack optimized for responsive streaming chat and a focus on user experience. 

It provides easy connection to a large selection of LLM APIs including Anthropic, OpenRouter, OpenAI, and many more.

## Why Proseus

- **Fast, modern foundation**: built with a modern stack including bun and react.
- **Highly optimized chat flow**: server-side stream management, efficient local state, and branch-aware conversations. Proseus avoids common issues with chat interfaces who handle streaming purely on the browser, such as incomplete messages if the browser refreshes mid generation.
- **Deep prompt customization**: tune prompt templates, post-history instructions, assistant prefill, and model selection without fighting the UI.
- Familiar chat ergonomics: customization inspired by the interfaces people already love, without losing clarity or performance.
- Practical interoperability: export chats as Proseus archives, plain text, or SillyTavern-compatible `.jsonl`.

## What Proseus Is

Proseus is meant to be a polished application focused on a great chat experience, strong local ownership, and a UI that feels modern instead of retrofitted. It is designed to be an improvement in the speed and user experience over other applications in the character chat interface space.

Proseus currently focuses on:

- Character card import from PNG or JSON
- Personas and per-chat persona selection
- Configurable prompt templates
- Streaming chat generation over WebSocket
- Branching conversations with alternate message paths
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

Contributor workflow, local development checks, and pull request expectations live in [CONTRIBUTING.md](./CONTRIBUTING.md).