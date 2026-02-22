import React, { useState, useCallback, useRef, useEffect } from "react";
import { useIsStreaming } from "../../stores/streaming.ts";
import { useConnectionStatus } from "../../stores/connection.ts";
import { useChatMutations } from "../../hooks/useMutations.ts";
import { usePersonas, useSetChatPersona } from "../../hooks/usePersonas.ts";
import { useDesignTemplateId } from "../../hooks/useDesignTemplate.ts";
import ForgeComposerLayout from "./composer/ForgeComposerLayout.tsx";
import DiscordComposerLayout from "./composer/DiscordComposerLayout.tsx";

interface ComposerProps {
  chatId: string;
  lastNodeIdRef: React.RefObject<string | null>;
  userSpeakerId: string | null;
  personaId: string | null;
  onMessageSent?: () => void;
  onCancel?: () => void;
  onGenerate?: () => void;
  lastMessageIsUser?: boolean;
}

const Composer = React.memo(function Composer({
  chatId,
  lastNodeIdRef,
  userSpeakerId,
  personaId,
  onMessageSent,
  onCancel,
  onGenerate,
  lastMessageIsUser = false,
}: ComposerProps) {
  const [draft, setDraft] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const baseDraftRef = useRef("");

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number>(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const isStreaming = useIsStreaming();
  const connectionStatus = useConnectionStatus();
  const isConnected = connectionStatus === "connected";
  const isReconnecting = connectionStatus === "reconnecting";
  const isDisconnected =
    connectionStatus === "disconnected" || isReconnecting;
  const { addMessage } = useChatMutations(chatId);

  const { data: personaData } = usePersonas();
  const setPersonaMutation = useSetChatPersona();
  const personas = personaData?.personas ?? [];
  const activePersona = personas.find((p) => p.id === personaId) ?? null;

  const designTemplateId = useDesignTemplateId();
  const isDiscordTemplate = designTemplateId === "discord";

  const hasText = draft.trim().length > 0;
  const canSend = hasText && userSpeakerId !== null && isConnected;
  const canGenerate =
    lastMessageIsUser && !hasText && !isStreaming && isConnected;
  const placeholder = isDiscordTemplate
    ? isDisconnected
      ? "Reconnecting to server..."
      : `Message ${activePersona ? `@${activePersona.name}` : "..."}`
    : isDisconnected
      ? "Reconnecting to server..."
      : isStreaming
        ? "Generating..."
        : "Send a message...";

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

  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDraft(e.target.value);

    const el = e.target;
    el.style.height = "auto";
    const lineHeight = parseInt(getComputedStyle(el).lineHeight) || 24;
    const maxHeight = lineHeight * 20;
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, []);

  const handleButtonClick = useCallback(() => {
    if (isStreaming) {
      onCancel?.();
      return;
    }
    if (canSend) {
      handleSend();
      return;
    }
    if (canGenerate) {
      onGenerate?.();
    }
  }, [isStreaming, canSend, canGenerate, handleSend, onCancel, onGenerate]);

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

        const barCount = Math.min(bufferLength, 64);
        const totalBarWidth = width * 0.85;
        const barWidth = totalBarWidth / barCount;
        const gap = 1;
        const startX = (width - totalBarWidth) / 2;

        for (let i = 0; i < barCount; i++) {
          const value = (dataArray[i] ?? 0) / 255;
          const barHeight = Math.max(2, value * height * 0.85);

          const t = i / barCount;
          let r: number, g: number, b: number;
          if (t < 0.5) {
            const p = t * 2;
            r = 249 + (244 - 249) * p;
            g = 115 + (63 - 115) * p;
            b = 22 + (94 - 22) * p;
          } else {
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

    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }
  }, []);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      stopVisualizer();
    };
  }, [stopVisualizer]);

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

    recognition.start();
    startVisualizer();
    setIsListening(true);
  }, [isListening, draft, startVisualizer, stopVisualizer]);

  const pilotClasses = [
    "pilot-light",
    hasText ? "pilot-hot" : "",
    isFocused ? "pilot-focused" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const iconTransition = { duration: 0.15 };
  const iconInitial = { scale: 0.8, opacity: 0 };
  const iconAnimate = { scale: 1, opacity: 1 };
  const iconExit = { scale: 0.8, opacity: 0 };

  const sharedProps = {
    draft,
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
  };

  return isDiscordTemplate ? (
    <DiscordComposerLayout {...sharedProps} />
  ) : (
    <ForgeComposerLayout {...sharedProps} />
  );
});

export default Composer;
