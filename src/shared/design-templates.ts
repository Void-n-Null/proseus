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
    tokenOverrides: {},
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
      "--color-background": "oklch(0.18 0.02 60)",
      "--color-surface": "oklch(0.21 0.018 55)",
      "--color-surface-raised": "oklch(0.24 0.02 55)",
      "--color-surface-hover": "oklch(0.26 0.022 55)",
      "--color-primary": "oklch(0.75 0.15 70)",
      "--color-primary-hover": "oklch(0.80 0.16 70)",
      "--color-border": "oklch(0.30 0.025 55)",
      "--color-border-subtle": "oklch(0.25 0.02 55)",
    },
  },
};

export function isDesignTemplateId(value: string): value is DesignTemplateId {
  return value === "forge" || value === "discord" || value === "chub";
}
