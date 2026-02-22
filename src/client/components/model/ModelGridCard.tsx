/**
 * ModelGridCard - Individual model card in the model browser grid.
 *
 * Ported from proseus-ai's ModelTabGridCard.
 * Uses CSS custom properties from our OKLCH design system where possible,
 * with hex brand colors from the provider registry for icon badges.
 */

import React from "react";
import { type Model, formatContext, formatPrice, getModelCreator, getCreatorBranding, getCreatorLogoUrl } from "../../../shared/models.ts";
import ProviderIcon from "../ui/provider-icon.tsx";

export interface ModelGridCardProps {
  model: Model;
  isSelected: boolean;
  onSelect: () => void;
  /** When false, the provider icon badge is hidden. */
  showProviderIcon?: boolean;
}

export default function ModelGridCard({
  model,
  isSelected,
  onSelect,
  showProviderIcon = true,
}: ModelGridCardProps) {
  const creator = getModelCreator(model);
  const iconProvider = creator.provider ?? model.provider;
  const branding = getCreatorBranding(creator, model.provider);
  const logoUrl = branding.logoUrl ?? (!creator.provider ? getCreatorLogoUrl(creator.slug) : undefined);

  const isFree = model.inputPrice === 0;
  const noTools = !model.toolCall;
  const creatorLabel = creator.slug;
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
              background: "oklch(0.28 0.012 280)",
              border: "1px solid oklch(0.70 0.15 280 / 0.25)",
              boxShadow: "0 2px 12px rgba(0,0,0,0.2), 0 0 0 1px oklch(0.70 0.15 280 / 0.08)",
            }
          : undefined
      }
      className={[
        "group relative w-full text-left rounded-2xl px-4 py-3",
        "outline-none focus-visible:ring-1 focus-visible:ring-primary/60",
        "transition-[background-color,border-color,box-shadow,transform] duration-150",
        isSelected
          ? ""
          : [
              "bg-surface border border-border",
              "hover:bg-surface-raised hover:border-[oklch(1_0_0/0.14)] hover:shadow-[0_2px_10px_-4px_rgba(0,0,0,0.2)]",
              "active:scale-[0.985]",
            ].join(" "),
      ].join(" ")}
    >
      <div className="flex items-center gap-3">
        {/* Provider icon with brand color */}
        {showProviderIcon && (
          <div
            className="shrink-0 w-10 h-10 rounded-lg flex items-center justify-center transition-[background-color] duration-150"
            style={{ backgroundColor: branding.bg }}
          >
            <ProviderIcon provider={iconProvider} logoUrl={logoUrl} color={branding.logo} size={20} />
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
              {creatorLabel}
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

      </div>
    </button>
  );
}
