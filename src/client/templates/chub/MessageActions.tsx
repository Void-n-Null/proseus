import React from "react";
import { PenLine, Clipboard, Trash, Check, X } from "lucide-react";
import type { MessageActionsProps } from "../../components/chat/message-item/types.ts";

/**
 * Chub message actions — icon-only toolbar with Lucide icons.
 * No container background; each button is transparent with bg-white/5
 * on hover and rounded-full.
 *
 * In edit mode, shows Save (checkmark) and Cancel (X) icons instead.
 */
export default function ChubMessageActions({
  onEdit,
  onCopy,
  onDelete,
  onSave,
  onCancel,
  isVisible,
  isEditing,
}: MessageActionsProps) {
  if (!isVisible) return null;

  const btnClass =
    "p-1.5 rounded-full text-text-dim hover:text-text-body hover:bg-white/5 transition-colors duration-150 cursor-pointer";

  if (isEditing) {
    return (
      <div className="absolute top-0 right-4 flex items-center gap-0.5 z-10">
        <button type="button" onClick={onSave} className={`${btnClass} hover:text-emerald-400!`} aria-label="Save">
          <Check width={14} height={14} />
        </button>
        <button type="button" onClick={onCancel} className={btnClass} aria-label="Cancel">
          <X width={14} height={14} />
        </button>
      </div>
    );
  }

  return (
    <div className="absolute top-0 right-4 flex items-center gap-0.5 z-10">
      <button type="button" onClick={onEdit} className={btnClass} aria-label="Edit">
        <PenLine width={14} height={14} />
      </button>
      <button type="button" onClick={onCopy} className={btnClass} aria-label="Copy">
        <Clipboard width={14} height={14} />
      </button>
      <button
        type="button"
        onClick={onDelete}
        className={`${btnClass} hover:text-[#c44]!`}
        aria-label="Delete"
      >
        <Trash width={14} height={14} />
      </button>
    </div>
  );
}
