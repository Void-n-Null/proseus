import type { ChatNode, Speaker } from "../../../../shared/types.ts";

/**
 * Props for the template-specific regenerate button component.
 *
 * Each design template provides its own visual variant (e.g. inline text
 * button for Forge, chevron overlay for Chub). The shared MessageItem
 * wrapper decides *when* to render; the template decides *how*.
 */
export interface RegenerateButtonProps {
  onRegenerate: (nodeId: string) => void;
  nodeId: string;
  isStreaming: boolean;
}

/**
 * Props for the template-specific message actions toolbar.
 *
 * Each design template provides its own visual variant (e.g. text buttons
 * for Forge, Lucide icons for Chub). The shared MessageItem wrapper
 * decides *when* to render and provides the callbacks; the template
 * decides *how* to render them.
 */
export interface MessageActionsProps {
  onEdit: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onSave: () => void;
  onCancel: () => void;
  isVisible: boolean;
  /** When true, show save/cancel instead of edit/copy/delete. */
  isEditing: boolean;
}

export interface MessageItemLayoutProps {
  node: ChatNode;
  speaker: Speaker | undefined;
  siblingInfo: { index: number; total: number } | null;
  chatId: string;
  isFirstInGroup: boolean;
  isLast: boolean;
  userName: string;
  isHovered: boolean;
  isEditing: boolean;
  isStreaming: boolean;
  onRegenerate?: (nodeId: string) => void;
  /** Current edit draft text — managed by the shared wrapper, passed down for the textarea. */
  editDraft: string;
  /** Called on every keystroke while editing. */
  onEditDraftChange: (value: string) => void;
  /** Save the current edit (no args — reads from editDraft). */
  handleEditSubmit: () => void;
  handleEditCancel: () => void;

  /**
   * When defined, a date divider should be rendered above this message.
   * Value is the epoch-ms timestamp of the message (used for formatting).
   */
  dateDividerDate?: number;

  /** Whether this is the very first message in the conversation (index 0). */
  isFirstMessage?: boolean;

  /** Character (non-user speaker) name — for beginning-of-conversation blocks. */
  characterName?: string | null;

  /** Character avatar URL — for beginning-of-conversation blocks. */
  characterAvatarUrl?: string | null;
}
