/**
 * Module-level streaming content buffer with smooth character reveal.
 *
 * Accumulates streaming AI chunks outside of React state so that token
 * arrivals never trigger component re-renders. Instead of showing chunks
 * instantly (which creates a jerky appearance due to irregular WebSocket
 * delivery), a reveal cursor advances through the accumulated content at
 * a rate derived from the actual chunk arrival speed.
 *
 * Subscribers see characters appear at a smooth, steady pace that masks
 * the burstiness of network delivery. The reveal runs once per
 * requestAnimationFrame (~60fps). In non-browser environments (tests),
 * content is delivered immediately with no animation.
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Sliding window for rate estimation (ms). */
const RATE_WINDOW_MS = 2000;

/** Reveal slightly faster than arrival so the cursor doesn't fall behind. */
const SPEED_MULTIPLIER = 1.15;

/** If the cursor falls this many chars behind the buffer, start catching up. */
const MAX_LAG_CHARS = 150;

/** Fraction of excess lag to close per frame when catching up. */
const CATCHUP_FRACTION = 0.2;

/** Minimum reveal speed (chars/ms) — prevents stalling on sparse data. */
const MIN_RATE = 0.05; // ~50 chars/sec

// ---------------------------------------------------------------------------
// Module-level state — content buffer (truth)
// ---------------------------------------------------------------------------

let contentBuffer = '';
let pendingChunks: string[] = [];
let sessionActive = false;

type ContentListener = (content: string) => void;
const listeners = new Set<ContentListener>();

// ---------------------------------------------------------------------------
// Smooth reveal state
// ---------------------------------------------------------------------------

/** How many characters of contentBuffer have been shown to listeners. */
let revealedLength = 0;

/** Estimated chunk arrival rate in chars/ms, smoothed. */
let revealRate = MIN_RATE;

/** performance.now() of the last reveal frame. */
let lastRevealTime = 0;

/** rAF handle for the reveal loop (browser only). */
let revealRafId: number | null = null;

/** Whether we're in a browser environment with rAF. */
const HAS_RAF = typeof requestAnimationFrame === 'function';

/** Sliding window of chunk arrival timestamps for rate estimation. */
interface ChunkArrival {
  time: number;
  chars: number;
}
let arrivals: ChunkArrival[] = [];

// ---------------------------------------------------------------------------
// Internal helpers — chunk accumulation
// ---------------------------------------------------------------------------

/**
 * Move pending chunks into the content buffer. Does NOT notify listeners.
 * Returns the number of new characters accumulated.
 */
function accumulateChunks(): number {
  if (pendingChunks.length === 0) return 0;
  const joined = pendingChunks.join('');
  contentBuffer += joined;
  pendingChunks = [];
  return joined.length;
}

// ---------------------------------------------------------------------------
// Internal helpers — rate estimation
// ---------------------------------------------------------------------------

/** Record a chunk arrival and update the rate estimate. */
function recordArrival(chars: number): void {
  const now = performance.now();
  arrivals.push({ time: now, chars });

  // Trim samples outside the sliding window
  const cutoff = now - RATE_WINDOW_MS;
  while (arrivals.length > 0 && arrivals[0]!.time < cutoff) {
    arrivals.shift();
  }

  // Need at least 2 samples spanning some time to calculate rate
  if (arrivals.length >= 2) {
    const first = arrivals[0]!;
    const last = arrivals[arrivals.length - 1]!;
    const span = last.time - first.time;
    if (span > 0) {
      const totalChars = arrivals.reduce((sum, a) => sum + a.chars, 0);
      revealRate = Math.max(MIN_RATE, (totalChars / span) * SPEED_MULTIPLIER);
    }
  }
}

// ---------------------------------------------------------------------------
// Internal helpers — reveal animation (browser only)
// ---------------------------------------------------------------------------

/** Notify all listeners with the current revealed content. */
function notifyListeners(content: string): void {
  for (const listener of listeners) {
    listener(content);
  }
}

/** The per-frame reveal loop. Advances the cursor and notifies listeners. */
function revealFrame(): void {
  revealRafId = null;
  if (!sessionActive) return;

  // Accumulate any pending chunks into the truth buffer
  const newChars = accumulateChunks();
  if (newChars > 0) {
    recordArrival(newChars);
  }

  const target = contentBuffer.length;

  if (revealedLength < target) {
    const now = performance.now();
    const dt = lastRevealTime > 0 ? now - lastRevealTime : 16;
    lastRevealTime = now;

    // Base reveal: rate * elapsed time
    let charsToReveal = revealRate * dt;

    // Catch-up: if cursor fell too far behind, close a fraction of the gap
    const lag = target - revealedLength;
    if (lag > MAX_LAG_CHARS) {
      charsToReveal = Math.max(charsToReveal, lag * CATCHUP_FRACTION);
    }

    // Always advance at least 1 character per frame
    charsToReveal = Math.max(charsToReveal, 1);

    revealedLength = Math.min(target, revealedLength + Math.ceil(charsToReveal));

    notifyListeners(contentBuffer.substring(0, revealedLength));
  } else {
    // Cursor caught up — reset frame time so we don't get a huge dt spike
    // when new chunks arrive after a pause
    lastRevealTime = 0;
  }

  // Keep looping while session is active
  if (sessionActive) {
    revealRafId = requestAnimationFrame(revealFrame);
  }
}

