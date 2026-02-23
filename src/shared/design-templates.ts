export type DesignTemplateId = "forge" | "discord" | "chub";

export interface DesignTemplate {
  id: DesignTemplateId;
  label: string;
  description: string;
  tokenOverrides: Partial<Record<string, string>>;
}

/**
 * Built-in design templates bundled with the app.
 */
export const DESIGN_TEMPLATES: Record<DesignTemplateId, DesignTemplate> = {
  forge: {
    id: "forge",
    label: "Forge",
    description: "Default Proseus look.",
    tokenOverrides: {
      "--color-text-body": "rgb(255, 255, 255)",
    },
  },
  discord: {
    id: "discord",
    label: "Discord",
    description: "Discord-inspired dark theme.",
    tokenOverrides: {
      "--color-background": "oklch(0.215 0.009 280)",
    },
  },
  chub: {
    id: "chub",
    label: "Chub",
    description: "Warm dark theme with amber accents.",
    tokenOverrides: {
      "--color-background": "#232424",
      "--color-surface": "#232424",
      "--chat-italic-color": "rgb(143, 142, 142)",
      "--chat-avatar-column-width": "50px",
      "--chat-avatar-column-width-mobile": "25px",
      "--chat-avatar-username-size": "1rem",
      "--chat-message-text-size": "1rem",
      "--chat-message-text-size-mobile": "0.9rem",
      "--chub-font": "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji'",
      "--color-text-body": "rgb(229, 224, 216)",
    },
  },
};

export function isDesignTemplateId(value: string): value is DesignTemplateId {
  return value === "forge" || value === "discord" || value === "chub";
}
