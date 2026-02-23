import type { ChatNode, Speaker } from "../../../../shared/types.ts";

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
  onRegenerate?: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  handleEditSubmit: (message: string) => void;
  handleEditCancel: () => void;
  handleStartEdit: () => void;

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
