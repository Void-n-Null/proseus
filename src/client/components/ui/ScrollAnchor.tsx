import { useEffect } from "react";
import type React from "react";

interface ScrollAnchorProps {
  containerRef: React.RefObject<HTMLElement | null>;
  deps: unknown[];
}

export default function ScrollAnchor({ containerRef, deps }: ScrollAnchorProps) {
  useEffect(() => {
    const el = containerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return null;
}
