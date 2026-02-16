import { test, expect, describe, beforeEach } from 'bun:test';
import {
  startSession,
  appendChunk,
  getContent,
  subscribeToContent,
  finalizeSession,
  cancelSession,
  isSessionActive,
  setContent,
} from '../client/lib/streaming-buffer.ts';

// ---------------------------------------------------------------------------
// Reset state between tests by starting + finalizing a session. This ensures
// each test begins with a clean slate.
// ---------------------------------------------------------------------------

beforeEach(() => {
  // If a previous test left a session active, finalize it.
  if (isSessionActive()) {
    finalizeSession();
  }
  // Start + finalize to guarantee a full reset.
  startSession();
  finalizeSession();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('streaming-buffer', () => {
  // 1
  test('startSession initializes empty buffer and marks session active', () => {
    startSession();
    expect(isSessionActive()).toBe(true);
    expect(getContent()).toBe('');
  });

  // 2
  test('appendChunk + getContent returns accumulated content', () => {
    startSession();
    appendChunk('hello');
    expect(getContent()).toBe('hello');
  });

  // 3
  test('multiple appendChunks concatenate correctly', () => {
    startSession();
    appendChunk('Hello');
    appendChunk(', ');
    appendChunk('world');
    appendChunk('!');
    expect(getContent()).toBe('Hello, world!');
  });

  // 4
  test('getContent flushes pending chunks before returning', () => {
    startSession();
    appendChunk('pending');
    appendChunk('-flush');
    // getContent must flush synchronously
    const result = getContent();
    expect(result).toBe('pending-flush');
  });

  // 5
  test('subscribeToContent fires callback on flush', async () => {
    startSession();
    let received = '';
    const unsub = subscribeToContent((content) => {
      received = content;
    });

    appendChunk('streamed');

    // Wait for the setTimeout(16) flush to fire
    await Bun.sleep(50);

    expect(received).toBe('streamed');
    unsub();
  });

  // 6
  test('multiple subscribers all receive updates', async () => {
    startSession();
    const results: string[] = [];

    const unsub1 = subscribeToContent((c) => results.push(`a:${c}`));
    const unsub2 = subscribeToContent((c) => results.push(`b:${c}`));

    appendChunk('token');
    await Bun.sleep(50);

    expect(results).toContain('a:token');
    expect(results).toContain('b:token');

    unsub1();
    unsub2();
  });

  // 7
  test('unsubscribe stops delivering to that listener', async () => {
    startSession();
    let callCount = 0;
    const unsub = subscribeToContent(() => {
      callCount++;
    });

    appendChunk('first');
    await Bun.sleep(50);
    expect(callCount).toBe(1);

    unsub();

    appendChunk('second');
    await Bun.sleep(50);
    expect(callCount).toBe(1); // should NOT have incremented
  });

  // 8
  test('finalizeSession returns full content and clears buffer', () => {
    startSession();
    appendChunk('part1');
    appendChunk('part2');
    const result = finalizeSession();
    expect(result).toBe('part1part2');
    expect(getContent()).toBe('');
  });

  // 9
  test('after finalize, isSessionActive returns false', () => {
    startSession();
    appendChunk('data');
    finalizeSession();
    expect(isSessionActive()).toBe(false);
  });

  // 10
  test('after finalize, getContent returns empty string', () => {
    startSession();
    appendChunk('stuff');
    finalizeSession();
    expect(getContent()).toBe('');
  });

  // 11
  test('cancelSession returns partial content', () => {
    startSession();
    appendChunk('partial');
    appendChunk('-content');
    const result = cancelSession();
    expect(result).toBe('partial-content');
  });

  // 12
  test('after cancel, isSessionActive returns false', () => {
    startSession();
    appendChunk('x');
    cancelSession();
    expect(isSessionActive()).toBe(false);
  });

  // 13
  test('startSession resets previous session state', () => {
    startSession();
    appendChunk('old data');
    // Start a new session without finalizing the old one
    startSession();
    expect(getContent()).toBe('');
    expect(isSessionActive()).toBe(true);
  });

  // 14
  test('appendChunk when no session active is a no-op', () => {
    // No session started (beforeEach finalized it)
    expect(isSessionActive()).toBe(false);
    appendChunk('should be ignored');
    expect(getContent()).toBe('');
  });

  // 15 – bonus: setContent replaces everything and notifies listeners
  test('setContent replaces buffer and notifies listeners', () => {
    startSession();
    appendChunk('old');
    getContent(); // flush

    let received = '';
    const unsub = subscribeToContent((c) => {
      received = c;
    });

    setContent('replaced');
    expect(getContent()).toBe('replaced');
    expect(received).toBe('replaced');
    unsub();
  });

  // 16 – bonus: subscribers receive cumulative content, not just the new chunk
  test('subscriber receives full accumulated content on each flush', async () => {
    startSession();
    appendChunk('a');
    getContent(); // flush "a"

    const snapshots: string[] = [];
    const unsub = subscribeToContent((c) => snapshots.push(c));

    appendChunk('b');
    await Bun.sleep(50);

    // The listener should see "ab", not just "b"
    expect(snapshots).toEqual(['ab']);
    unsub();
  });

  // ── Smooth reveal behavior ──────────────────────────────────

  // 17
  test('finalizeSession reveals all remaining content to listeners', () => {
    startSession();
    appendChunk('partial');
    appendChunk('-content');

    const snapshots: string[] = [];
    const unsub = subscribeToContent((c) => snapshots.push(c));

    // Finalize should instantly reveal everything to listeners
    const result = finalizeSession();

    expect(result).toBe('partial-content');
    // Listener should have been notified with the full content
    expect(snapshots.length).toBeGreaterThanOrEqual(1);
    expect(snapshots[snapshots.length - 1]).toBe('partial-content');
    unsub();
  });

  // 18
  test('cancelSession reveals all remaining content to listeners', () => {
    startSession();
    appendChunk('saved');
    appendChunk('-text');

    const snapshots: string[] = [];
    const unsub = subscribeToContent((c) => snapshots.push(c));

    const result = cancelSession();

    expect(result).toBe('saved-text');
    expect(snapshots.length).toBeGreaterThanOrEqual(1);
    expect(snapshots[snapshots.length - 1]).toBe('saved-text');
    unsub();
  });

  // 19
  test('setContent reveals replacement instantly to listeners', () => {
    startSession();
    appendChunk('original');
    getContent(); // flush

    const snapshots: string[] = [];
    const unsub = subscribeToContent((c) => snapshots.push(c));

    setContent('reconnect-full-content');

    // setContent should notify immediately with the full replacement
    expect(snapshots).toEqual(['reconnect-full-content']);
    expect(getContent()).toBe('reconnect-full-content');
    unsub();
  });

  // 20
  test('getContent returns full truth buffer regardless of reveal state', () => {
    startSession();
    appendChunk('all');
    appendChunk('-of');
    appendChunk('-this');

    // getContent always returns the full accumulated content
    expect(getContent()).toBe('all-of-this');
  });
});
