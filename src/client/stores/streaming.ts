/**
 * Zustand store for streaming session metadata.
 *
 * Tracks *who* is streaming and *when* it started. The actual content
 * lives in the module-level buffer (`streaming-buffer.ts`) to avoid
 * triggering React re-renders on every token.
 *
 * React re-renders happen ONLY when `meta` transitions between
 * `null ↔ StreamingMeta` (i.e. streaming starts or stops).
 */

import { create } from 'zustand';
import { startSession } from '../lib/streaming-buffer.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StreamingMeta {
  parentId: string;
  speakerId: string;
  nodeClientId: string;
  startedAt: number;
}

interface StreamingStore {
  meta: StreamingMeta | null;
  start: (parentId: string, speakerId: string, nodeClientId: string) => void;
  stop: () => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useStreamingStore = create<StreamingStore>((set) => ({
  meta: null,

  start: (parentId, speakerId, nodeClientId) => {
    // Reset the content buffer for the new session.
    startSession();

    set({
      meta: {
        parentId,
        speakerId,
        nodeClientId,
        startedAt: Date.now(),
      },
    });
  },

  stop: () => {
    // NOTE: We do NOT finalize the buffer here. The session machine is
    // responsible for calling finalizeSession() or cancelSession() on
    // the buffer at the appropriate time.
    set({ meta: null });
  },
}));

// ---------------------------------------------------------------------------
// Selector hooks
// ---------------------------------------------------------------------------

/** `true` while any streaming session is active. */
export function useIsStreaming(): boolean {
  return useStreamingStore((s) => s.meta !== null);
}

/** The current streaming metadata, or `null` if idle. */
export function useStreamingMeta(): StreamingMeta | null {
  return useStreamingStore((s) => s.meta);
}

/**
 * `true` only when the given node is the one currently streaming.
 *
 * Most nodes will return `false` and therefore never re-render when
 * streaming state changes (Zustand skips re-renders when the selector
 * return value is referentially equal).
 */
export function useIsStreamingNode(nodeClientId: string | null | undefined): boolean {
  return useStreamingStore(
    (s) => s.meta !== null && s.meta.nodeClientId === (nodeClientId ?? ''),
  );
}
