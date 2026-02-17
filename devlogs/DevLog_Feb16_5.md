# DevLog — February 16th, 2026, Session 5

---

## ~01:00 — Character card import and decoupled generation

The first real "feature" session. Everything prior was infrastructure — message trees, streaming plumbing, markdown rendering, smooth reveal. This session adds character card import (the core user-facing feature of any SillyTavern replacement), server-side prompt assembly, and a decoupled generation architecture that separates message creation from AI invocation. 2,848 lines of new code across 8 new files, 850 net lines changed across 17 existing files, 24 new tests.

### Character card parser

The character card spec has three versions in the wild. V1 is flat JSON (`name`, `description`, `first_mes`, etc.). V2 wraps everything under a `data` object with `spec: "chara_card_v2"` and adds fields like `system_prompt`, `post_history_instructions`, `character_book`, and `extensions`. V3 builds on V2 with group greetings, assets, and creator metadata that we don't need yet but must not destroy.

The parser (`src/server/lib/character-card-parser.ts`, 348 lines) handles all three in a single pipeline. PNG files use the tEXt chunk approach: scan for `ccv3` keyword first (V3 cards), fall back to `chara` (V1/V2), base64-decode the chunk data, parse as JSON. The detection logic looks at `spec` and `spec_version` fields to determine the version, then normalizes everything into the internal `Character` type.

V3 support follows a deliberate degradation strategy: read without crashing, extract all V2-compatible fields normally, and store the full original V3 payload in `extensions["proseus/original_v3"]`. This means the card can be re-exported losslessly in the future without implementing V3-specific features now. The `extensions` field is preserved losslessly throughout — unknown keys are never stripped, which matters because community tooling stuffs all sorts of metadata in there.

`png-chunks-extract` and `png-chunk-text` are CommonJS modules that handle the actual PNG chunk extraction. The `encode` function on `png-chunk-text` takes two positional args `(keyword, content)`, not an object — a quirk worth noting since the TypeScript types don't make this obvious.

### Character storage and dedup

Characters live in a dedicated SQLite table (22 columns, added to `src/server/db/schema.ts`). Avatars are stored as BLOBs directly in the database — no filesystem. The full original PNG is preserved for future re-export. Each character gets a `content_hash` (SHA-256 of `name + description + first_mes + system_prompt + post_history_instructions`) with a UNIQUE index for dedup, and an `avatar_hash` (SHA-256 of the raw PNG bytes) for ETag-based caching on the avatar endpoint. Hashing uses `Bun.CryptoHasher`, the correct Bun-native API.

The DB service (`src/server/db/characters.ts`, 362 lines) provides full CRUD. The `create` function checks the content hash first — if a duplicate exists, it returns `{ status: "duplicate", existing }` so the API layer can offer the user a choice. The `force` flag bypasses dedup by deleting the existing record first, which cascades properly because `character_id` is a nullable FK on `chats` and `speakers`.

The `chats` and `speakers` tables both gained a `character_id` column via ALTER TABLE with try/catch (no migration system exists). This links chats and speakers to their source character. Speaker reuse is enforced: when creating a chat from a character, the API first checks for an existing speaker with that `character_id` and reuses it. One speaker per character, shared across all chats — no duplicate avatar blobs per chat.

### API routes

`src/server/routes/characters.ts` (330 lines) exposes seven endpoints:

- `POST /import` — Multipart file upload. Accepts PNG and JSON files. Returns the parsed character with `status: "created"` or `status: "duplicate"`.
- `POST /import-url` — URL import (Chub AI format). Fetches with 15-second timeout, follows the same parsing pipeline.
- `GET /` — List all characters. Returns `CharacterListItem[]` (lightweight, excludes avatar BLOB). Sorted by creation date descending.
- `GET /:id` — Full character detail including all fields.
- `GET /:id/avatar` — Serve avatar PNG with `Content-Type: image/png`, `ETag` from avatar_hash, and `304 Not Modified` support.
- `POST /:id/chat` — Create a new chat from a character. Reuses existing speaker if one exists for this character, otherwise creates a new speaker with the character's name and avatar. Inserts the character's `first_mes` as the first bot message. Returns the chat ID.
- `DELETE /:id` — Delete character and all associated data.

