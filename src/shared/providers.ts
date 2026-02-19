/**
 * Provider Registry — Single Source of Truth
 *
 * Adapted from proseus-ai's shared/providers.ts.
 * All provider metadata lives here. When adding a new provider, update:
 *   1. This file (PROVIDER_IDS, PROVIDERS)
 *   2. src/server/lib/llm.ts (add provider factory case)
 */

// ============================================
// Provider IDs (the canonical list)
// ============================================

export const PROVIDER_IDS = [
  "openrouter",
  "anthropic",
  "openai",
  "gemini",
  "xai",
] as const;

export type ProviderName = (typeof PROVIDER_IDS)[number];

// ============================================
// Provider Metadata
// ============================================

export interface ProviderMeta {
  id: ProviderName;
  label: string;
  description: string;
  keyPlaceholder: string;
  docsUrl: string;
  /** Brand color for the provider logo SVG (applied via CSS). */
  color: string;
}

/**
 * Provider metadata registry.
 * Order determines display order in UI.
 */
export const PROVIDERS: readonly ProviderMeta[] = [
  {
    id: "openrouter",
    label: "OpenRouter",
    description: "Access multiple LLM providers through one API",
    keyPlaceholder: "sk-or-v1-...",
    docsUrl: "https://openrouter.ai/settings/keys",
    color: "#f5f5f5",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    description: "Direct Claude API access",
    keyPlaceholder: "sk-ant-...",
    docsUrl: "https://platform.claude.com/settings/keys",
    color: "#d97757",
  },
  {
    id: "openai",
    label: "OpenAI",
    description: "Direct GPT & o-series access",
    keyPlaceholder: "sk-...",
    docsUrl: "https://platform.openai.com/settings/organization/api-keys",
    color: "#a8a0d2",
  },
  {
    id: "gemini",
    label: "Gemini",
    description: "Direct Google Gemini API access",
    keyPlaceholder: "AIza...",
    docsUrl: "https://aistudio.google.com/api-keys",
    color: "#4285f4",
  },
  {
    id: "xai",
    label: "X-AI",
    description: "Direct Grok API access",
    keyPlaceholder: "xai-...",
    docsUrl: "https://console.x.ai/",
    color: "#e2e8f0",
  },
] as const;

// ============================================
// Helpers
// ============================================

export function getProviderMeta(id: ProviderName): ProviderMeta {
  const meta = PROVIDERS.find((p) => p.id === id);
  if (!meta) throw new Error(`Unknown provider: ${id}`);
  return meta;
}

export function getProviderLabel(id: ProviderName): string {
  return getProviderMeta(id).label;
}

export function getProviderColor(id: ProviderName): string {
  return getProviderMeta(id).color;
}

export function isProviderName(value: string): value is ProviderName {
  return (PROVIDER_IDS as readonly string[]).includes(value);
}
