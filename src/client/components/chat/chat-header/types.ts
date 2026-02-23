import type React from "react";

export interface ChatHeaderLayoutProps {
  chatName: string;
  isMobile: boolean;
  onBack?: () => void;
  showAppShellHeader?: boolean;
  onToggleAppShellHeader?: () => void;

  /* Character info (for templates that show the avatar in the header) */
  characterName: string | null;
  characterAvatarUrl: string | null;
  characterColor: string | null;

  /* Export menu */
  isExporting: boolean;
  exportMenuOpen: boolean;
  setExportMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  exportMenuRef: React.RefObject<HTMLDivElement | null>;
  onExport: (format: "chat" | "jsonl" | "txt") => void;
}
