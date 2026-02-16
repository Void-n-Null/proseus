/**
 * Module-level streaming content buffer.
 *
 * Accumulates streaming AI chunks outside of React state so that token
 * arrivals never trigger component re-renders. Subscribers (typically a
 * DOM ref callback) are notified at most once per animation frame via
 * `requestAnimationFrame` coalescing (falls back to `setTimeout(16)` in
 * non-browser environments like tests).
 */

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

let contentBuffer = '';
let pendingChunks: string[] = [];
let flushScheduled = false;
let flushHandle: ReturnType<typeof setTimeout> | number | null = null;
let sessionActive = false;

type ContentListener = (content: string) => void;
const listeners = new Set<ContentListener>();

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Determine the best scheduling primitive available. */
function scheduleFlush(fn: () => void): ReturnType<typeof setTimeout> | number {
  if (typeof requestAnimationFrame === 'function') {
    return requestAnimationFrame(fn);
  }
  return setTimeout(fn, 16);
}

/** Cancel a previously scheduled flush. */
function cancelFlush(handle: ReturnType<typeof setTimeout> | number | null): void {
  if (handle === null) return;
  if (typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(handle as number);
  }
  // Also clear the timeout – safe to call even if handle came from rAF.
  clearTimeout(handle as ReturnType<typeof setTimeout>);
}

/** Join pending chunks into the content buffer and notify every listener. */
function flushPendingChunks(): void {
  flushScheduled = false;
  flushHandle = null;

  if (pendingChunks.length === 0) return;

  contentBuffer += pendingChunks.join('');
  pendingChunks = [];

  const snapshot = contentBuffer;
  for (const listener of listeners) {
    listener(snapshot);
  }
}

/** Synchronously flush any pending chunks (used by getContent / finalize). */
function flushSync(): void {
  if (pendingChunks.length > 0) {
    cancelFlush(flushHandle);
    flushScheduled = false;
    flushHandle = null;

    contentBuffer += pendingChunks.join('');
    pendingChunks = [];

    const snapshot = contentBuffer;
    for (const listener of listeners) {
      listener(snapshot);
    }
  }
}

/** Reset all internal state. */
function resetState(): void {
  cancelFlush(flushHandle);
  contentBuffer = '';
  pendingChunks = [];
  flushScheduled = false;
  flushHandle = null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Subscribe to content updates. Returns an unsubscribe function. */
export function subscribeToContent(listener: ContentListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Get the current accumulated content (flushes pending chunks first). */
export function getContent(): string {
  flushSync();
  return contentBuffer;
}

/** Start a new streaming session. Resets the buffer. */
export function startSession(): void {
  resetState();
  sessionActive = true;
}

/**
 * Append a chunk of streaming content.
 *
 * Pushes the chunk into a pending array and schedules a flush (at most
 * once per animation frame). No-op if no session is active.
 */
export function appendChunk(chunk: string): void {
  if (!sessionActive) return;

  pendingChunks.push(chunk);

  if (!flushScheduled) {
    flushScheduled = true;
    flushHandle = scheduleFlush(flushPendingChunks);
  }
}

/**
 * Replace all content at once (for full-content updates rather than
 * chunk-by-chunk streaming). Notifies listeners immediately.
 */
export function setContent(content: string): void {
  cancelFlush(flushHandle);
  flushScheduled = false;
  flushHandle = null;
  pendingChunks = [];
  contentBuffer = content;

  const snapshot = contentBuffer;
  for (const listener of listeners) {
    listener(snapshot);
  }
}

/**
 * Finalize the streaming session.
 *
 * Returns the complete accumulated content and clears all state.
 */
export function finalizeSession(): string {
  flushSync();
  const result = contentBuffer;
  resetState();
  sessionActive = false;
  return result;
}

/**
 * Cancel the streaming session.
 *
 * Returns whatever content has been accumulated so far and clears all
 * state.
 */
export function cancelSession(): string {
  flushSync();
  const result = contentBuffer;
  resetState();
  sessionActive = false;
  return result;
}

/** Check whether a streaming session is currently active. */
export function isSessionActive(): boolean {
  return sessionActive;
}
