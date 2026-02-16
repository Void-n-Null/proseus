/** Generate a 12-character nanoid for server-side IDs. */
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

/** Client-side stable ID for optimistic updates. */
export function generateClientId(): string {
  return crypto.randomUUID();
}
