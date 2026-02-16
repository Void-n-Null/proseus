# DevLog — February 16th, 2026, Session 4

---

## ~23:30 — Cancel saves content, streaming gets smooth

Two bugs with a shared root cause. First: cancelling an AI stream deleted the partial message entirely — perfectly good content thrown away because the cancellation path was conflated with the error path. Second: streaming text appeared in jerky bursts synchronized to WebSocket delivery timing rather than at a steady readable pace. Both stem from the same architectural layer (the streaming buffer and its interaction with the WS protocol) and were fixed in a single session.

### Cancel-as-delete: the root cause

When the virtualization refactor (session 2) replaced `EtherealMessage` with optimistic placeholder nodes in the TanStack Query cache, it introduced `removePlaceholderNode()` as the undo path for `insertPlaceholderNode()`. The `stream:error` handler calls `removePlaceholderNode` — correct for actual errors where the content is garbage. The problem: `cancelStream()` in `StreamManager` (`src/server/services/stream-manager.ts:275`) sent `stream:error` for cancellation too. It aborted the AI request, published `stream:error` with a "Stream cancelled" message, and deleted the accumulated content from memory without ever calling `addMessage()`. The client received `stream:error`, rolled back the placeholder, and the user's partial AI response vanished.

The fix required distinguishing two fundamentally different intents. An error means "something broke, roll back." A cancel means "stop generating and save what we have." These should never share a code path.

### The `stream:cancelled` event

A new `stream:cancelled` variant was added to `ServerWsMessage` in `ws-types.ts` — same shape as `stream:end` (`chatId`, `streamId`, `nodeId`). The server's `cancelStream()` method was rewritten: after aborting the AI SDK request (which stops billing immediately via `AbortController.abort()`), it checks whether any content was accumulated. If yes, it persists the partial content to SQLite via `addMessage()` and publishes `stream:cancelled`. If the buffer is empty (cancelled before any tokens arrived), it publishes `stream:error` as before — there's nothing to save, so rollback is correct.

On the client side, `useStreamSocket.ts`'s message handler gained a fall-through case: `stream:cancelled` falls through to `stream:end`. Both events mean "content is persisted, finalize the client-side session." The handler captures the buffer content via `finalizeSession()`, patches the placeholder node's message in the query cache, calls `storeStop()`, and invalidates queries for background reconciliation. No code duplication — single case block, two entry points.

A distinct event type was chosen over reusing `stream:end` because cancellation is semantically different from completion. The AI SDK abort must happen before persistence — it stops billing. And in the future, the client may want to indicate visually that a message was cut short. Keeping the event types separate preserves that option without protocol changes later.

### Smooth character reveal

WebSocket chunk delivery is bursty. Tokens arrive in irregular batches — sometimes a burst of 20 characters, then a 200ms gap, then another burst. Displaying chunks the instant they arrive produces a jerky, stuttery appearance that makes fast models look broken and slow models look frozen between updates.

The fix is an interpolation buffer in `streaming-buffer.ts` — the same concept used in networked games for smooth entity movement despite irregular update packets. The buffer now maintains two positions: the **truth** (all received content) and the **reveal cursor** (what listeners actually see). Content accumulates into the truth buffer immediately as before. The reveal cursor advances through it at a smooth rate calculated from actual chunk arrival speed.

Rate estimation uses a 2-second sliding window of chunk arrivals. Each time chunks are flushed into the truth buffer, the arrival timestamp and character count are recorded. The rate is `totalChars / timeSpan` across the window, multiplied by 1.15x so the cursor tracks slightly ahead of delivery and doesn't visibly lag. A catch-up mechanism handles burst delivery: if the cursor falls more than 150 characters behind the truth buffer, it closes 20% of the gap per frame in addition to the base rate. This prevents the interpolation buffer from creating noticeable delay during fast bursts while still smoothing out the steady-state delivery.

