# Fix This: The Proseus Bible

Everything SillyTavern got wrong, everything TavernStudio learned, and every decision Proseus must get right from day one.

This is not a feature list. This is a contract with the codebase.

---

## Part I: What We're Fixing

### 1. The God File Problem

SillyTavern ships a single `script.js` at 11,767 lines with 52 exported mutable globals. Any file can import `chat`, `characters`, `this_chid` and mutate them freely. There are no guards, no subscriptions, no immutability. The state management strategy is "shared mutable variables and hope."

**Proseus rule:** No file exports mutable state. All state lives in typed stores (Zustand for local/UI, TanStack Query for server). Every state change flows through a defined mutation path. If you can't trace who changed what and when, the architecture is broken.

### 2. The 701KB HTML File

SillyTavern's `index.html` is 7,879 lines. Every dialog, popup, settings panel, and UI widget lives in one static HTML file, hidden with `display: none` and toggled with jQuery. Adding a new settings tab means finding line ~4000 and inserting HTML between 50 other hidden panels.

**Proseus rule:** Zero static HTML beyond a root `<div>`. Every piece of UI is a React component with a single responsibility. Components compose; they don't hide/show from a monolith. The entire application shell should be under 20 lines of HTML.

### 3. The jQuery Tax

573 jQuery selector calls in `script.js` alone. Each `$('.selector')` is a full DOM tree traversal, uncached, running in hot paths. Loading 500 characters means 500 `.append()` calls, each triggering a browser reflow. The avatar click handler is 150 lines that registers 6 global event listeners, performs 5+ DOM queries, and mutates the DOM 7+ times in sequence.

**Proseus rule:** Zero direct DOM manipulation outside of refs. React owns the DOM. Updates are batched through the virtual DOM reconciler. Components subscribe to exactly the state they need and re-render surgically. If a component re-renders and nothing it displays has changed, that's a bug.

### 4. The Flat File "Database"

