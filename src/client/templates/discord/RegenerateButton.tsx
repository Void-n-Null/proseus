import React from "react";
import type { RegenerateButtonProps } from "../../components/chat/message-item/types.ts";

/**
 * Discord regenerate button — inline text button with hand-drawn refresh icon,
 * styled to match Discord's muted color palette.
 */
export default function DiscordRegenerateButton({
  onRegenerate,
  nodeId,
  isStreaming,
}: RegenerateButtonProps) {
  if (isStreaming) return null;

  return (
    <div className="pl-14 sm:pl-[4.5rem] pr-3 sm:pr-12">
      <button
        type="button"
        onClick={() => onRegenerate(nodeId)}
        className="mt-1 flex items-center gap-1.5 px-2 py-0.5 rounded text-[0.75rem] text-[hsl(214_8%_62%)] hover:text-[hsl(214_10%_86%)] hover:bg-[hsl(228_6%_18%)] transition-colors duration-150 cursor-pointer"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
          <path d="M3 3v5h5" />
          <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
          <path d="M16 16h5v5" />
        </svg>
        Regenerate
      </button>
    </div>
  );
}
