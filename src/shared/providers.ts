/**
 * Provider Registry — Single Source of Truth
 *
 * Adapted from proseus-ai's shared/providers.ts.
 * All provider metadata lives here. When adding a new provider, update:
 *   1. This file (PROVIDER_IDS, PROVIDERS)
 *   2. src/shared/brandingData.ts (PROVIDER_BRANDING)
 *   3. src/server/lib/llm.ts (add provider factory case)
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
  },
  {
    id: "anthropic",
    label: "Anthropic",
    description: "Direct Claude API access",
    keyPlaceholder: "sk-ant-...",
    docsUrl: "https://platform.claude.com/settings/keys",
  },
  {
    id: "openai",
    label: "OpenAI",
    description: "Direct GPT & o-series access",
    keyPlaceholder: "sk-...",
    docsUrl: "https://platform.openai.com/settings/organization/api-keys",
  },
  {
    id: "gemini",
    label: "Gemini",
    description: "Direct Google Gemini API access",
    keyPlaceholder: "AIza...",
    docsUrl: "https://aistudio.google.com/api-keys",
  },
  {
    id: "xai",
    label: "X-AI",
    description: "Direct Grok API access",
    keyPlaceholder: "xai-...",
    docsUrl: "https://console.x.ai/",
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

export function isProviderName(value: string): value is ProviderName {
  return (PROVIDER_IDS as readonly string[]).includes(value);
}