SillyTavern stores everything as JSON/JSONL files on disk. Characters are individual files. Chats are JSONL files. No indexes, no transactions, no ACID guarantees. Want to search across chats? Read every file. The character loader breaks at 12,000 files (GitHub #3608). A character import can OOM the Node.js process (GitHub #3825). Startup takes 20 seconds on a Raspberry Pi because every thumbnail is a filesystem read (GitHub #5071).

**Proseus rule:** SQLite with WAL mode is the database. Period. Prepared statements for every query. Indexes on every column that gets filtered or sorted. Blob storage in the DB for avatars and images (no filesystem sprawl). If a query takes more than 10ms on 10,000 records, optimize it before shipping.

### 5. The Streaming DOM Thrash

SillyTavern re-renders the message DOM on every streaming chunk. Generation is measurably slower when the tab is visible (GitHub #53) because the browser can't keep up with both rendering and receiving tokens simultaneously. Users report the UI "gets slower and slower" as messages accumulate because every message is a real DOM node with no virtualization.

**Proseus rule:** Streaming content lives outside React state. Chunks accumulate in a ref buffer and flush to the DOM via `requestAnimationFrame` coalescing. Zero React re-renders during streaming. The message list is virtualized -- only visible messages exist in the DOM. 10,000 messages should scroll as smoothly as 10.

### 6. The Dependency Graveyard

SillyTavern has 90+ npm dependencies, including `body-parser` (built into Express since 2017), `node-fetch` (Node has native fetch since v18), `lodash` (native array methods exist), and `moment` (which tells you on its own website to stop using it). The server runs Express 4, released in 2014.

**Proseus rule:** Minimize dependencies ruthlessly. Use the platform. Bun has native SQLite, native fetch, native WebSocket, native TypeScript execution. Hono is the only server framework. React + ReactDOM are the only UI framework. Every dependency must justify its existence. If Bun or the browser provides it natively, use the native version.

### 7. The RossAscends Problem

SillyTavern has a file called `RossAscends-mods.js`. Files are organized by who wrote them, not what they do. The `power-user.js` file at 4,550 lines is a junk drawer. `openai.js` at 6,739 lines handles one provider in a file longer than some entire applications.

**Proseus rule:** Files are organized by domain, not author. Every file has a single, obvious reason to exist. No file exceeds 500 lines without a very good reason (pure data schemas are the exception). The directory structure communicates architecture at a glance.

### 8. The Swipe/Branch Confusion

SillyTavern has two completely different concepts -- "swipes" (alternate responses stored as an array on a message) and "branches" (alternate conversation paths stored as separate files linked by filename strings). They're both "what if the conversation went differently" but handled with entirely different data models, UIs, and code paths. Users conflate them constantly because the UX doesn't clarify the distinction.

**Proseus rule:** Swipes are branches. A "swipe" is a sibling node with the same parent. One data model, one UI, one set of operations. The message tree is the single source of truth. Branching from any message at any depth is a first-class operation, not a bolted-on feature.

### 9. The Settings Labyrinth

SillyTavern has 8 unlabeled icons in the top bar, two separate hamburger menus, settings scattered across sidebars containing tabs containing collapsible sections containing duplicated settings. The "Advanced Formatting" panel mixes genuinely useful knobs with a decade of legacy options. Users report confusion about what controls what (Reddit: "Are there any future plans to modernize the UI?").

**Proseus rule:** Every icon has a label or is inside a clearly labeled group. One settings location, not two hamburger menus. Progressive disclosure: simple defaults visible, advanced options discoverable but not mandatory. If a setting exists only because SillyTavern supports 12 incompatible backends, it's legacy crap and we don't ship it.

### 10. The Missing Information

SillyTavern's chat UI doesn't communicate: branch existence, token count, model info, generation status, whether a message was edited, or whether branches exist at a given message. The "2/2" swipe indicator is cryptic. Timestamps show the full date on every message even when they're seconds apart.

**Proseus rule:** The UI communicates state. Branch indicators show "3 branches here" at a glance. Token count / context usage is always accessible. The model that generated a response is visible. Streaming shows a clear generation indicator. Timestamps are smart (relative time, grouped by date, hidden when redundant). Edited messages are marked.

---

## Part II: What TavernStudio Got Right

These decisions from TavernStudio are carried forward without debate.

### Architecture

- **Bun + Hono server.** Native SQLite bindings, native TypeScript, <100ms startup. No transpile step, no middleware bloat.
- **React 19 + Zustand + TanStack Query.** Two-layer state: server state through TanStack Query (cached, deduplicated, background-refreshed), local UI state through Zustand (instant, no network). Components subscribe to exactly what they need.
- **SQLite with WAL mode.** Prepared statement cache, indexes on everything, 256MB mmap. Queries return in microseconds, not seconds.
- **Full TypeScript.** No `any` casting. API responses typed. Database rows typed. If it compiles, it works.

### Message Tree (Index-Based)

- Messages stored as `Map<id, ChatNode>`, not arrays.
- Each node has `parent_id`, `child_ids`, `active_child_index`.
- Active path computed by following `active_child_index` from root to leaf.
- Branch switching walks up from target leaf, updating only ancestors that changed.
- Swipes and branches are the same thing: sibling nodes.
- O(1) sibling swap. O(depth-to-divergence) deep branch switch. Never O(n).

### Streaming

- Content lives in a ref buffer, outside React state.
- Chunks batched and flushed once per `requestAnimationFrame`.
- Zero re-renders during streaming.
- Streaming session machine handles the full lifecycle: start, append, finalize, cancel.
- Finalize persists to DB and swaps the ethereal placeholder for a persistent message.

### Character Cards

- Full SillyTavern ecosystem compatibility: PNG with `chara`/`ccv3` tEXt chunks, raw JSON.
- Lossless round-trip: unknown fields survive import, edit, export.
- SHA-256 deduplication.
- Avatar blobs stored in SQLite with cache headers.

### Design Customization (1,600+ lines of schema)

- Schema-driven UI generation: add a new setting by adding to the schema, not writing components.
- Per-speaker style overrides.
- Custom font uploads.
- Full typography, layout, avatar, actions, branch indicator, timestamp, animation, markdown, composer, and background configuration.
- Design templates: save/load entire configurations.
- Custom CSS injection with documented CSS custom properties.

### Prompt Engineering

- Visual, draggable prompt layout with named slots.
- Each slot has role, content, enabled/disabled, priority.
- Drag to reorder. Toggle to enable/disable. Preview shows exactly what the LLM sees.
- Token estimates per slot.
- SillyTavern Advanced Formatting import support.

---

## Part III: What TavernStudio Didn't Finish

These are the gaps that Proseus must close.

### End-to-End Flow

TavernStudio proved streaming in demo mode but never fully wired the production loop: user sends message -> prompt factory assembles context -> AI provider streams response -> finalize persists to DB. Proseus must have this working before anything else.

### Chat Gallery

TavernStudio's CurrentGoal.md laid out what a good chat gallery looks like: search by title/character/persona/tags/date/model/content, sort by updated/created/character/pinned/message count, management (rename/duplicate/archive/delete/pin). The gallery should feel like "messages app meets file explorer." This was designed but not built.

### Connections and Model Picker

The AI provider abstraction was built (registry, auth strategies, PKCE, encrypted secrets) but the frontend was a debug panel. Users need:

- A real connections UI with status indicators.
- A model picker with fuzzy search, filtering by provider/context/pricing, favorites.
- Live model list fetching (no caching -- providers release models constantly).
- Clear "selected model" display in the chat header.

### Personas

Designed but not fully implemented. Persona = image + name + prompt. Selectable per chat. Optionally overridable per chat. A toggle to make a persona global across profiles.

### Group Chat

MVP designed: chat has multiple speakers, user picks "speaking as" and "responding as." Modes: round-robin (each character generates in order) and user-selection (user picks who responds each time). Full auto-generation deferred.

### Lorebooks / World Info

Explicitly deferred in TavernStudio. Proseus must build this eventually, but it's complex enough to deserve its own design phase. Don't bolt it on.

### Virtual Scrolling

TavernStudio documented the plan (`@tanstack/react-virtual`, intersection observer for lazy images, web worker for heavy tree traversal) but didn't implement it. Proseus needs this from the start -- it's the difference between "works with 100 messages" and "works with 10,000."

### Tree Visualization

A React component showing the full conversation tree: click to navigate, minimap for large trees, active path highlighted. Designed in the MessageTree doc but never built.

---

## Part IV: What Proseus Adds

Beyond fixing SillyTavern's problems and finishing TavernStudio's work, Proseus raises the bar.

### UX Principles

1. **Colocate controls with context.** Swipe arrows live ON the message, not at the bottom of the screen. Branch indicators live ON the node, not in a separate panel. Actions appear where the content is.

2. **Progressive disclosure without hiding.** Simple defaults visible. Advanced options one click away, not buried in nested tabs. A new user should be able to start chatting in under a minute. A power user should be able to tune every parameter.

3. **Smart defaults, not dumb walls of settings.** Auto-select tokenizer by model. Auto-format prompts by provider. Don't present knobs that do nothing for the current configuration. If a setting only matters for text completion APIs and you're using chat completion, hide it.

4. **Keyboard-first, mouse-friendly.** Every action reachable via keyboard. Navigation shortcuts for branch switching, message editing, chat selection. But never require the keyboard -- mouse/touch should work naturally.

5. **Responsive by design, not by accident.** The UI adapts to screen size. Sidebar collapses on narrow screens. Touch targets are appropriately sized. This isn't a mobile app, but it should work on a tablet.

### DX Principles

1. **Clear separation of concerns.** Server routes don't import React. React doesn't import SQLite. The API layer is the boundary. Either side could be swapped without touching the other.

2. **Schema-driven everything.** Design config, prompt slots, provider definitions, settings -- all driven by typed schemas. Adding a new setting means adding to a schema, not writing UI code.

3. **Small files, clear names.** No 12,000-line scripts. No `power-user.ts`. No `RossAscends-mods.ts`. Files named by what they do, organized by domain.

4. **Tests that matter.** Database operations, prompt assembly, tree traversal, API contracts. Don't test that React renders a div. Test that branching from message 500 in a 1000-message tree produces the correct active path.

5. **One command to run.** `bun run dev` starts everything. No "run the server in one terminal and the client in another." HMR for the frontend, hot reload for the server.

### Performance Targets

| Operation | Target | How |
|-----------|--------|-----|
| Cold start | <200ms | Bun native, minimal deps |
| Load 10,000 characters | <500ms | Indexed SQLite query, not filesystem scan |
| Load chat with 10,000 messages | <100ms | Prepared statement, return only active path |
| Stream 1,000 tokens | 0 React re-renders | Ref buffer + rAF coalescing |
| Branch switch (deep) | <16ms (one frame) | In-memory index update, no I/O |
| Swipe between siblings | <1ms | Single parent index update |
| Search across all chats | <200ms | SQLite FTS5 full-text search |
| Idle memory (1,000 msg chat) | <50MB | Virtualized list, surgical subscriptions |

### Technology Choices (Non-Negotiable)

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Runtime | Bun | Native TS, native SQLite, native fetch, fast startup |
| Server | Hono | Lightweight, typed, tree-shakeable, middleware-friendly |
| Database | bun:sqlite | WAL mode, prepared statements, zero dependency |
| Frontend | React 19 | Batched updates, component model, ecosystem |
| Server state | TanStack Query | Dedup, caching, background refresh, optimistic updates |
| Local state | Zustand | Minimal, surgical subscriptions, no boilerplate |
| Styling | Tailwind v4 | Utility-first, no runtime, JIT compiled |
| Validation | Zod | Runtime type checking for API boundaries |
| AI SDK | Vercel AI SDK | Multi-provider streaming with unified interface |

---

## Part V: Build Order

Priority is end-to-end functionality first, polish second.

### Phase 0: Foundation (Current)
- [x] Bun + Hono + React + SQLite skeleton
- [ ] Project structure: `src/client/`, `src/server/`, `src/shared/`
- [ ] Shared type definitions (ChatNode, Character, Persona, etc.)
- [ ] Database schema with proper migrations (not column-existence checks)
- [ ] API client with typed endpoints

### Phase 1: Chat Core
- [ ] Message tree data model (Map-based, index-based branching)
- [ ] CRUD for chats, messages, speakers
- [ ] Active path computation and rendering
- [ ] Branch creation, switching, deletion
- [ ] Virtualized message list
- [ ] Message grouping (collapse consecutive same-speaker)
- [ ] Basic message display (no markdown yet)

### Phase 2: Streaming End-to-End
- [ ] AI provider registry (OpenRouter first)
- [ ] Connection management UI
- [ ] Model picker with live fetching
- [ ] Prompt factory v1 (assemble context from chat history + character + persona)
- [ ] Streaming session machine (start, append, finalize, cancel)
- [ ] Ref-based streaming with frame coalescing
- [ ] Composer: send triggers generation, cancel stops it
- [ ] Stop + keep partial output behavior

### Phase 3: Character System
- [ ] Character card import (PNG chara/ccv3, JSON)
- [ ] Character card export (lossless round-trip)
- [ ] Character gallery with search/filter/sort
- [ ] Character editor
- [ ] Avatar handling (blob storage, SHA-256 dedup, cache headers)
- [ ] Token counting per character

### Phase 4: Prompt Engineering
- [ ] Prompt slot system (named, ordered, toggleable)
- [ ] Drag-and-drop reordering
- [ ] Prompt preview (shows exactly what the LLM sees)
- [ ] Token estimates per slot
- [ ] SillyTavern Advanced Formatting import
- [ ] Per-provider prompt adaptation

### Phase 5: Design System
- [ ] Schema-driven design config (typography, layout, avatars, etc.)
- [ ] Design settings panel with live preview
- [ ] Per-speaker style overrides
- [ ] Custom font uploads
- [ ] Design templates (save/load)
- [ ] Custom CSS injection with documented properties
- [ ] Markdown rendering with streaming support
- [ ] Code syntax highlighting (lazy-loaded per language)

### Phase 6: Chat Gallery and Management
- [ ] Chat gallery with search (title, character, persona, tags, date, content)
- [ ] Sorting (updated, created, character, pinned, message count)
- [ ] Chat management (rename, duplicate, archive, delete, pin)
- [ ] Chat metadata display (model, provider, message count, last active)
- [ ] Bulk operations

### Phase 7: Personas and Profiles
- [ ] Persona CRUD (image, name, prompt)
- [ ] Per-chat persona selection and override
- [ ] Global vs profile-scoped personas
- [ ] Profile management (multiple AI configs per profile)

### Phase 8: Group Chat
- [ ] Multiple speakers per chat
- [ ] "Speaking as" / "Responding as" selection
- [ ] Round-robin mode
- [ ] User-selection mode

### Phase 9: Advanced Features
- [ ] Tree visualization component with minimap
- [ ] Full-text search (SQLite FTS5)
- [ ] Encrypted secrets (AES-256-GCM at rest)
- [ ] OAuth PKCE flows for providers
- [ ] AI request logging (cost tracking, latency, token usage)
- [ ] Import/export entire conversations (with tree structure)
- [ ] Keyboard shortcuts system

### Phase 10: Polish and Scale
- [ ] Lorebooks / World Info (needs its own design phase)
- [ ] Extension/plugin system (maybe -- evaluate carefully)
- [ ] Accessibility audit
- [ ] Performance profiling and optimization pass
- [ ] Documentation

---

## Part VI: Anti-Patterns (Do Not Repeat)

These are patterns from SillyTavern that must never appear in Proseus.

| Anti-Pattern | Example | Rule |
|---|---|---|
| Mutable exported state | `export let chat = []` | All state in stores, never exported mutably |
| God files | `script.js` at 11,767 lines | No file over 500 lines without justification |
| Files named after authors | `RossAscends-mods.js` | Files named by domain and responsibility |
| Flat file storage | JSON/JSONL on disk | SQLite for everything |
| jQuery DOM manipulation | `$('.selector').append()` | React owns the DOM |
| Global event listeners | 6 listeners on one click handler | Scoped component handlers |
| Monolithic HTML | 7,879-line `index.html` | Components compose from root `<div>` |
| Obsolete dependencies | `moment`, `lodash`, `node-fetch`, `body-parser` | Use platform natives |
| Dual concepts for same thing | Swipes vs branches | One model: sibling nodes |
| Settings scattered everywhere | Two hamburger menus, nested tabs | One settings location, progressive disclosure |
| No type safety | JSDoc at best, `this_chid` untyped | Full TypeScript, no `any` |
| Uncached selectors in hot paths | `$('#chat')` per render | Cached refs, memoized selectors |
| Full file rewrite on save | O(n) JSONL rewrite | Incremental SQLite updates |
| No virtualization | Every message is a DOM node | Virtual scrolling from day one |
| Re-render per stream chunk | DOM update per token | Ref buffer + rAF coalescing |

---

## Closing

SillyTavern proved the demand. TavernStudio proved the architecture. Proseus ships the product.

The competition isn't SillyTavern's feature count. It's the experience of using those features. A fast, beautiful, deeply customizable AI roleplay interface that respects your machine, your data, and your time.

Build it right. Build it once. Make them switch.
