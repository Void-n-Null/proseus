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
 * Resize an avatar to fit within `size x size` using cover + Mitchell.
 *
 * Mitchell-Netravali produces smoother results than Lanczos3 for photographic
 * content — no ringing artifacts (halos around edges). Combined with high
 * webp quality this gives the best visual result for avatar thumbnails.
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

  const resized = await sharp(blob)
    .resize(size, size, {
      fit: "cover",
      kernel: sharp.kernel.mitchell,
    })
    .webp({ quality: 95, smartSubsample: true })
    .toBuffer();

  const result = { buffer: resized, mime: "image/webp" };
  evictIfNeeded();
  cache.set(key, result);

  return result;
}
