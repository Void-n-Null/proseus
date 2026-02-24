/**
 * Shared download helpers for triggering browser file downloads
 * from API blob responses.
 */

/** Extract filename from a Content-Disposition header, with fallback. */
export function getFilenameFromDisposition(
  contentDisposition: string | null,
  fallback: string,
): string {
  if (!contentDisposition) return fallback;
  const match = contentDisposition.match(/filename="?([^";]+)"?/i);
  if (!match || !match[1]) return fallback;
  return match[1];
}

/** Create a temporary anchor to trigger a blob download in the browser. */
export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