A `GET /api/speakers/:id/avatar` route was also added to `speakers.ts` for rendering speaker avatars in the message list.

### Server-side prompt assembly

`src/server/services/chat-pipeline.ts` (156 lines) is a pure function that reads from the DB and returns a `PromptMessage[]` array. It follows the SillyTavern prompt template:

1. **System message**: Character's `system_prompt` (if any), followed by the character card block (description, personality as `Personality: ...`, scenario as `Scenario: ...`), joined with double newlines.
2. **Chat history**: Active path through the message tree, mapped to `user`/`assistant` roles based on `is_bot`. Empty messages are skipped.
3. **Post-history instructions**: Character's `post_history_instructions` injected as a final system message after all history — the "jailbreak" or "UJB" slot in SillyTavern terminology.

The function returns `{ messages, characterName, modelOverride }` — the model override is a future hook for per-character model preferences. `StreamManager.startAIStream()` now calls `assemblePrompt()` instead of building a flat history inline, which means every generation — whether triggered by user message, regenerate, or continue — gets proper character context.

### Decoupled generation

The prior architecture coupled message creation and AI generation: when the user sent a message, the client assembled a `start_stream` request with `parentId`, `speakerId`, and the model. This meant the client needed to know the chat topology and speaker assignments, and generation could only happen as an immediate response to a user message.

The new architecture separates these two actions. A `generate` message type was added to `ws-types.ts` with just `{ chatId, model, nodeId }`. The server's `StreamManager.startGeneration()` method (line 106) resolves everything from DB state: `parentId` is the leaf of the active path (via `getActivePath`), `speakerId` is the first non-user speaker in the chat (SQL join on `chat_speakers`/`speakers`). Then it delegates to the existing `startAIStream()`.

The client still triggers generation immediately after sending a message — `Composer.tsx` calls `mutateAsync().then(() => sendGenerate(model))` — but the generation trigger is now a standalone operation. This is the foundation for regenerate, continue, and branch-and-generate features.

### The `mutateAsync` fix

TanStack Query v5 has a subtle behavior: when a `useMutation` definition has its own `onSuccess` handler, inline `onSuccess` callbacks passed to `mutate()` are silently ignored. The `addMessage` mutation in `useMutations.ts` had `onSuccess: invalidateTree`, which meant `mutate(data, { onSuccess: () => sendGenerate() })` never fired the generation callback. The fix: use `mutateAsync().then()` instead, which returns a proper Promise regardless of mutation-level handlers.

### App-wide singleton WebSocket

The previous `useStreamSocket` created a new WebSocket every time `chatId` changed. React's `useEffect` runs after paint, so there's a window where `wsRef.current` is null between cleanup and re-creation. Any `sendGenerate` call in that window — which happens via a `.then()` microtask — silently fails.

The rewrite (`src/client/hooks/useStreamSocket.ts`, 372 lines) uses two separate effects. The connection effect has `[qc]` dependencies and creates exactly ONE WebSocket on mount. The subscription effect has `[chatId]` dependencies and sends lightweight `subscribe`/`unsubscribe` messages to tell the server which chat's events to forward. `chatIdRef`, `storeStartRef`, and `storeStopRef` ensure the message handler reads current values without being in the dependency array — no reconnections from store function identity changes.

### UI

`CharacterSidebar.tsx` (578 lines) provides file picker, drag-and-drop import (with visual drop zone), URL import (text input), and a character list with avatar thumbnails. Duplicate detection shows the existing character's name and an "Import Anyway" button that re-imports with `force: true`. Character cards display name, creator, and tag count. Clicking a character opens a detail panel; the "Start Chat" button creates a chat and navigates to it.

`App.tsx` was restructured from a flat single-chat view to a sidebar layout. The sidebar has Characters/Chats toggle tabs. The Chats tab shows all existing chats with their character names and creation timestamps, plus navigation. Empty states guide the user to import a character or start a chat.

`MessageItem.tsx` now renders speaker avatars via `<img src="/api/speakers/:id/avatar">` when a speaker has an avatar URL. `StreamDebug.tsx` was simplified from a full debug panel to just an API key + model settings panel (Ctrl+Shift+S).

