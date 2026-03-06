# Proseus

Proseus is a local-first AI chat app for character cards and branching conversations. You bring your own model provider keys, your chats stay in a local SQLite database, and the app is optimized around single-user ownership rather than hosted accounts.

## What v1.0 is

`v1.0` is meant to be a polished local/self-hosted release for one person on one machine or a trusted home network.

- Local-first, single-user, and localhost-first by default
- Character card import, personas, prompt templates, model selection, streaming chat, and export
- Built for running on your machine, not for multi-user hosted SaaS

## What v1.0 is not

- Not a multi-user product
- Not an internet-exposed deployment
- Not a managed hosted service with auth, billing, or shared workspaces

## Requirements

- [Bun](https://bun.sh)

## Run locally

```bash
bun install
bun run dev
```

The app starts at [http://localhost:8075](http://localhost:8075).

Production-style local run:

```bash
bun run start
```

LAN mode is opt-in:

```bash
bun run dev:lan
# or
bun run start:lan
```

## First run

1. Open the model dashboard and connect a provider.
2. Import a PNG or JSON character card from the Characters sidebar.
3. Start a chat.
4. Export a backup when you want one.

## Data and security model

By default, Proseus stores its local state in the app directory:

- Database: `proseus.db`
- Encryption key: `.proseus-key`

You can move both into a dedicated directory by setting `PROSEUS_DATA_DIR`:

```bash
PROSEUS_DATA_DIR=/path/to/proseus-data bun run start
```

API keys are encrypted at rest. The database and the key file are both needed to decrypt stored provider credentials, so treat both as sensitive.

## Backups

For a full local backup, keep both of these together:

- `proseus.db`
- `.proseus-key`

If you restore the database without the matching key file, stored provider API keys will no longer decrypt.

For chat-level backups, use the built-in export options:

- Proseus archive: `.chat`
- SillyTavern-compatible transcript: `.jsonl`
- Plain text transcript: `.txt`

## LAN warning

`--lan` binds Proseus to `0.0.0.0` so other devices on your network can reach it. There is no user-auth system in this release. Only use LAN mode on networks you trust.

## Docker

Build and run:

```bash
docker build -t proseus .
docker run --rm -p 8075:8075 -v "$(pwd)/proseus-data:/app/data" proseus
```

The image stores persistent data in `/app/data` via `PROSEUS_DATA_DIR=/app/data`.
Docker runs with LAN binding enabled so published ports are reachable from the host.

## Quality checks

Run these before shipping changes:

```bash
bun run typecheck
bun test
bun run preflight
```

## Troubleshooting

If provider keys seem to disappear or stop decrypting:

- Make sure you did not move the database without the matching `.proseus-key`
- Make sure `PROSEUS_DATA_DIR` points at the same directory you used previously

If another device cannot connect in LAN mode:

- Confirm you started with `--lan`
- Confirm your firewall allows inbound traffic on port `8075`

If the app opens but generations fail:

- Check that a provider is connected
- Check that a model is selected
- Reconnect the provider if the remote API key has been revoked or rotated
