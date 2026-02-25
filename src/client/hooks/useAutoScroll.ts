/**
 * Intent-aware auto-scroll hook for virtualized (or plain) scroll containers.
 *
 * Behavior:
 * - **Sticky to bottom** by default. While sticky, new content or streaming
 *   growth keeps the scroll pinned to the end.
 * - **User scrolls up** → sticky disengages *immediately*. Any upward wheel,
 *   upward touch-drag, or scroll event away from bottom kills sticky.
 * - **User scrolls back to bottom** (within threshold) → sticky re-engages.
 * - Touch events on mobile are unambiguous intent — a `touchstart` on the
 *   scroll container during active sticky-scrolling disengages immediately.
 *
 * The hook uses a "last programmatic scrollTop" ref instead of a boolean flag
 * to distinguish programmatic scrolls from user scrolls. This prevents the
 * race condition where high-frequency `onContentGrow()` calls clobber the
 * flag before `onScroll` can read it.
 *
 * Exposes both a ref-based `isSticky()` (zero re-renders) and a reactive
 * `stickyState` boolean (re-renders only on transition) so the UI can
 * conditionally show a scroll-to-bottom button.
 */

import { useRef, useCallback, useEffect, useState } from 'react';

/** How far from the bottom (px) the user can be and still count as "at bottom". */
const BOTTOM_THRESHOLD = 100;

/**
 * Tolerance (px) for comparing actual scrollTop to programmatic target.
 * Browsers may round or clamp scrollTop, so we allow a small delta.
 */
const PROGRAMMATIC_TOLERANCE = 2;

interface UseAutoScrollOptions {
  /** Initial sticky state. Defaults to true. */
  initialSticky?: boolean;
}

interface UseAutoScrollReturn {
  /** Ref to attach to the scrollable container element. */
  scrollRef: React.RefObject<HTMLDivElement | null>;
  /** Scroll event handler — attach to the container's `onScroll`. */
  onScroll: () => void;
  /** Snap to bottom if currently sticky. Returns whether it scrolled. */
  scrollToBottom: () => boolean;
  /** Force-scroll to bottom regardless of sticky state (e.g., user sends a message). */
  forceScrollToBottom: () => void;
  /** Call this on every content update during streaming to keep scroll pinned. */
  onContentGrow: () => void;
  /** Read current sticky state (ref-based, no re-render). */
  isSticky: () => boolean;
  /** Reactive sticky state — triggers re-render only on transition. */
  stickyState: boolean;
}

export function useAutoScroll(
  options: UseAutoScrollOptions = {},
): UseAutoScrollReturn {
  const { initialSticky = true } = options;

  const scrollRef = useRef<HTMLDivElement>(null);
  const stickyRef = useRef(initialSticky);
  const [stickyState, setStickyState] = useState(initialSticky);

  /**
   * Instead of a boolean "was this programmatic?" flag (which gets clobbered),
   * we store the scrollTop value we last set programmatically. In `onScroll`,
   * if the actual scrollTop matches this value (within tolerance), the event
   * was from us. If it doesn't match, the user intervened.
   */
  const programmaticTargetRef = useRef<number | null>(null);

  /**
   * True while the user's finger is on the scroll container. Used to suppress
   * onContentGrow() during touch without changing sticky state (which would
   * flash the scroll-to-bottom button on every tap).
   */
  const touchActiveRef = useRef(false);

  /** Update both the ref and the reactive state in one call. */
  const setSticky = useCallback((value: boolean) => {
    if (stickyRef.current !== value) {
      stickyRef.current = value;
      setStickyState(value);
    }
  }, []);

  /** Check if the scroll container is at (or near) the bottom. */
  const isAtBottom = useCallback((): boolean => {
    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_THRESHOLD;
  }, []);

  /** Scroll handler — distinguishes programmatic scrolls from user scrolls. */
  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;

    // Check if this scroll event matches our last programmatic scroll.
    const target = programmaticTargetRef.current;
    if (target !== null) {
      const actual = el.scrollTop;
      if (Math.abs(actual - target) <= PROGRAMMATIC_TOLERANCE) {
        // This was our programmatic scroll — ignore it.
        programmaticTargetRef.current = null;
        return;
      }
      // scrollTop doesn't match — user intervened between our set and this event.
      programmaticTargetRef.current = null;
    }

    // User-initiated scroll: update sticky based on position.
    if (isAtBottom()) {
      setSticky(true);
    } else {
      setSticky(false);
    }
  }, [isAtBottom, setSticky]);

  /**
   * Register touch and wheel listeners for immediate intent detection.
   *
   * - touchstart: On mobile, any touch on the scroll area is intent to
   *   interact. If we're currently sticky, disengage immediately so the
   *   user's drag isn't fought by onContentGrow().
   *
   * - wheel (upward): An upward wheel event is unambiguous "I want to
   *   scroll up" intent. Disengage sticky before the scroll even happens.
   *
   * - wheel (downward at bottom): Re-engage sticky (scroll-past-bottom gesture).
   */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const onTouchStart = () => {
      // Mark touch as active so onContentGrow() won't fight the user's
      // finger. We do NOT disengage sticky here — that would flash the
      // scroll-to-bottom button on every tap. Actual scroll position
      // changes are handled by onScroll/onWheel.
      touchActiveRef.current = true;
    };

    const onTouchEnd = () => {
      touchActiveRef.current = false;
      // After the user lifts their finger, check if they ended up at
      // the bottom. If so, re-engage sticky. We use a short delay to
      // let momentum scrolling settle.
      setTimeout(() => {
        if (isAtBottom()) {
          setSticky(true);
        }
      }, 150);
    };

    const onWheel = (e: WheelEvent) => {
      if (e.deltaY < 0) {
        // Scrolling up — disengage immediately.
        setSticky(false);
      } else if (e.deltaY > 0 && isAtBottom()) {
        // Scrolling down while at bottom — re-engage.
        setSticky(true);
      }
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('wheel', onWheel, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('wheel', onWheel);
    };
  }, [isAtBottom, setSticky]);

  /** Programmatically scroll to bottom, recording the target for detection. */
  const doScrollToBottom = useCallback((el: HTMLDivElement) => {
    const target = el.scrollHeight - el.clientHeight;
    programmaticTargetRef.current = target;
    el.scrollTop = el.scrollHeight;
  }, []);

  /** Snap to bottom if sticky. Returns whether it actually scrolled. */
  const scrollToBottom = useCallback((): boolean => {
    if (!stickyRef.current) return false;
    const el = scrollRef.current;
    if (!el) return false;
    doScrollToBottom(el);
    return true;
  }, [doScrollToBottom]);

  /** Force scroll to bottom regardless of sticky state. Also re-enables sticky. */
  const forceScrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setSticky(true);
    doScrollToBottom(el);
  }, [doScrollToBottom, setSticky]);

  /**
   * Call on every content update during streaming to keep scroll pinned.
   * Only scrolls if sticky is engaged — if the user has disengaged, this
   * is a no-op.
   */
  const onContentGrow = useCallback(() => {
    if (!stickyRef.current) return;
    if (touchActiveRef.current) return; // Don't fight the user's finger
    const el = scrollRef.current;
    if (!el) return;
    doScrollToBottom(el);
  }, [doScrollToBottom]);

  /** Read current sticky state without triggering a re-render. */
  const isSticky = useCallback(() => stickyRef.current, []);

  return {
    scrollRef,
    onScroll,
    scrollToBottom,
    forceScrollToBottom,
    onContentGrow,
    isSticky,
    stickyState,
  };
}
