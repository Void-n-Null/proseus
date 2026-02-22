/**
 * MobileSlideUpSheet — A bottom-sheet overlay for mobile screens.
 *
 * Uses createPortal + Framer Motion directly. Does NOT use Radix Dialog,
 * because Radix's DialogContent has center-pinned transforms that fight
 * bottom-anchored slide animations.
 *
 * Features:
 * - Slides up from the bottom of the viewport
 * - Rounded top corners with drag-handle tap-to-dismiss
 * - Backdrop overlay with fade animation
 * - Escape key to close
 * - Body scroll lock while open
 */

import React, { useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";

interface MobileSlideUpSheetProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export default function MobileSlideUpSheet({
  open,
  onClose,
  children,
}: MobileSlideUpSheetProps) {
  // ── Escape key ──────────────────────────────────────────────
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, handleKeyDown]);

  // ── Body scroll lock ────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="sheet-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-black/75"
            onClick={onClose}
            aria-hidden
          />

          {/* Sheet */}
          <motion.div
            key="sheet-panel"
            role="dialog"
            aria-modal="true"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed inset-x-0 bottom-0 z-50 h-[96dvh] max-h-[96dvh] w-full rounded-t-2xl border border-border border-b-0 bg-surface shadow-lg overflow-hidden"
          >
            <div className="h-full min-h-0 flex flex-col">
              {/* Drag handle — tap to dismiss */}
              <div className="shrink-0 flex justify-center pt-2 pb-1.5 border-b border-white/5 bg-surface/95">
                <button
                  type="button"
                  aria-label="Close"
                  className="h-5 w-16 flex items-center justify-center"
                  onClick={onClose}
                >
                  <span className="h-1 w-10 rounded-full bg-text-dim/50" />
                </button>
              </div>

              {/* Scrollable content */}
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
                {children}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
