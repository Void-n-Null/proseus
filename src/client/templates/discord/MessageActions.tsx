import React from "react";
import { Check, X } from "lucide-react";
import type { MessageActionsProps } from "../../components/chat/message-item/types.ts";

/**
 * Discord message actions — compact text-label toolbar positioned at the
 * top-right of the message row.
 *
 * In edit mode, shows Save (checkmark) and Cancel (X) icons instead.
 */
export default function DiscordMessageActions({
  onEdit,
  onCopy,
  onDelete,
  onSave,
  onCancel,
  isVisible,
  isEditing,
}: MessageActionsProps) {
  if (!isVisible) return null;

  if (isEditing) {
    const editBtnClass =
      "p-1.5 rounded-full text-[hsl(214_8%_62%)] hover:text-[hsl(214_10%_86%)] hover:bg-[hsl(228_6%_18%)] transition-colors duration-150 cursor-pointer";

    return (
      <div className="absolute top-0 right-4 flex items-center gap-0.5 z-10">
        <button type="button" onClick={onSave} className={`${editBtnClass} hover:text-emerald-400!`} aria-label="Save">
          <Check width={16} height={16} />
        </button>
        <button type="button" onClick={onCancel} className={editBtnClass} aria-label="Cancel">
          <X width={16} height={16} />
        </button>
      </div>
    );
  }

  const btnClass =
    "py-[0.2rem] px-[0.45rem] bg-[#1a1a1a] text-[#999] border border-[#2a2a2a] rounded-[3px] cursor-pointer text-[0.7rem] leading-none whitespace-nowrap";

  return (
    <div className="absolute top-0 right-4 flex gap-[0.2rem] p-[0.2rem] bg-[#0e0e0e] border border-[#222] rounded-[4px] z-10">
      <button type="button" onClick={onEdit} className={btnClass}>
        Edit
      </button>
      <button type="button" onClick={onCopy} className={btnClass}>
        Copy
      </button>
      <button
        type="button"
        onClick={onDelete}
        className={`${btnClass} text-[#c44]!`}
      >
        Delete
      </button>
    </div>
  );
}
