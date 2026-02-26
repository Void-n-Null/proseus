/**
 * Upload validation constants and helpers.
 *
 * Avatar uploads (character + persona): 50 MB
 * Character card imports (PNG with embedded tEXt data): 70 MB
 */

export const MAX_AVATAR_SIZE = 50 * 1024 * 1024; // 50 MB
export const MAX_CARD_IMPORT_SIZE = 70 * 1024 * 1024; // 70 MB

export const VALID_IMAGE_MIMES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;

export type ValidImageMime = (typeof VALID_IMAGE_MIMES)[number];

export function isValidImageMime(mime: string): mime is ValidImageMime {
  return (VALID_IMAGE_MIMES as readonly string[]).includes(mime);
}

/**
 * Validate an uploaded file's size and optionally its MIME type.
 * Returns an error message string if invalid, or null if OK.
 */
export function validateUpload(
  file: File,
  maxSize: number,
  opts?: { checkMime?: boolean },
): string | null {
  if (file.size > maxSize) {
    const limitMB = Math.round(maxSize / (1024 * 1024));
    const fileMB = (file.size / (1024 * 1024)).toFixed(1);
    return `File too large (${fileMB} MB). Maximum allowed size is ${limitMB} MB.`;
  }

  if (opts?.checkMime && !isValidImageMime(file.type)) {
    return `Invalid file type "${file.type}". Accepted types: PNG, JPEG, WebP, GIF.`;
  }

  return null;
}
