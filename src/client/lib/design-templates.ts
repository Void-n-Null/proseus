import {
  DESIGN_TEMPLATES,
  isDesignTemplateId,
  type DesignTemplateId,
} from "../../shared/design-templates.ts";

export const DESIGN_TEMPLATE_STORAGE_KEY = "proseus:design-template";
const LEGACY_DESIGN_PACK_STORAGE_KEY = "proseus:design-pack";
export const DESIGN_TEMPLATE_CHANGE_EVENT = "proseus:design-template-change";

const STYLE_ID = "proseus-design-template";

function getStyleElement(): HTMLStyleElement | null {
  return document.getElementById(STYLE_ID) as HTMLStyleElement | null;
}

function upsertStyleElement(): HTMLStyleElement {
  const existing = getStyleElement();
  if (existing) return existing;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  document.head.appendChild(style);
  return style;
}

function renderTokenOverrides(tokenOverrides: Partial<Record<string, string>>): string {
  const entries = Object.entries(tokenOverrides).filter(
    (pair): pair is [string, string] => pair[1] !== undefined,
  );
  if (entries.length === 0) return "";

  const lines = entries.map(([token, value]) => `  ${token}: ${value};`);
  return [":root {", ...lines, "}"].join("\n");
}

export function applyDesignTemplate(id: DesignTemplateId): void {
  const template = DESIGN_TEMPLATES[id];
  const css = renderTokenOverrides(template.tokenOverrides);

  document.documentElement.dataset.designTemplate = id;

  if (!css) {
    getStyleElement()?.remove();
    window.dispatchEvent(
      new CustomEvent(DESIGN_TEMPLATE_CHANGE_EVENT, { detail: id }),
    );
    return;
  }

  upsertStyleElement().textContent = css;
  window.dispatchEvent(new CustomEvent(DESIGN_TEMPLATE_CHANGE_EVENT, { detail: id }));
}

export function getStoredDesignTemplateId(): DesignTemplateId {
  const stored = localStorage.getItem(DESIGN_TEMPLATE_STORAGE_KEY);
  if (stored && isDesignTemplateId(stored)) return stored;

  const legacy = localStorage.getItem(LEGACY_DESIGN_PACK_STORAGE_KEY);
  if (legacy && isDesignTemplateId(legacy)) {
    localStorage.setItem(DESIGN_TEMPLATE_STORAGE_KEY, legacy);
    localStorage.removeItem(LEGACY_DESIGN_PACK_STORAGE_KEY);
    return legacy;
  }

  return "forge";
}

export function getActiveDesignTemplateId(): DesignTemplateId {
  const active = document.documentElement.dataset.designTemplate;
  if (active && isDesignTemplateId(active)) return active;
  return getStoredDesignTemplateId();
}

export function setStoredDesignTemplateId(id: DesignTemplateId): void {
  localStorage.setItem(DESIGN_TEMPLATE_STORAGE_KEY, id);
  localStorage.removeItem(LEGACY_DESIGN_PACK_STORAGE_KEY);
}

export function applyStoredDesignTemplate(): DesignTemplateId {
  const id = getStoredDesignTemplateId();
  applyDesignTemplate(id);
  return id;
}
