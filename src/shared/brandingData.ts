/**
 * Brand Colors — Single Source of Truth
 *
 * All visual branding for providers and model creators lives here.
 * When adding a new provider or creator, update the relevant map below.
 *
 * `logo`    — SVG tint color (rendered via CSS mask on ProviderIcon)
 * `bg`      — Dark-tint badge background (used directly, no opacity math needed)
 * `logoUrl` — Optional local SVG path that overrides the models.dev logo URL
 */

import type { ProviderName } from "./providers.ts";

// ============================================
// Shared Branding Interface
// ============================================

export interface Branding {
  /** SVG logo tint color. */
  logo: string;
  /** Icon badge background color (render directly — no opacity reduction). */
  bg: string;
  /** Optional local SVG path — overrides the models.dev logo URL. */
  logoUrl?: string;
}

// ============================================
// Provider Branding
// ============================================

export const PROVIDER_BRANDING: Record<ProviderName, Branding> = {
  openrouter: { logo: "#f5f5f5", bg: "#2b2b4c" },
  anthropic:  { logo: "#000000", bg: "#835e47" },
  openai:     { logo: "#f0f0f0", bg: "#2c2c30" },
  gemini:     { logo: "#4285f4", bg: "#bbbbbb" },
  xai:        { logo: "#e2e8f0", bg: "#2c2e33" },
};

// ============================================
// Third-Party Creator Branding
// ============================================

export const CREATOR_BRANDING: Record<string, Branding> = {
  "nvidia":      { logo: "#76b900", bg: "#2e3d17" },
  "meta-llama":  { logo: "#0668e1", bg: "#162b49" },
  "mistralai":   { logo: "#ff8205", bg: "#4c3119" },
  "deepseek":    { logo: "#4d6bfe", bg: "#252c4f" },
  "cohere":      { logo: "#39594d", bg: "#212828" },
  "ai21":        { logo: "#e91e63", bg: "#481b2d" },
  "qwen":        { logo: "#615ced", bg: "#0f0f0f", logoUrl: "/icons/qwen.svg" },
  "perplexity":  { logo: "#21808d", bg: "#1c3036" },
  "minimax":     { logo: "#f23f5d", bg: "#4a222c" },
  "moonshotai":  { logo: "#ffffff", bg: "#0f0f0f" },
};

// ============================================
// Helpers
// ============================================

export function getProviderBranding(id: ProviderName): Branding {
  return PROVIDER_BRANDING[id];
}

export function getProviderColor(id: ProviderName): string {
  return PROVIDER_BRANDING[id].logo;
}

export function getProviderBg(id: ProviderName): string {
  return PROVIDER_BRANDING[id].bg;
}

/**
 * Resolve the brand colors for a model creator.
 * Checks registered providers first, then CREATOR_BRANDING,
 * then falls back to the connection provider's branding.
 */
export function getCreatorBranding(
  creator: { slug: string; provider: ProviderName | null },
  connectionProvider: ProviderName,
): Branding {
  if (creator.provider) {
    return PROVIDER_BRANDING[creator.provider];
  }
  const custom = CREATOR_BRANDING[creator.slug];
  if (custom) return custom;
  return PROVIDER_BRANDING[connectionProvider];
}
