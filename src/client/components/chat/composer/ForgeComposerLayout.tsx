import React from "react";
import { AnimatePresence, motion } from "motion/react";
import { PersonaAvatar } from "../../personas/PersonaSidebar.tsx";
import type { ComposerLayoutProps } from "./types.ts";
import PersonaPickerItem from "./PersonaPickerItem.tsx";

export default function ForgeComposerLayout({
  isFocused,
  setIsFocused,
  menuOpen,
  setMenuOpen,
  menuRef,
  textareaRef,
  canvasRef,
  personas,
  activePersona,
  personaId,
  placeholder,
  isStreaming,
  isDisconnected,
  isReconnecting,
  isListening,
  canSend,
  canGenerate,
  pilotClasses,
  iconTransition,
  iconInitial,
  iconAnimate,
  iconExit,
  handleInput,
  handleKeyDown,
  handleButtonClick,
  toggleListening,
  selectPersona,
  draft,
}: ComposerLayoutProps) {
  return (
    <div className="shrink-0 pt-0 pb-[max(1rem,env(safe-area-inset-bottom))] md:px-6 bg-[linear-gradient(to_top,var(--color-background)_60%,transparent_100%)]">
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
        <div
          className="relative pb-3"
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
        >
          <div className="relative flex items-end gap-3 px-1">
            <div ref={menuRef} className="relative self-end">
              <button
                type="button"
                onClick={() => setMenuOpen(!menuOpen)}
                title={activePersona ? `Persona: ${activePersona.name}` : "Set persona"}
                className={[
                  "shrink-0 p-3 rounded-lg transition-all duration-200",
                  "bg-transparent border-none cursor-pointer",
                  activePersona ? "text-[oklch(0.75_0.12_280)]" : "text-[#475569]",
                ].join(" ")}
              >
                {activePersona ? (
                  <PersonaAvatar persona={activePersona} size={22} />
                ) : (
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="4" y1="6" x2="20" y2="6" />
                    <line x1="4" y1="12" x2="20" y2="12" />
                    <line x1="4" y1="18" x2="20" y2="18" />
                  </svg>
                )}
              </button>

              {menuOpen && (
                <div className="absolute bottom-[calc(100%+6px)] left-0 min-w-[200px] bg-surface border border-border rounded-lg shadow-[0_-4px_20px_rgba(0,0,0,0.45)] z-50 overflow-hidden p-1">
                  <div className="px-2 pt-[0.35rem] pb-1 text-[0.65rem] font-semibold text-text-dim uppercase tracking-[0.05em]">
                    Persona
                  </div>
                  <PersonaPickerItem
                    label="No persona"
                    active={personaId === null}
                    onClick={() => selectPersona(null)}
                  />
                  {personas.length > 0 && <div className="h-px bg-border my-1" />}
                  {personas.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => selectPersona(p.id)}
                      className={[
                        "w-full flex items-center gap-2 px-2 py-[0.4rem]",
                        "border-none rounded-sm cursor-pointer",
                        "text-[0.78rem] text-left transition-[background] duration-100",
                        personaId === p.id
                          ? "bg-[oklch(0.18_0.04_280)] text-[oklch(0.75_0.12_280)]"
                          : "bg-transparent text-text-body",
                      ].join(" ")}
                      onMouseEnter={(e) => {
                        if (personaId !== p.id)
                          (e.currentTarget as HTMLButtonElement).style.background =
                            "var(--color-surface-hover)";
                      }}
                      onMouseLeave={(e) => {
                        if (personaId !== p.id)
                          (e.currentTarget as HTMLButtonElement).style.background =
                            "transparent";
                      }}
                    >
                      <PersonaAvatar persona={p} size={20} />
                      <span className="flex-1 whitespace-nowrap overflow-hidden text-ellipsis">
                        {p.name}
                      </span>
                      {p.is_global && (
                        <span className="text-[0.6rem] px-1 bg-[oklch(0.20_0.04_280)] text-[oklch(0.55_0.10_280)] rounded-sm">
                          global
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <textarea
              ref={textareaRef}
              value={draft}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              disabled={isStreaming || isDisconnected}
              placeholder={placeholder}
              rows={3}
              className={[
                "flex-1 pt-4 py-1 min-h-[72px]",
                "resize-none bg-transparent",
                "text-[#f8fafc] placeholder-[#475569]",
                "focus:outline-none",
                "leading-6 font-body",
                "disabled:opacity-50 disabled:cursor-not-allowed",
              ].join(" ")}
            />

            <div className="flex flex-col items-center gap-0.5">
              <button
                type="button"
                onClick={handleButtonClick}
                disabled={!isStreaming && !canSend && !canGenerate}
                className={[
                  "shrink-0 p-3 rounded-lg transition-all duration-200",
                  "disabled:cursor-not-allowed",
                  "active:scale-95",
                  isStreaming
                    ? "text-[#ff6b6b] hover:text-[#ff8a8a]"
                    : canSend || canGenerate
                      ? "flame-glow"
                      : "text-[#475569] opacity-50",
                ].join(" ")}
                aria-label={
                  isStreaming
                    ? "Stop generation"
                    : canGenerate
                      ? "Generate response"
                      : "Send message"
                }
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
                  ) : canSend || canGenerate ? (
                    <motion.div
                      key="flame"
                      initial={{ ...iconInitial, rotate: -30 }}
                      animate={{ ...iconAnimate, rotate: 0 }}
                      exit={{ ...iconExit, rotate: 30 }}
                      transition={iconTransition}
                    >
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

              <motion.button
                type="button"
                onClick={toggleListening}
                disabled={isStreaming}
                className={[
                  "shrink-0 p-2 rounded-lg transition-colors duration-200",
                  "disabled:cursor-not-allowed disabled:opacity-30",
                  "active:scale-95",
                  isListening
                    ? "text-[#f43f5e]"
                    : "text-[#475569] hover:text-[#64748b]",
                ].join(" ")}
                animate={
                  isListening
                    ? {
                        boxShadow: [
                          "0 0 0px rgba(244, 63, 94, 0)",
                          "0 0 12px rgba(244, 63, 94, 0.4)",
                          "0 0 0px rgba(244, 63, 94, 0)",
                        ],
                      }
                    : { boxShadow: "0 0 0px rgba(244, 63, 94, 0)" }
                }
                transition={
                  isListening
                    ? { duration: 1.5, repeat: Infinity, ease: "easeInOut" }
                    : { duration: 0.2 }
                }
                aria-label={isListening ? "Stop listening" : "Voice input"}
                title={isListening ? "Listening... click to stop" : "Voice input"}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill={isListening ? "currentColor" : "none"}
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="22" />
                </svg>
              </motion.button>
            </div>
          </div>

          <AnimatePresence>
            {isListening && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 40, opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: "easeInOut" }}
                className="overflow-hidden px-1"
              >
                <canvas
                  ref={canvasRef}
                  width={600}
                  height={40}
                  className="w-full h-[40px] block"
                />
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {isDisconnected && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: "easeInOut" }}
                className="overflow-hidden"
              >
                <div
                  className={[
                    "flex items-center justify-center gap-2 py-1.5 text-xs",
                    isReconnecting ? "text-[#eab308]" : "text-[#ef4444]",
                  ].join(" ")}
                >
                  <motion.div
                    className={[
                      "size-1.5 rounded-full shrink-0",
                      isReconnecting ? "bg-[#eab308]" : "bg-[#ef4444]",
                    ].join(" ")}
                    animate={{ opacity: [1, 0.3, 1] }}
                    transition={{
                      duration: isReconnecting ? 1.2 : 2,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                  />
                  <span className="font-body">
                    {isReconnecting
                      ? "Connection lost — reconnecting..."
                      : "Disconnected from server"}
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className={pilotClasses}>
            <div className="pilot-violet" />
            <div className="pilot-gradient" />
          </div>
        </div>

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
}
