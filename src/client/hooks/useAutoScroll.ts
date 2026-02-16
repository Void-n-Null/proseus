/**
 * Intent-aware auto-scroll hook for virtualized (or plain) scroll containers.
 *
 * Behavior:
 * - **Sticky to bottom** by default. While sticky, new content or streaming
 *   growth keeps the scroll pinned to the end.
 * - **User scrolls up** → sticky disengages. The user is reading history.
 * - **User scrolls back to bottom** (within threshold) → sticky re-engages.
 * - **Scroll-past-bottom gesture** (wheel/touch down while already at bottom)
 *   → forces sticky on, so streaming content will be followed.
 *
 * All state lives in refs — zero React re-renders from scroll events.
 *
 * Usage:
 *   const { scrollRef, onScroll, scrollToBottom, isSticky } = useAutoScroll();
 *   // Attach scrollRef to the scroll container, onScroll to its onScroll prop.
 *   // Call scrollToBottom() when new items arrive (if sticky).
 *   // Call onContentGrow() from streaming rAF to keep up with growing content.
 */

import { useRef, useCallback, useEffect } from 'react';

/** How far from the bottom (px) the user can be and still count as "at bottom". */
const BOTTOM_THRESHOLD = 40;

interface UseAutoScrollOptions {
  /** Initial sticky state. Defaults to true. */
  initialSticky?: boolean;
}

interface UseAutoScrollReturn {
  /** Ref to attach to the scrollable container element. */
  scrollRef: React.RefObject<HTMLDivElement | null>;
  /** Scroll event handler — attach to the container's `onScroll`. */
  onScroll: () => void;
  /** Wheel event handler — attach to the container's `onWheel` for scroll-past-bottom detection. */
  onWheel: (e: WheelEvent) => void;
  /** Snap to bottom if currently sticky. Returns whether it scrolled. */
  scrollToBottom: () => boolean;
  /** Force-scroll to bottom regardless of sticky state (e.g., user sends a message). */
  forceScrollToBottom: () => void;
  /** Call this on every rAF during streaming to keep up with growing content. */
  onContentGrow: () => void;
  /** Read current sticky state (ref-based, no re-render). */
  isSticky: () => boolean;
}

export function useAutoScroll(
  options: UseAutoScrollOptions = {},
): UseAutoScrollReturn {
  const { initialSticky = true } = options;

  const scrollRef = useRef<HTMLDivElement>(null);
  const stickyRef = useRef(initialSticky);

  // Track whether the last scroll event was programmatic (from us) vs user.
  // This prevents our own scrollToBottom from disengaging sticky.
  const programmaticScrollRef = useRef(false);

  /** Check if the scroll container is at (or near) the bottom. */
  const isAtBottom = useCallback((): boolean => {
    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_THRESHOLD;
  }, []);

  /** Scroll handler — detects user intent. */
  const onScroll = useCallback(() => {
    // If we triggered this scroll programmatically, ignore it.
    if (programmaticScrollRef.current) {
      programmaticScrollRef.current = false;
      return;
    }

    // User-initiated scroll: update sticky based on position.
    if (isAtBottom()) {
      stickyRef.current = true;
    } else {
      stickyRef.current = false;
    }
  }, [isAtBottom]);

  /** Wheel handler — detects "scroll past bottom" gesture. */
  const onWheel = useCallback(
    (e: WheelEvent) => {
      // User is scrolling down (positive deltaY) while already at bottom
      if (e.deltaY > 0 && isAtBottom()) {
        stickyRef.current = true;
      }
    },
    [isAtBottom],
  );

  /** Register wheel listener (needs { passive: true } for performance). */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const handler = (e: WheelEvent) => onWheel(e);
    el.addEventListener('wheel', handler, { passive: true });
    return () => el.removeEventListener('wheel', handler);
  }, [onWheel]);

  /** Snap to bottom if sticky. Returns whether it actually scrolled. */
  const scrollToBottom = useCallback((): boolean => {
    if (!stickyRef.current) return false;
    const el = scrollRef.current;
    if (!el) return false;

    programmaticScrollRef.current = true;
    el.scrollTop = el.scrollHeight;
    return true;
  }, []);

  /** Force scroll to bottom regardless of sticky state. Also re-enables sticky. */
  const forceScrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;

    stickyRef.current = true;
    programmaticScrollRef.current = true;
    el.scrollTop = el.scrollHeight;
  }, []);

  /**
   * Call on every rAF during streaming to keep scroll pinned as content grows.
   * This should run in the same frame as the DOM content update for jitter-free scrolling.
   */
  const onContentGrow = useCallback(() => {
    if (!stickyRef.current) return;
    const el = scrollRef.current;
    if (!el) return;

    // Direct assignment in the same frame as the content write — no intermediate frame.
    programmaticScrollRef.current = true;
    el.scrollTop = el.scrollHeight;
  }, []);

  /** Read current sticky state without triggering a re-render. */
  const isSticky = useCallback(() => stickyRef.current, []);

  return {
    scrollRef,
    onScroll,
    onWheel,
    scrollToBottom,
    forceScrollToBottom,
    onContentGrow,
    isSticky,
  };
}
