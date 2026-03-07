import type { TemplateModule } from "../types.ts";
import type { VisualizerDrawFn } from "../../components/chat/composer/types.ts";
import DiscordMessageItem from "./MessageItem.tsx";
import DiscordComposer from "./Composer.tsx";
import DiscordChatHeader from "./ChatHeader.tsx";
import DiscordRegenerateButton from "./RegenerateButton.tsx";
import DiscordMessageActions from "./MessageActions.tsx";
import DiscordSidebar from "./Sidebar.tsx";
import DiscordDesktopTopBar from "./DesktopTopBar.tsx";

/**
 * Discord-style audio visualizer.
 *
 * A single smooth stroke line centered in the canvas, half-width and
 * horizontally centered. Blurple (#5865F2) with a faint glow — quiet and
 * understated like Discord's own voice indicators.
 */
const drawDiscordVisualizer: VisualizerDrawFn = (canvas, ctx, dataArray) => {
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);

  const midY = height / 2;
  const waveWidth = width * 0.5;
  const offsetX = (width - waveWidth) / 2;

  // Only use the speech-relevant frequency range (~85Hz-5kHz).
  // With fftSize=256 at 48kHz each bin ≈ 187Hz, so bins 0-26 cover
  // the range where human voice actually produces energy. Sampling the
  // full 128-bin spectrum would leave the upper half dead.
  const binStart = 1;  // skip DC offset
  const binEnd = Math.min(dataArray.length, 28);
  const usableBins = binEnd - binStart;
  const sampleCount = Math.min(usableBins, 40);
  const step = Math.max(1, Math.floor(usableBins / sampleCount));

  const amplitudes: number[] = [];
  for (let i = 0; i < sampleCount; i++) {
    amplitudes.push((dataArray[binStart + i * step] ?? 0) / 255);
  }

  // Build smooth path via Catmull-Rom
  const catmullRom = (
    p0: number, p1: number, p2: number, p3: number, t: number,
  ): number => {
    const t2 = t * t;
    const t3 = t2 * t;
    return 0.5 * (
      (2 * p1) +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3
    );
  };

  const resolution = sampleCount * 4;
  const points: { x: number; y: number }[] = [];

  for (let i = 0; i < resolution; i++) {
    const t = i / (resolution - 1);
    const fIdx = t * (sampleCount - 1);
    const idx = Math.floor(fIdx);
    const frac = fIdx - idx;

    const p0 = amplitudes[Math.max(0, idx - 1)] ?? 0;
    const p1 = amplitudes[idx] ?? 0;
    const p2 = amplitudes[Math.min(sampleCount - 1, idx + 1)] ?? 0;
    const p3 = amplitudes[Math.min(sampleCount - 1, idx + 2)] ?? 0;

    const amp = catmullRom(p0, p1, p2, p3, frac);
    const x = offsetX + t * waveWidth;
    // Displacement from center — subtle, capped at ~40% of half-height
    const displacement = amp * midY * 0.4;

    points.push({ x, y: midY - displacement });
  }

  // Soft glow underneath
  ctx.save();
  ctx.filter = "blur(4px)";
  ctx.strokeStyle = "rgba(88, 101, 242, 0.25)";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  for (let i = 0; i < points.length; i++) {
    const pt = points[i]!;
    if (i === 0) ctx.moveTo(pt.x, pt.y);
    else ctx.lineTo(pt.x, pt.y);
  }
  ctx.stroke();
  ctx.restore();

  // Main stroke
  ctx.strokeStyle = "rgba(88, 101, 242, 0.55)";
  ctx.lineWidth = 1.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  for (let i = 0; i < points.length; i++) {
    const pt = points[i]!;
    if (i === 0) ctx.moveTo(pt.x, pt.y);
    else ctx.lineTo(pt.x, pt.y);
  }
  ctx.stroke();
};

export const discordTemplate: TemplateModule = {
  MessageItem: DiscordMessageItem,
  Composer: DiscordComposer,
  ChatHeader: DiscordChatHeader,
  RegenerateButton: DiscordRegenerateButton,
  MessageActions: DiscordMessageActions,
  Sidebar: DiscordSidebar,
  DesktopTopBar: DiscordDesktopTopBar,
  messageListClassName: "w-full",
  placeholder: (personaName, { isDisconnected }) => {
    if (isDisconnected) return "Reconnecting to server...";
    return personaName ? `Message @${personaName}` : "Message ...";
  },
  drawVisualizer: drawDiscordVisualizer,
};
