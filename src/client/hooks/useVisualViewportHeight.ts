import { useEffect } from "react";

const VIEWPORT_HEIGHT_VAR = "--app-visual-viewport-height";
const VIEWPORT_OFFSET_VAR = "--app-visual-viewport-offset-top";
const SCROLL_LOCK_CLASS = "proseus-mobile-scroll-lock";

export function useVisualViewportHeight(enabled: boolean): void {
  useEffect(() => {
    const root = document.documentElement;

    if (!enabled) {
      root.classList.remove(SCROLL_LOCK_CLASS);
      root.style.removeProperty(VIEWPORT_HEIGHT_VAR);
      root.style.removeProperty(VIEWPORT_OFFSET_VAR);
      return;
    }

    root.classList.add(SCROLL_LOCK_CLASS);

    let rafId = 0;

    const applyViewportSize = () => {
      const vv = window.visualViewport;
      const height = vv ? Math.round(vv.height) : window.innerHeight;
      const offsetTop = vv ? Math.round(vv.offsetTop) : 0;

      root.style.setProperty(VIEWPORT_HEIGHT_VAR, `${height}px`);
      root.style.setProperty(VIEWPORT_OFFSET_VAR, `${offsetTop}px`);
    };

    const scheduleApply = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(applyViewportSize);
    };

    const onFocusChange = () => {
      scheduleApply();
      setTimeout(scheduleApply, 80);
    };

    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener("resize", scheduleApply);
      vv.addEventListener("scroll", scheduleApply);
    }

    window.addEventListener("resize", scheduleApply);
    window.addEventListener("orientationchange", scheduleApply);
    window.addEventListener("focusin", onFocusChange);
    window.addEventListener("focusout", onFocusChange);

    applyViewportSize();

    return () => {
      root.classList.remove(SCROLL_LOCK_CLASS);
      root.style.removeProperty(VIEWPORT_HEIGHT_VAR);
      root.style.removeProperty(VIEWPORT_OFFSET_VAR);

      if (rafId) cancelAnimationFrame(rafId);

      if (vv) {
        vv.removeEventListener("resize", scheduleApply);
        vv.removeEventListener("scroll", scheduleApply);
      }

      window.removeEventListener("resize", scheduleApply);
      window.removeEventListener("orientationchange", scheduleApply);
      window.removeEventListener("focusin", onFocusChange);
      window.removeEventListener("focusout", onFocusChange);
    };
  }, [enabled]);
}
