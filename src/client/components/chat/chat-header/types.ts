import type React from "react";
import type { DesignTemplateId } from "../../../../shared/design-templates.ts";

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

  /* Export */
  isExporting: boolean;
  onExport: (format: "chat" | "jsonl" | "txt") => void;

  /* Model dashboard */
  onOpenModelDashboard: () => void;

  /* Design template / theme switching */
  designTemplateId: DesignTemplateId;
  onSelectDesignTemplate: (id: DesignTemplateId) => void;
}
