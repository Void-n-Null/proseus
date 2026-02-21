import React, { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useIsStreaming } from "../../stores/streaming.ts";
import { useConnectionStatus, type ConnectionStatus } from "../../stores/connection.ts";
import { useChatMutations } from "../../hooks/useMutations.ts";
import { usePersonas, useSetChatPersona } from "../../hooks/usePersonas.ts";
import { PersonaAvatar } from "../personas/PersonaSidebar.tsx";
import type { Persona } from "../../../shared/types.ts";

interface ComposerProps {
  chatId: string;
  lastNodeIdRef: React.RefObject<string | null>;
  userSpeakerId: string | null;
  personaId: string | null;
  /** Called after a user message is successfully persisted. */
  onMessageSent?: () => void;
  /** Cancel the active stream. */
  onCancel?: () => void;
}

/**
 * Forge-lineage composer with pilot light.
 *
 * Mirrors proseus-ai's ForgeInput:
 * - Transparent textarea, no box/border — just text floating
 * - 1px "pilot light" line beneath: dim violet idle, orange->rose->violet
 *   gradient when the user has typed something (the forge is lit)
 * - Ghost send button morphs: dim arrow -> gradient flame -> red stop square
 *   using motion's AnimatePresence for smooth icon transitions
 * - Background fades upward from #060b12 so messages dissolve into the input
 * - Hamburger menu on the left opens persona picker
 */
