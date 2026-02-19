import React, { useMemo } from "react";

/** Allowed server thumbnail sizes — must match server ALLOWED_SIZES. */
const THUMBNAIL_SIZES = [128, 256, 512] as const;

/**
 * Pick the thumbnail size for the display area.
 * Local-first app — bandwidth isn't a concern, so we bias toward 256
 * as the floor to keep things smooth even on 1x displays.
 */
function pickThumbnailSize(displayW: number, displayH: number): number {
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 2;
  const needed = Math.max(displayW, displayH) * dpr;
  // Floor at 256 — always serve enough pixels for smooth rendering
  const target = Math.max(needed, 256);
  for (const s of THUMBNAIL_SIZES) {
    if (s >= target) return s;
  }
  return THUMBNAIL_SIZES[THUMBNAIL_SIZES.length - 1]!;
}

/** Append `?size=N` or `&size=N` to a URL. */
function appendSize(src: string, size: number): string {
  return src + (src.includes("?") ? "&" : "?") + `size=${size}`;
}

interface AvatarProps {
  src: string;
  alt: string;
  /** CSS width & height. Can be number (px) or string ("2rem"). */
  size?: number | string;
  /** Width if different from height. Overrides `size` for width. */
  width?: number | string;
  /** Height if different from width. Overrides `size` for height. */
  height?: number | string;
  /** Border radius — defaults to "var(--radius-md)". */
  borderRadius?: string;
  style?: React.CSSProperties;
  className?: string;
}

/**
 * Avatar component with two layers of defense against browser pixelation:
 *
 * 1. Server-side: appends `?size=N` so the server returns a Mitchell-resampled
 *    thumbnail (256px+) instead of the full-resolution blob.
 * 2. Client-side: renders via `background-image` + `background-size: cover`
 *    which uses a different compositing path than `<img>` + `object-fit` and
 *    avoids nearest-neighbor artifacts in GPU-composited layers (e.g. virtual
 *    scroll with transform: translateY).
 */
export const Avatar = React.memo(function Avatar({
  src,
  alt,
  size = 36,
  width,
  height,
  borderRadius = "var(--radius-md)",
  style,
  className,
}: AvatarProps) {
  const w = width ?? size;
  const h = height ?? size;

  const thumbSrc = useMemo(() => {
    const pw = typeof w === "number" ? w : 256;
    const ph = typeof h === "number" ? h : 256;
    return appendSize(src, pickThumbnailSize(pw, ph));
  }, [src, w, h]);

  return (
    <div
      role="img"
      aria-label={alt}
      className={className}
      style={{
        width: w,
        height: h,
        borderRadius,
        backgroundImage: `url(${thumbSrc})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        flexShrink: 0,
        ...style,
      }}
    />
  );
});