The reveal loop runs on `requestAnimationFrame` — one frame per ~16ms. Each frame: accumulate any pending chunks into the truth buffer, update the rate estimate, advance the cursor by `rate * dt` characters, and notify listeners with `contentBuffer.substring(0, revealedLength)`. When the cursor catches up to the truth buffer (no new content), `lastRevealTime` is reset to zero so the next chunk arrival doesn't produce a huge time delta.

Three edge cases required explicit handling. `setContent()` (used on WebSocket reconnect to deliver full accumulated content) sets `revealedLength` to the full content length — reconnect content is old, not new generation, and should appear instantly. `finalizeSession()` and `cancelSession()` both reveal all remaining content immediately and notify listeners one final time — the user should never miss buffered text because the session ended. The rate estimate is reset on `setContent()` since reconnect content doesn't represent generation speed.

In non-browser environments (the test suite, where `requestAnimationFrame` is undefined), the module falls back to `setTimeout(16)` with immediate full-content delivery — identical to the old behavior. The `HAS_RAF` flag is checked once at module load. All 16 existing tests pass unchanged because `getContent()` always returns the full truth buffer (not the revealed portion), and listener notifications in the fallback path deliver complete content.

### What got done

- **`stream:cancelled` event type**: Added to `ServerWsMessage` in `ws-types.ts` — `{ type: "stream:cancelled", chatId, streamId, nodeId }`, same shape as `stream:end`
- **`cancelStream()` rewrite**: `stream-manager.ts:275-325` — aborts AI SDK request, persists partial content to SQLite via `addMessage()` if non-empty, publishes `stream:cancelled`; empty buffer falls back to `stream:error` for rollback
- **Client cancel handler**: `useStreamSocket.ts` — `stream:cancelled` falls through to `stream:end` case, single handler for both finalization paths, zero code duplication
- **Smooth reveal buffer**: `streaming-buffer.ts` rewritten from 177 to 349 lines — truth buffer + reveal cursor architecture, `requestAnimationFrame` reveal loop, sliding-window rate estimation (2s window, 1.15x multiplier), catch-up mechanism (150-char threshold, 20% fraction), `MIN_RATE` floor at 50 chars/sec
- **Instant reveal on finalize/cancel/reconnect**: `finalizeSession()`, `cancelSession()`, and `setContent()` all set `revealedLength` to full buffer length and notify listeners immediately — no buffered content is ever lost
- **Non-browser fallback**: `HAS_RAF` flag gates animation; test environment uses `setTimeout(16)` with immediate full delivery, preserving all existing test behavior
- **4 new tests**: `streaming-buffer.test.ts` tests 17-20 — finalize reveals to listeners, cancel reveals to listeners, setContent reveals instantly, getContent returns full truth buffer — 114 total tests, 278 expect() calls, 0 failures
- **Type check clean**: 0 errors across all 6 modified files

### Notes

The cancel bug is a textbook example of conflating error handling with intentional user actions. When the optimistic placeholder system was designed, "rollback on error" was the only undo path considered. Cancel wasn't given its own semantic — it was stuffed into the error path because both involve "stopping a stream." The distinction matters: errors are unexpected failures where content is unreliable, cancellation is a deliberate user action where content is valuable. Any system that conflates these two will either lose data on cancel or fail to clean up on error.

The interpolation buffer validates a principle from game networking: the presentation layer should never be coupled to the network delivery rate. Chunks arrive when the network delivers them. Characters appear when the animation frame says they should. The sliding window rate estimate is the bridge — it observes the actual delivery speed and derives a smooth reveal rate from it. The 1.15x multiplier and catch-up mechanism are the two knobs that keep the cursor tracking close to reality without either lagging visibly or running ahead into empty buffer. These values (1.15x, 150 chars, 20%) were chosen conservatively — they can be tuned based on real-world streaming behavior across different models and network conditions.

Next logical steps: stress-test the smooth reveal with a real OpenRouter stream to validate the rate constants feel right, and consider adding a visual indicator (subtle fade or different cursor color) when a message was cancelled rather than completed naturally.