const Composer = React.memo(function Composer({
  chatId,
  lastNodeIdRef,
  userSpeakerId,
  personaId,
  onMessageSent,
  onCancel,
}: ComposerProps) {
  const [draft, setDraft] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const baseDraftRef = useRef("");

  // Web Audio API refs for waveform visualizer
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number>(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const isStreaming = useIsStreaming();
  const connectionStatus = useConnectionStatus();
  const isConnected = connectionStatus === "connected";
  const isReconnecting = connectionStatus === "reconnecting";
  const isDisconnected = connectionStatus === "disconnected" || isReconnecting;
  const { addMessage } = useChatMutations(chatId);

  // Persona data
  const { data: personaData } = usePersonas();
  const setPersonaMutation = useSetChatPersona();
  const personas = personaData?.personas ?? [];
  const activePersona = personas.find((p) => p.id === personaId) ?? null;

  const hasText = draft.trim().length > 0;
  const canSend = hasText && userSpeakerId !== null && isConnected;

  // Close menu when clicking outside
  useEffect(() => {
    if (!menuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  function selectPersona(id: string | null) {
    setMenuOpen(false);
    setPersonaMutation.mutate({ chatId, personaId: id });
  }

  const handleSend = useCallback(() => {
    const lastNodeId = lastNodeIdRef.current;
    if (!canSend || !lastNodeId || !userSpeakerId) return;

    const msg = draft.trim();
    addMessage
      .mutateAsync({
        parent_id: lastNodeId,
        speaker_id: userSpeakerId,
        is_bot: false,
        message: msg,
      })
      .then(() => {
        // Message persisted — trigger generation as a separate action.
        onMessageSent?.();
      })
      .catch(() => {
        // Mutation's own onError handles cache rollback.
      });

    setDraft("");

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [canSend, lastNodeIdRef, userSpeakerId, draft, addMessage, onMessageSent]);

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
      onCancel?.();
      return;
    }
    handleSend();
  }, [isStreaming, handleSend, onCancel]);

  // ── Audio visualizer helpers ──────────────────────────────────────
  const startVisualizer = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const ctx = new AudioContext();
      audioCtxRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.7;
      source.connect(analyser);
      analyserRef.current = analyser;

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const draw = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const canvasCtx = canvas.getContext("2d");
        if (!canvasCtx) return;

        animFrameRef.current = requestAnimationFrame(draw);
        analyser.getByteFrequencyData(dataArray);

        const { width, height } = canvas;
        canvasCtx.clearRect(0, 0, width, height);

        // Draw frequency bars as a centered waveform — forge gradient
        const barCount = Math.min(bufferLength, 64);
        const totalBarWidth = width * 0.85;
        const barWidth = totalBarWidth / barCount;
        const gap = 1;
        const startX = (width - totalBarWidth) / 2;

        for (let i = 0; i < barCount; i++) {
          const value = (dataArray[i] ?? 0) / 255;
          const barHeight = Math.max(2, value * height * 0.85);

          // Gradient: orange -> rose -> violet across the bars
          const t = i / barCount;
          let r: number, g: number, b: number;
          if (t < 0.5) {
            // orange(249,115,22) -> rose(244,63,94)
            const p = t * 2;
            r = 249 + (244 - 249) * p;
            g = 115 + (63 - 115) * p;
            b = 22 + (94 - 22) * p;
          } else {
            // rose(244,63,94) -> violet(139,92,246)
            const p = (t - 0.5) * 2;
            r = 244 + (139 - 244) * p;
            g = 63 + (92 - 63) * p;
            b = 94 + (246 - 94) * p;
          }

          const alpha = 0.6 + value * 0.4;
          canvasCtx.fillStyle = `rgba(${r | 0}, ${g | 0}, ${b | 0}, ${alpha})`;

          const x = startX + i * barWidth;
          const y = (height - barHeight) / 2;
          canvasCtx.beginPath();
          canvasCtx.roundRect(x, y, barWidth - gap, barHeight, 1.5);
          canvasCtx.fill();
        }
      };

      draw();
    } catch (err) {
      console.error("Failed to start audio visualizer:", err);
    }
  }, []);

  const stopVisualizer = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = 0;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    analyserRef.current = null;

    // Clear canvas
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }
  }, []);

  // Cleanup speech recognition + visualizer on unmount
  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      stopVisualizer();
    };
  }, [stopVisualizer]);

  // Auto-resize textarea when draft changes (e.g., from speech input)
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const lineHeight = parseInt(getComputedStyle(el).lineHeight) || 24;
    const maxHeight = lineHeight * 20;
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, [draft]);

  const toggleListening = useCallback(() => {
    if (isListening) {
      recognitionRef.current?.stop();
      stopVisualizer();
      return;
    }

    const SpeechRecognitionAPI =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      console.warn("Speech recognition not supported in this browser.");
      return;
    }

    baseDraftRef.current = draft;

    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognitionRef.current = recognition;

    recognition.onresult = (event: any) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      const base = baseDraftRef.current.trimEnd();
      const separator = base ? " " : "";
      setDraft(base + separator + transcript);
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
      stopVisualizer();
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error:", event.error);
      setIsListening(false);
      recognitionRef.current = null;
      stopVisualizer();
    };

    // Start both recognition and the audio visualizer
    recognition.start();
    startVisualizer();
    setIsListening(true);
  }, [isListening, draft, startVisualizer, stopVisualizer]);

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
      className="shrink-0 pt-0 pb-[max(1rem,env(safe-area-inset-bottom))] md:px-6 bg-[linear-gradient(to_top,var(--color-background)_60%,transparent_100%)]"
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
            {/* Hamburger menu — persona picker */}
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
                  /* Hamburger icon */
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

              {/* Persona dropdown — opens upward from the composer */}
              {menuOpen && (
                <div
                  className="absolute bottom-[calc(100%+6px)] left-0 min-w-[200px] bg-surface border border-border rounded-lg shadow-[0_-4px_20px_rgba(0,0,0,0.45)] z-50 overflow-hidden p-1"
                >
                  <div
                    className="px-2 pt-[0.35rem] pb-1 text-[0.65rem] font-semibold text-text-dim uppercase tracking-[0.05em]"
                  >
                    Persona
                  </div>
                  <PersonaPickerItem
                    label="No persona"
                    active={personaId === null}
                    onClick={() => selectPersona(null)}
                  />
                  {personas.length > 0 && (
                    <div
                      className="h-px bg-border my-1"
                    />
                  )}
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
                      <span
                        className="flex-1 whitespace-nowrap overflow-hidden text-ellipsis"
                      >
                        {p.name}
                      </span>
                      {p.is_global && (
                        <span
                          className="text-[0.6rem] px-1 bg-[oklch(0.20_0.04_280)] text-[oklch(0.55_0.10_280)] rounded-sm"
                        >
                          global
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Textarea — transparent, floating text */}
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              disabled={isStreaming || isDisconnected}
              placeholder={
                isDisconnected
                  ? "Reconnecting to server..."
                  : isStreaming
                    ? "Generating..."
                    : "Send a message..."
              }
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

            {/* Send + Mic buttons — stacked vertically */}
            <div className="flex flex-col items-center gap-0.5">
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

              {/* Microphone button — Web Speech API STT */}
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

          {/* Waveform visualizer — appears when mic is active */}
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

          {/* Connection status banner — shown when WS is disconnected */}
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
                  {/* Pulsing dot */}
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

function PersonaPickerItem({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "w-full px-2 py-[0.4rem] border-none rounded-sm cursor-pointer",
        "text-[0.78rem] text-left transition-[background] duration-100",
        active
          ? "bg-surface-hover text-text-body"
          : "bg-transparent text-text-dim",
      ].join(" ")}
      onMouseEnter={(e) => {
        if (!active)
          (e.currentTarget as HTMLButtonElement).style.background =
            "var(--color-surface-hover)";
      }}
      onMouseLeave={(e) => {
        if (!active)
          (e.currentTarget as HTMLButtonElement).style.background =
            "transparent";
      }}
    >
      {label}
    </button>
  );
}

export default Composer;
