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
      "--color-background": "#1a1a1e",
      "--discord-font": "'Noto Sans', sans-serif",
      "--chat-message-font-family": "'Noto Sans', sans-serif",
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
      /* MessageItem layout overrides */
      "--chat-message-max-width": "59vw",
      "--chat-message-max-width-mobile": "100%",
      "--chat-message-row-gap": "0.7rem",
      "--chat-message-bg": "rgb(38 38 38 / 0.5)",
      "--chat-message-bg-hover": "rgb(38 38 38 / 0.5)",
      "--chat-message-margin-y": "0.1rem",
      "--chat-message-border-radius": "0.125rem",
      "--chat-message-group-start-pt": "0.8rem",
      "--chat-message-px": "0.5rem",
      "--chat-message-content-pr": "0.5rem",
      "--chat-avatar-border-radius": "0.5rem",
      "--chat-streaming-padding": "0.75rem",
      "--chat-streaming-line-height": "1.4rem",
    },
  },
};

export function isDesignTemplateId(value: string): value is DesignTemplateId {
  return value === "forge" || value === "discord" || value === "chub";
}
