import type React from "react";
import type { Persona } from "../../../../shared/types.ts";

/**
 * Signature for a custom audio-visualizer draw function.
 *
 * Templates can supply their own renderer to replace the default bar-chart
 * equalizer. The function receives the canvas, its 2D context, and the
 * current frequency data snapshot and is called once per animation frame.
 */
export type VisualizerDrawFn = (
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  dataArray: Uint8Array,
) => void;

export interface ComposerLayoutProps {
  draft: string;
  isFocused: boolean;
  setIsFocused: (focused: boolean) => void;
  menuOpen: boolean;
  setMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  menuRef: React.RefObject<HTMLDivElement | null>;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  personas: Persona[];
  activePersona: Persona | null;
  personaId: string | null;
  placeholder: string;
  isStreaming: boolean;
  isDisconnected: boolean;
  isReconnecting: boolean;
  isListening: boolean;
  canSend: boolean;
  canGenerate: boolean;
  pilotClasses: string;
  iconTransition: { duration: number };
  iconInitial: { scale: number; opacity: number };
  iconAnimate: { scale: number; opacity: number };
  iconExit: { scale: number; opacity: number };
  handleInput: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  handleKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  handleButtonClick: () => void;
  toggleListening: () => void;
  selectPersona: (id: string | null) => void;
}
