/**
 * ModelGridCard - Individual model card in the model browser grid.
 *
 * Ported from proseus-ai's ModelTabGridCard.
 * Uses CSS custom properties from our OKLCH design system where possible,
 * with hex brand colors from the provider registry for icon badges.
 */

import React from "react";
import { type Model, formatContext, formatPrice } from "../../../shared/models.ts";
import { getProviderMeta, type ProviderName } from "../../../shared/providers.ts";
import ProviderIcon from "../ui/provider-icon.tsx";

export interface ModelGridCardProps {
  model: Model;
  isSelected: boolean;
  onSelect: () => void;
  /** When false, the provider icon badge is hidden. */
  showProviderIcon?: boolean;
}

/**
 * Extract the creator/org from a model ID.
 * OpenRouter IDs use "creator/model-name" format.
 * For non-OpenRouter providers, returns the provider label.
 */
function getCreatorLabel(model: Model): string {
  if (model.provider === "openrouter") {
    const slashIdx = model.id.indexOf("/");
    if (slashIdx > 0) return model.id.substring(0, slashIdx);
  }
  return getProviderMeta(model.provider).label.toLowerCase();
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default function ModelGridCard({
  model,
  isSelected,
  onSelect,
  showProviderIcon = true,
}: ModelGridCardProps) {
  const { color } = getProviderMeta(model.provider);

  const isFree = model.inputPrice === 0;
  const noTools = !model.toolCall;
  const creator = getCreatorLabel(model);
  const contextStr = model.contextLength
    ? `${formatContext(model.contextLength)} ctx`
    : null;
  const priceStr =
    model.inputPrice !== undefined
      ? isFree
        ? "Free/M"
        : `${formatPrice(model.inputPrice)}/M`
      : null;

  return (
    <button
      type="button"
      onClick={onSelect}
      // intentionally dynamic: selected state with provider brand color
      style={
        isSelected
          ? {
              background: "oklch(0.70 0.15 280 / 0.06)",
              border: "1px solid oklch(0.70 0.15 280 / 0.25)",
              boxShadow: `0 0 20px -6px ${hexToRgba(color, 0.2)}`,
            }
          : undefined
      }
      className={[
        "group relative w-full text-left rounded-lg px-4 py-3",
        "outline-none focus-visible:ring-1 focus-visible:ring-primary/60",
        "transition-[background-color,border-color,box-shadow,transform] duration-150",
        isSelected
          ? ""
          : [
              "bg-[oklch(1_0_0/0.015)] border border-[oklch(1_0_0/0.04)]",
              "hover:bg-[oklch(1_0_0/0.05)] hover:border-[oklch(1_0_0/0.14)] hover:shadow-[0_4px_20px_-6px_rgba(0,0,0,0.6)]",
              "active:scale-[0.985]",
            ].join(" "),
      ].join(" ")}
    >
      <div className="flex items-center gap-3">
        {/* Provider icon with brand color */}
        {showProviderIcon && (
          <div
            className="shrink-0 w-10 h-10 rounded-lg flex items-center justify-center transition-[background-color,box-shadow] duration-150"
            // intentionally dynamic: provider brand color with selection state
            style={{
              backgroundColor: hexToRgba(color, isSelected ? 0.24 : 0.12),
              boxShadow: isSelected
                ? `0 0 16px -3px ${hexToRgba(color, 0.35)}`
                : "none",
            }}
          >
            <ProviderIcon provider={model.provider} size={20} />
          </div>
        )}

        {/* Content */}
        <div className="min-w-0 flex-1">
          {/* Top line: model name + badges */}
          <div className="flex items-center gap-2">
            <span
              className={[
                "text-sm font-medium truncate leading-tight transition-colors duration-100",
                isSelected
                  ? "text-foreground"
                  : "text-text-body/80 group-hover:text-foreground",
              ].join(" ")}
            >
              {model.name}
            </span>
            {noTools && (
              <span className="shrink-0 text-[11px] font-semibold tracking-wide uppercase px-1.5 py-0.5 rounded bg-destructive/15 text-destructive leading-none">
                No Tools
              </span>
            )}
            {isFree && (
              <span className="shrink-0 text-[11px] font-semibold tracking-wide uppercase px-1.5 py-0.5 rounded bg-primary/15 text-primary leading-none">
                Free
              </span>
            )}
          </div>

          {/* Bottom line: creator + context + price */}
          <div className="flex items-center gap-1.5 mt-1">
            <span
              className={[
                "text-xs truncate transition-colors duration-100",
                isSelected
                  ? "text-text-muted"
                  : "text-text-dim group-hover:text-text-muted",
              ].join(" ")}
            >
              {creator}
            </span>
            {contextStr && (
              <>
                <span className="text-[9px] text-text-dim/60">&bull;</span>
                <span
                  className={[
                    "text-xs font-mono transition-colors duration-100",
                    isSelected
                      ? "text-text-muted"
                      : "text-text-dim group-hover:text-text-muted",
                  ].join(" ")}
                >
                  {contextStr}
                </span>
              </>
            )}
            {priceStr && (
              <>
                <span className="text-[9px] text-text-dim/60">&bull;</span>
                <span
                  className={[
                    "text-xs font-mono transition-colors duration-100",
                    isSelected
                      ? "text-text-muted"
                      : "text-text-dim group-hover:text-text-muted",
                  ].join(" ")}
                >
                  {priceStr}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Selected check */}
        {isSelected && (
          <div className="shrink-0 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              className="text-background"
            >
              <path
                d="M2 6L5 9L10 3"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        )}
      </div>
    </button>
  );
}
