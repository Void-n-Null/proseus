import React from "react";
import { ChevronRight } from "lucide-react";
import type { RegenerateButtonProps } from "../../components/chat/message-item/types.ts";

/**
 * Chub regenerate button — a subtle chevron positioned at the center-right
 * of the message row. Appears on hover via the parent's group-hover.
 */
export default function ChubRegenerateButton({
  onRegenerate,
  nodeId,
  isStreaming,
}: RegenerateButtonProps) {
  if (isStreaming) return null;

  return (
    <button
      type="button"
      onClick={() => onRegenerate(nodeId)}
      className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 flex items-center justify-center w-6 h-10 rounded-full text-text-dim hover:text-text-body hover:bg-surface-hover opacity-0 group-hover/message:opacity-100 transition-all duration-150 cursor-pointer"
      aria-label="Regenerate"
    >
      <ChevronRight width="18" height="18" />
    </button>
  );
}
