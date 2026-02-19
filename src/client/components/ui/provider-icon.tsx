/**
 * ProviderIcon — renders a models.dev SVG logo tinted with the provider's brand color.
 *
 * Since the SVGs use `fill="currentColor"`, we can't tint them via CSS `color`
 * on an `<img>` tag. Instead, we use a `<div>` with `mask-image` pointing at
 * the SVG URL, and `background-color` set to the brand color. The SVG shape
 * acts as a mask and the background fills it.
 */

import React from "react";
import type { ProviderName } from "../../../shared/providers.ts";
import { getProviderColor } from "../../../shared/providers.ts";
import { getProviderLogoUrl } from "../../../shared/models.ts";

interface ProviderIconProps {
  provider: ProviderName;
  size?: number;
  /** Override the brand color (e.g. for dimmed/inactive states). */
  color?: string;
  className?: string;
  style?: React.CSSProperties;
}

export default function ProviderIcon({
  provider,
  size = 16,
  color,
  className,
  style,
}: ProviderIconProps) {
  const url = getProviderLogoUrl(provider);
  const brandColor = color ?? getProviderColor(provider);

  return (
    <div
      className={className}
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        backgroundColor: brandColor,
        WebkitMaskImage: `url(${url})`,
        WebkitMaskSize: "contain",
        WebkitMaskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskImage: `url(${url})`,
        maskSize: "contain",
        maskRepeat: "no-repeat",
        maskPosition: "center",
        transition: "background-color 0.15s",
        ...style,
      }}
    />
  );
}
