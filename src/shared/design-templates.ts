export type DesignTemplateId = "forge" | "discord";

export interface DesignTemplate {
  id: DesignTemplateId;
  label: string;
  description: string;
  tokenOverrides: Partial<Record<"--color-background", string>>;
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
    description: "Discord-inspired background tone.",
    tokenOverrides: {
      "--color-background": "oklch(0.215 0.009 280)",
    },
  },
};

export function isDesignTemplateId(value: string): value is DesignTemplateId {
  return value === "forge" || value === "discord";
}
