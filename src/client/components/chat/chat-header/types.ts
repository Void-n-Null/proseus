import type React from "react";

export interface ChatHeaderLayoutProps {
  chatName: string;
  isMobile: boolean;
  onBack?: () => void;

  /* Export menu */
  isExporting: boolean;
  exportMenuOpen: boolean;
  setExportMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  exportMenuRef: React.RefObject<HTMLDivElement | null>;
  onExport: (format: "chat" | "jsonl" | "txt") => void;
}
