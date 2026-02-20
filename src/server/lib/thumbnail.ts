import sharp from "sharp";

/**
 * Allowed thumbnail sizes (max dimension, preserving aspect ratio).
 * The client picks the nearest size >= display size * devicePixelRatio.
 * Biased toward larger sizes — local-first app, bandwidth is not a concern.
 */
const ALLOWED_SIZES = new Set([128, 256, 512]);

/** In-memory cache for resized thumbnails. Key = `${cacheKey}-${size}` */
const cache = new Map<string, { buffer: Buffer; mime: string }>();
const MAX_CACHE = 500;

function evictIfNeeded() {
  if (cache.size <= MAX_CACHE) return;
  const first = cache.keys().next().value;
  if (first) cache.delete(first);
}

/**
 * Parse and clamp the `?size=` query parameter.
 * Returns null if absent or invalid (serves full-size image).
 */
export function parseSizeParam(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = parseInt(raw, 10);
  if (isNaN(n) || !ALLOWED_SIZES.has(n)) return null;
  return n;
}

/**
 * Resize an image so its **shorter** side equals `size`, preserving aspect
 * ratio. Landscape images treat `size` as the height; portrait (or square)
 * images treat it as the width. Nothing is cropped — the full image is kept.
 *
 * Mitchell-Netravali produces smoother results than Lanczos3 for photographic
 * content — no ringing artifacts (halos around edges). Combined with high
 * webp quality this gives the best visual result for thumbnails.
 *
 * Returns the original blob untouched when no size is requested.
 * Results are cached in-memory keyed by `cacheKey-size`.
 */
export async function resizeAvatar(
  blob: Uint8Array,
  mime: string,
  size: number | null,
  cacheKey: string,
): Promise<{ buffer: Buffer | Uint8Array; mime: string }> {
  if (!size) return { buffer: blob, mime };

  const key = `${cacheKey}-${size}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const meta = await sharp(blob).metadata();
  const w = meta.width ?? 1;
  const h = meta.height ?? 1;

  // Constrain the shorter side to `size`; the longer side scales freely.
  const landscape = w >= h;
  const resizeOpts: sharp.ResizeOptions = {
    ...(landscape ? { height: size } : { width: size }),
    kernel: sharp.kernel.mitchell,
  };

  const resized = await sharp(blob)
    .resize(resizeOpts)
    .webp({ quality: 95, smartSubsample: true })
    .toBuffer();

  const result = { buffer: resized, mime: "image/webp" };
  evictIfNeeded();
  cache.set(key, result);

  return result;
}
