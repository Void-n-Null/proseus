import { useState, useEffect } from "react";

/**
 * Subscribes to a CSS media query and returns whether it currently matches.
 * Uses `window.matchMedia` — no resize observers or debouncing needed.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    const mql = window.matchMedia(query);
    setMatches(mql.matches);

    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

/** Returns `true` when the viewport is phone-sized (< 640px, below Tailwind's `sm:` breakpoint). */
export function useIsMobile(): boolean {
  return useMediaQuery("(max-width: 639px)");
}
