/**
 * Generate a 12-character nanoid.
 * Used by both client (for optimistic node IDs) and server (for all entities).
 * The shared format means IDs are stable from creation through persistence.
 */
export function generateId(): string {
  const alphabet =
    "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  let id = "";
  for (let i = 0; i < 12; i++) {
    id += alphabet[bytes[i]! % alphabet.length];
  }
  return id;
}
