import React from "react";
import { AnimatePresence, motion } from "motion/react";
import { PersonaAvatar } from "../../components/personas/PersonaSidebar.tsx";
import type { ComposerLayoutProps } from "../../components/chat/composer/types.ts";
import PersonaPickerItem from "../../components/chat/composer/PersonaPickerItem.tsx";
import { EllipsisVerticalIcon } from "lucide-react";

export default function ChubComposer({
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
  isStreaming,
  isDisconnected,
  isReconnecting,
  isListening,
  canSend,
  canGenerate,
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
  const composerPlaceholder =
    "Press the button to send a message, or enter for a linebreak.";

  return (
    <div className="shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="relative w-full h-[1.5px] md:from-neutral-850 md:via-neutral-900 md:to-neutral-850 md:h-[3px]"></div>
      <div className="w-full sm:max-w-[60vw] sm:mx-auto sm:pl-1 sm:pr-3">
        <div
          className="relative"
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
        >
          <div
            className={[
              "relative flex items-stretch gap-2 md:rounded-[6px] md:px-2 pb-1 bg-neutral-800",
            ].join(" ")}
          >
            <div ref={menuRef} className="relative flex items-center pl-2.5 pt-3">
              <button
                type="button"
                onClick={() => setMenuOpen(!menuOpen)}
                title={activePersona ? `Persona: ${activePersona.name}` : "Set persona"}
                className={[
                  "shrink-0 p-1 rounded-md transition-colors duration-150",
                  "bg-transparent hover:bg-black/15 border-none cursor-pointer ",
                  menuOpen ? "text-[#3498db]" : "text-[#3498db] hover:text-[#3498db]",
                ].join(" ")}
              >
                <EllipsisVerticalIcon width="22" height="22" className="text-[#3498db]" />
              </button>

              {menuOpen && (
                <div className="absolute bottom-[calc(100%+6px)] left-0 min-w-[220px] max-w-[calc(100vw-1rem)] rounded-md border border-white/10 bg-[#1e1f22] shadow-[0_-8px_22px_rgba(0,0,0,0.5)] z-50 overflow-hidden p-1">
                  <div className="px-2 pt-[0.35rem] pb-1 text-[0.6rem] text-[#78859a] uppercase tracking-[0.06em]">
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
                        "text-[0.76rem] text-left transition-[background] duration-100",
                        personaId === p.id
                          ? "bg-[#2f3238] text-[#d2dae7]"
                          : "bg-transparent text-[#c6ccd8]",
                      ].join(" ")}
                      onMouseEnter={(e) => {
                        if (personaId !== p.id)
                          (e.currentTarget as HTMLButtonElement).style.background =
                            "#282b31";
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
                        <span className="text-[0.6rem] px-1 rounded-sm bg-[#343944] text-[#93a0b8]">
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
              placeholder={composerPlaceholder}
              rows={3}
              className={[
                "flex-1 min-h-[84px] pr-2 pl-2.5 pt-4",
                "resize-none bg-transparent",
                "text-[#c8d3e6] placeholder-neutral-600",
                "focus:outline-none",
                "leading-6 text-[1rem]",
                "disabled:opacity-50 disabled:cursor-not-allowed",
              ].join(" ")}
            />

            <div className="flex flex-col items-center justify-between md:py-2">
            {!textareaRef.current?.value && !isListening && (
              <motion.button
                type="button"
                onClick={toggleListening}
                disabled={isStreaming}
                className={[
                  "shrink-0 p-2 rounded-md transition-colors duration-150",
                  "disabled:cursor-not-allowed disabled:opacity-30",
                  "active:scale-95",
                  isListening
                    ? "text-[#8ea3c3]"
                    : "text-[#5f6e84] hover:text-[#8ea3c3]",
                ].join(" ")}
                animate={
                  isListening
                    ? {
                        opacity: [1, 0.45, 1],
                      }
                    : { opacity: 1 }
                }
                transition={
                  isListening
                    ? { duration: 1.2, repeat: Infinity, ease: "easeInOut" }
                    : { duration: 0.15 }
                }
                aria-label={isListening ? "Stop listening" : "Voice input"}
                title={isListening ? "Listening... click to stop" : "Voice input"}
              >
                <svg
                  width="22"
                  height="22"
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
              )}
              

              <button
                type="button"
                onClick={handleButtonClick}
                disabled={!isStreaming && !canSend && !canGenerate}
                className={[
                  "shrink-0 p-2 rounded-md transition-colors duration-150",
                  "disabled:cursor-not-allowed",
                  "active:scale-95",
                  isStreaming
                    ? "text-[#c98a8a]"
                    : canSend || canGenerate
                      ? "text-[#8ea3c3]"
                      : "text-[#5f6e84] opacity-50",
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
                  ) : (
                    <motion.div
                      key="up"
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
                        <path d="M12 19V5" />
                        <path d="m6 11 6-6 6 6" />
                      </svg>
                    </motion.div>
                  )}
                </AnimatePresence>
              </button>
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

        </div>
      </div>
    </div>
  );
}
