import React from "react";
import { RefreshCcw } from "lucide-react";
import type { RegenerateButtonProps } from "../../components/chat/message-item/types.ts";

/**
 * Forge regenerate button — inline text button beneath the message.
 */
export default function ForgeRegenerateButton({
  onRegenerate,
  nodeId,
  isStreaming,
}: RegenerateButtonProps) {
  if (isStreaming) return null;

  return (
    <div
      className="flex px-2.5 sm:px-4"
      style={{
        paddingLeft: `calc(var(--chat-avatar-column-width-active) + var(--chat-message-row-gap) + 0.625rem)`,
      }}
    >
      <button
        type="button"
        onClick={() => onRegenerate(nodeId)}
        className="mt-1.5 flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs text-text-dim hover:text-text-body hover:bg-surface-hover transition-colors duration-150 cursor-pointer"
      >
        <RefreshCcw
          width="14"
          height="14"
          className="text-[var(--color-background-elevated)]"
        />
        Regenerate
      </button>
    </div>
  );
}
