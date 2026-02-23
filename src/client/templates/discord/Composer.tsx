import React from "react";
import { AnimatePresence, motion } from "motion/react";
import { PersonaAvatar } from "../../components/personas/PersonaSidebar.tsx";
import type { ComposerLayoutProps } from "../../components/chat/composer/types.ts";
import PersonaPickerItem from "../../components/chat/composer/PersonaPickerItem.tsx";

export default function DiscordComposer({
  menuOpen,
  setMenuOpen,
  menuRef,
  textareaRef,
  canvasRef,
  personas,
  personaId,
  placeholder,
  isStreaming,
  isDisconnected,
  isReconnecting,
  isListening,
  canSend,
  canGenerate,
  handleInput,
  handleKeyDown,
  handleButtonClick,
  toggleListening,
  selectPersona,
  draft,
}: ComposerLayoutProps) {
  return (
    <div className="shrink-0 pb-[max(0.5rem,env(safe-area-inset-bottom))] px-2" style={{ fontFamily: "var(--discord-font)" }}>
      <div className="max-w-none mx-auto">
        <div className="relative pb-[0.3rem]">
            <div className="relative min-h-[3.5rem] max-h-[30rem] flex items-end gap-2 rounded-[10px] border border-[#404040]/20 bg-[#222327] px-3 py-2">
            <div ref={menuRef} className="relative self-start">
              <button
                type="button"
                onClick={() => setMenuOpen(!menuOpen)}
                title="Composer actions"
                className="shrink-0 p-1 ml-[-0.5px] pt-1.5 rounded-lg transition-all duration-200 bg-transparent border-none cursor-pointer text-[#b9bbbe] hover:text-white"
              >
                <svg
                  width="25"
                  height="25"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>

              {menuOpen && (
                <div className="absolute bottom-[calc(100%+6px)] left-0 min-w-[200px] max-w-[calc(100vw-1rem)] bg-surface border border-border rounded-lg shadow-[0_-4px_20px_rgba(0,0,0,0.45)] z-50 overflow-hidden p-1">
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
              rows={1}
              className={[
                "flex-1 pl-[0.75rem]",
                "resize-none bg-transparent",
                "text-white placeholder-[#72767d]",
                "focus:outline-none",
                "text-[1rem] font-sans font-[360]",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                "my-auto",
              ].join(" ")}
            />

            <div className="flex items-center gap-1.5 self-center">
              <motion.button
                type="button"
                onClick={toggleListening}
                disabled={isStreaming}
                className={[
                  "shrink-0 p-1.5 rounded-md transition-colors duration-200",
                  "disabled:cursor-not-allowed disabled:opacity-30",
                  isListening
                    ? "text-[#f43f5e]"
                    : "text-[#b9bbbe] hover:text-white",
                ].join(" ")}
                animate={
                  isListening
                    ? {
                        boxShadow: [
                          "0 0 0px rgba(244, 63, 94, 0)",
                          "0 0 10px rgba(244, 63, 94, 0.35)",
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

              <button
                type="button"
                onClick={handleButtonClick}
                disabled={!isStreaming && !canSend && !canGenerate}
                className={[
                  "shrink-0 p-1.5 rounded-md transition-colors duration-200",
                  "disabled:cursor-not-allowed",
                  isStreaming
                    ? "text-[#ff6b6b]"
                    : canSend || canGenerate
                      ? "text-white"
                      : "text-[#72767d]",
                ].join(" ")}
                aria-label={
                  isStreaming
                    ? "Stop generation"
                    : canGenerate
                      ? "Generate response"
                      : "Send message"
                }
              >
                {isStreaming ? (
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  </svg>
                ) : (
                  <svg
                    width="18"
                    height="18"
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
                )}
              </button>
            </div>
          </div>

          <AnimatePresence>
            {isListening && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 24, opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: "easeInOut" }}
                className="overflow-hidden"
              >
                <canvas
                  ref={canvasRef}
                  width={600}
                  height={24}
                  className="w-full h-[24px] block"
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
