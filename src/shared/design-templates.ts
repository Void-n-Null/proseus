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
      "--color-surface": "rgb(18,18,20)",
      "--chat-message-font-family": "'Noto Sans', sans-serif",
      "--font-body": "'Noto Sans', sans-serif",
    },
  },
  chub: {
    id: "chub",
    label: "Chub",
    description: "Warm dark theme with amber accents.",
    tokenOverrides: {
      "--font-body": "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji'",
      "--font-body-weight": "400",
      "--color-background": "linear-gradient(to bottom, rgba(36, 37, 37, 1), rgb(36,36,36) 50%, rgba(36, 37, 37, 1) 100%)",
      "--color-surface": "#232424",
      "--chat-italic-color": "rgb(143, 142, 142)",
      "--chat-avatar-column-width": "50px",
      "--chat-avatar-column-width-mobile": "25px",
      "--chat-avatar-username-size": "1rem",
      "--chat-message-text-size": "1rem",
      "--chat-message-text-size-mobile": "1.111rem",
      "--chat-message-font-family": "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji'",
      "--color-text-body": "rgb(229, 224, 216)",
      /* MessageItem layout overrides */
      "--chat-message-max-width": "59vw",
      "--chat-message-max-width-mobile": "100%",
      "--chat-message-row-gap": "0.7rem",
      "--chat-message-bg": "rgb(38 38 38)",
      "--chat-message-bg-hover": "rgb(38 38 38)",
      "--chat-message-margin-t": "0.1rem",
      "--chat-message-margin-b": "0.1rem",
      "--chat-message-padding": "0.6rem 0.8rem 0.45rem 1rem",
      "--chat-message-border-radius": "0.125rem",
      "--chat-message-group-start-pt": "0.8rem",
      "--chat-message-px": "0.5rem",
      "--chat-message-content-pr": "0.5rem",
      "--chat-avatar-border-radius": "0.5rem",
      "--chat-streaming-padding": "0.75rem",
      "--chat-streaming-line-height": "1.4rem",
      /* Sidebar — dark navy palette inspired by Chub.ai */
      "--sidebar-bg": "#1a1a24",
      "--sidebar-surface": "#1e1e2a",
      "--sidebar-surface-raised": "#2a2a3a",
      "--sidebar-surface-hover": "#242432",
      "--sidebar-border": "#2a2a38",
      "--sidebar-text-body": "#f2f2f5",
      "--sidebar-text-muted": "#8888a0",
      "--sidebar-text-dim": "#606078",
      "--sidebar-primary": "#6e8cba",
      "--sidebar-destructive": "#cc4444",
      "--sidebar-tag-bg": "#2a2a3a",
      "--sidebar-tag-border": "#3a3a4c",
      "--sidebar-tag-text": "#d2d2de",
      "--sidebar-accent": "#6e8cba",
    },
  },
};

export function isDesignTemplateId(value: string): value is DesignTemplateId {
  return value === "forge" || value === "discord" || value === "chub";
}
