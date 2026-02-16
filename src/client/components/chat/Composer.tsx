import React, { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useIsStreaming } from "../../stores/streaming.ts";
import { useChatMutations } from "../../hooks/useMutations.ts";

interface ComposerProps {
  chatId: string;
  lastNodeIdRef: React.RefObject<string | null>;
  userSpeakerId: string | null;
}

/**
 * Forge-lineage composer with pilot light.
 *
 * Mirrors proseus-ai's ForgeInput:
 * - Transparent textarea, no box/border — just text floating
 * - 1px "pilot light" line beneath: dim violet idle, orange→rose→violet
 *   gradient when the user has typed something (the forge is lit)
 * - Ghost send button morphs: dim arrow → gradient flame → red stop square
 *   using motion's AnimatePresence for smooth icon transitions
 * - Background fades upward from #060b12 so messages dissolve into the input
 */
const Composer = React.memo(function Composer({
  chatId,
  lastNodeIdRef,
  userSpeakerId,
}: ComposerProps) {
  const [draft, setDraft] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isStreaming = useIsStreaming();
  const { addMessage } = useChatMutations(chatId);

  const hasText = draft.trim().length > 0;
  const canSend = hasText && userSpeakerId !== null;

  const handleSend = useCallback(() => {
    const lastNodeId = lastNodeIdRef.current;
    if (!canSend || !lastNodeId || !userSpeakerId) return;

    addMessage.mutate({
      parent_id: lastNodeId,
      speaker_id: userSpeakerId,
      is_bot: false,
      message: draft.trim(),
    });

    setDraft("");

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [canSend, lastNodeIdRef, userSpeakerId, draft, addMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setDraft(e.target.value);

      const el = e.target;
      el.style.height = "auto";
      const lineHeight = parseInt(getComputedStyle(el).lineHeight) || 24;
      const maxHeight = lineHeight * 20;
      el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
    },
    [],
  );

  const handleButtonClick = useCallback(() => {
    if (isStreaming) {
      // Stop is handled via StreamDebug for now
      return;
    }
    handleSend();
  }, [isStreaming, handleSend]);

  // Pilot light state classes
  const pilotClasses = [
    "pilot-light",
    hasText ? "pilot-hot" : "",
    isFocused ? "pilot-focused" : "",
  ]
    .filter(Boolean)
    .join(" ");

  // Shared morph transition
  const iconTransition = { duration: 0.15 };
  const iconInitial = { scale: 0.8, opacity: 0 };
  const iconAnimate = { scale: 1, opacity: 1 };
  const iconExit = { scale: 0.8, opacity: 0 };

  return (
    <div
      className="shrink-0 pt-0 pb-4 md:px-6"
      style={{
        background: "linear-gradient(to top, #060b12 60%, transparent 100%)",
        paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
      }}
    >
      {/* Hidden SVG gradient for flame icon stroke */}
      <svg width="0" height="0" className="absolute">
        <defs>
          <linearGradient
            id="flame-gradient"
            x1="0%"
            y1="0%"
            x2="0%"
            y2="100%"
          >
            <stop offset="0%" stopColor="#f97316" />
            <stop offset="50%" stopColor="#f43f5e" />
            <stop offset="100%" stopColor="#8b5cf6" />
          </linearGradient>
        </defs>
      </svg>

      <div className="px-4 max-w-6xl mx-auto">
        {/* Pilot Light container */}
        <div
          className="relative pb-3"
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
        >
          {/* Input row */}
          <div className="relative flex items-end gap-3 px-1">
            {/* Textarea — transparent, floating text */}
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              disabled={isStreaming}
              placeholder={
                isStreaming ? "Generating..." : "Send a message..."
              }
              rows={3}
              className={[
                "flex-1 pt-4 py-1 min-h-[72px]",
                "resize-none bg-transparent",
                "text-[#f8fafc] placeholder-[#475569]",
                "focus:outline-none",
                "leading-6",
                "disabled:opacity-50 disabled:cursor-not-allowed",
              ].join(" ")}
              style={{ fontFamily: "'Outfit', system-ui, sans-serif" }}
            />

            {/* Ghost send button — morphs between arrow / flame / stop */}
            <button
              type="button"
              onClick={handleButtonClick}
              disabled={!isStreaming && !canSend}
              className={[
                "shrink-0 p-3 rounded-lg transition-all duration-200",
                "disabled:cursor-not-allowed",
                "active:scale-95",
                isStreaming
                  ? "text-[#ff6b6b] hover:text-[#ff8a8a]"
                  : canSend
                    ? "flame-glow"
                    : "text-[#475569] opacity-50",
              ].join(" ")}
              aria-label={isStreaming ? "Stop generation" : "Send message"}
            >
              <AnimatePresence mode="wait">
                {isStreaming ? (
                  <motion.div
                    key="stop"
                    initial={iconInitial}
                    animate={iconAnimate}
                    exit={iconExit}
                    transition={iconTransition}
                  >
                    {/* Stop — filled square */}
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect
                        x="3"
                        y="3"
                        width="18"
                        height="18"
                        rx="2"
                        ry="2"
                      />
                    </svg>
                  </motion.div>
                ) : canSend ? (
                  <motion.div
                    key="flame"
                    initial={{ ...iconInitial, rotate: -30 }}
                    animate={{ ...iconAnimate, rotate: 0 }}
                    exit={{ ...iconExit, rotate: 30 }}
                    transition={iconTransition}
                  >
                    {/* Flame — gradient stroke, the forge is lit */}
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="url(#flame-gradient)"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
                    </svg>
                  </motion.div>
                ) : (
                  <motion.div
                    key="arrow"
                    initial={iconInitial}
                    animate={iconAnimate}
                    exit={iconExit}
                    transition={iconTransition}
                  >
                    {/* Arrow — dim pilot light, forge is cold */}
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M5 12h14" />
                      <path d="m12 5 7 7-7 7" />
                    </svg>
                  </motion.div>
                )}
              </AnimatePresence>
            </button>
          </div>

          {/* The pilot light — 1px line at the bottom */}
          <div className={pilotClasses}>
            <div className="pilot-violet" />
            <div className="pilot-gradient" />
          </div>
        </div>

        {/* Keyboard hint — desktop only */}
        <div className="pb-4 md:hidden" />
        <p className="hidden md:block text-xs text-[#475569] mt-2 text-center">
          Press{" "}
          <kbd className="px-1.5 py-0.5 rounded bg-white/[0.04] text-[#64748b]">
            Enter
          </kbd>{" "}
          to send,{" "}
          <kbd className="px-1.5 py-0.5 rounded bg-white/[0.04] text-[#64748b]">
            Shift+Enter
          </kbd>{" "}
          for new line
        </p>
      </div>
    </div>
  );
});

export default Composer;