### What got done

- **Character card parser**: `src/server/lib/character-card-parser.ts` (348 lines) — PNG tEXt chunk extraction, base64 decode, V1/V2/V3 detection and normalization, custom `CardParseError` class, lossless V3 degradation via `extensions["proseus/original_v3"]`
- **Character types**: `Character`, `CharacterListItem`, `CharacterBook`, `CharacterBookEntry` in `src/shared/types.ts` — 71 new lines of shared type definitions
- **Character DB table**: 22-column `characters` table in `schema.ts` — avatar BLOB, avatar_hash (SHA-256 for ETag), content_hash (SHA-256 dedup, UNIQUE index), source_spec, full extensions JSON
- **Character DB service**: `src/server/db/characters.ts` (362 lines) — create with dedup + force override, get, list (excludes BLOB), delete, update, avatar hash via `Bun.CryptoHasher`
- **Character API routes**: `src/server/routes/characters.ts` (330 lines) — 7 endpoints: import file, import URL, list, detail, avatar (ETag + 304), create chat, delete
- **Speaker avatar route**: `GET /api/speakers/:id/avatar` in `speakers.ts` — serve speaker avatar PNG with Content-Type header
- **Chat pipeline**: `src/server/services/chat-pipeline.ts` (156 lines) — pure-function prompt assembly: system_prompt + card block + history + post_history_instructions
- **Decoupled generation**: `generate` WS message type in `ws-types.ts`, `StreamManager.startGeneration()` resolves parentId/speakerId from DB, `ws.ts` handler dispatches
- **Singleton WebSocket**: `useStreamSocket.ts` rewritten (372 lines) — one WS per app, subscribe/unsubscribe on chat switch, ref-based handler to avoid dependency churn
- **TanStack Query fix**: `Composer.tsx` uses `mutateAsync().then()` instead of `mutate(data, { onSuccess })` — fixes silent callback swallowing
- **Client API + hooks**: `api.characters.*` methods in `client.ts`, `useCharacters`/`useImportCharacter`/`useCreateChatFromCharacter`/`useDeleteCharacter` in `useCharacters.ts` (62 lines)
- **Character sidebar UI**: `CharacterSidebar.tsx` (578 lines) — file picker, drag-and-drop, URL import, dedup UI with "Import Anyway", character list with avatars, detail panel
- **App layout restructure**: `App.tsx` — sidebar with Characters/Chats tabs, chat navigation, empty states
- **Avatar rendering**: `MessageItem.tsx` renders `<img>` for speakers with avatars
- **StreamDebug simplification**: Reduced to API key + model settings panel
- **Schema additions**: `character_id` FK on `chats` and `speakers` tables via ALTER TABLE
- **24 new tests**: V1/V2/V3 JSON parsing, PNG extraction, DB CRUD, dedup, force override, extensions losslessness — 138 total tests, 381 expect() calls, 0 failures

### Notes

Character card import is the feature that separates a toy from a tool. Without it, Proseus is a generic chat UI with a tree. With it, it's a SillyTavern replacement — you can take any card from Chub or another source, drop it in, and start chatting with proper character context in the system prompt.

The decoupled generation architecture is a deliberate investment that pays dividends immediately. By making `generate` a standalone server action that resolves its own context from DB state, every future generation-related feature (regenerate, continue, branch-and-generate, auto-generate on swipe) becomes a one-liner on the client: send `{ chatId, model, nodeId }` and the server figures out the rest. The client never needs to know the active path or the bot speaker — those are server concerns.

The singleton WebSocket fix addresses a class of bugs that would have been recurring. Any architecture that tears down and recreates WebSockets on React state changes is fighting React's lifecycle model. Effects run after paint, cleanup races with re-creation, and ref windows create silent failures that are nearly impossible to debug. The correct answer is: one connection, lifetime of the app, lightweight protocol messages for switching context.

Next steps: manual testing with real character cards from Chub, stress-testing the avatar pipeline with large PNGs, and adding the character editor for tweaking imported cards before chatting.
