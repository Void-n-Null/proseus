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
}