/** Start the reveal loop if it's not already running. */
function ensureRevealLoop(): void {
  if (revealRafId === null && sessionActive) {
    lastRevealTime = performance.now();
    revealRafId = requestAnimationFrame(revealFrame);
  }
}

/** Stop the reveal loop. */
function cancelRevealLoop(): void {
  if (revealRafId !== null) {
    cancelAnimationFrame(revealRafId);
    revealRafId = null;
  }
}

// ---------------------------------------------------------------------------
// Internal helpers — non-browser fallback (setTimeout flush, tests)
// ---------------------------------------------------------------------------

let fallbackFlushScheduled = false;
let fallbackFlushHandle: ReturnType<typeof setTimeout> | null = null;

function scheduleFallbackFlush(): void {
  if (fallbackFlushScheduled) return;
  fallbackFlushScheduled = true;
  fallbackFlushHandle = setTimeout(() => {
    fallbackFlushScheduled = false;
    fallbackFlushHandle = null;
    accumulateChunks();
    // In non-browser mode, reveal everything immediately
    revealedLength = contentBuffer.length;
    notifyListeners(contentBuffer);
  }, 16);
}

function cancelFallbackFlush(): void {
  if (fallbackFlushHandle !== null) {
    clearTimeout(fallbackFlushHandle);
    fallbackFlushHandle = null;
    fallbackFlushScheduled = false;
  }
}

// ---------------------------------------------------------------------------
// Internal helpers — state reset
// ---------------------------------------------------------------------------

/** Reset all internal state. */
function resetState(): void {
  cancelRevealLoop();
  cancelFallbackFlush();
  contentBuffer = '';
  pendingChunks = [];
  revealedLength = 0;
  revealRate = MIN_RATE;
  lastRevealTime = 0;
  arrivals = [];
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

/**
 * Get the current accumulated content (full truth buffer, not just revealed).
 * Flushes pending chunks before returning.
 */
export function getContent(): string {
  accumulateChunks();
  return contentBuffer;
}

/** Start a new streaming session. Resets the buffer and reveal state. */
export function startSession(): void {
  resetState();
  sessionActive = true;
}

/**
 * Append a chunk of streaming content.
 *
 * Pushes the chunk into a pending array. In browsers, the reveal loop
 * accumulates chunks and smoothly advances the cursor. In non-browser
 * environments, a setTimeout flush delivers content immediately.
 *
 * No-op if no session is active.
 */
export function appendChunk(chunk: string): void {
  if (!sessionActive) return;

  pendingChunks.push(chunk);

  if (HAS_RAF) {
    ensureRevealLoop();
  } else {
    scheduleFallbackFlush();
  }
}

/**
 * Replace all content at once (for full-content updates on reconnect).
 * Reveals instantly — this is catch-up content, not new generation.
 * Notifies listeners immediately.
 */
export function setContent(content: string): void {
  cancelRevealLoop();
  cancelFallbackFlush();
  pendingChunks = [];
  contentBuffer = content;
  revealedLength = content.length;
  // Reset rate — reconnect content doesn't tell us about generation speed
  arrivals = [];
  lastRevealTime = 0;

  notifyListeners(contentBuffer);

  // Restart reveal loop for subsequent chunks
  if (sessionActive && HAS_RAF) {
    ensureRevealLoop();
  }
}

/**
 * Finalize the streaming session.
 *
 * Instantly reveals all remaining content, notifies listeners one last
 * time with the complete text, then clears all state.
 * Returns the complete accumulated content.
 */
export function finalizeSession(): string {
  accumulateChunks();
  const result = contentBuffer;

  // Reveal everything remaining so listeners see the complete text
  if (revealedLength < contentBuffer.length) {
    revealedLength = contentBuffer.length;
    notifyListeners(contentBuffer);
  }

  resetState();
  sessionActive = false;
  return result;
}

/**
 * Cancel the streaming session.
 *
 * Instantly reveals all remaining content (so the user sees everything
 * that was buffered), then clears all state.
 * Returns whatever content has been accumulated so far.
 */
export function cancelSession(): string {
  accumulateChunks();
  const result = contentBuffer;

  // Reveal everything remaining
  if (revealedLength < contentBuffer.length) {
    revealedLength = contentBuffer.length;
    notifyListeners(contentBuffer);
  }

  resetState();
  sessionActive = false;
  return result;
}

/** Check whether a streaming session is currently active. */
export function isSessionActive(): boolean {
  return sessionActive;
}
