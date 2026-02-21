import type { Database } from "bun:sqlite";
import {
  type PromptTemplate,
  DEFAULT_PROMPT_TEMPLATE,
  mergeWithDefaults,
} from "../../shared/prompt-template.ts";

/** Get a setting value by key. Returns null if not set. */
export function getSetting(db: Database, key: string): string | null {
  const row = db
    .query("SELECT value FROM settings WHERE key = $key")
    .get({ $key: key }) as { value: string } | null;
  return row?.value ?? null;
}

/** Set a setting value. Upserts (insert or update). */
export function setSetting(
  db: Database,
  key: string,
  value: string,
): void {
  db.query(
    `INSERT INTO settings (key, value) VALUES ($key, $value)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run({ $key: key, $value: value });
}

/** Delete a setting by key. Returns true if a row was deleted. */
export function deleteSetting(db: Database, key: string): boolean {
  const result = db
    .query("DELETE FROM settings WHERE key = $key")
    .run({ $key: key });
  return result.changes > 0;
}

/** Get multiple settings at once. Returns a Record of key→value. */
export function getSettings(
  db: Database,
  keys: string[],
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const key of keys) {
    const value = getSetting(db, key);
    if (value !== null) {
      result[key] = value;
    }
  }
  return result;
}

const PROMPT_TEMPLATE_KEY = "prompt_template";

export function getPromptTemplate(db: Database): PromptTemplate {
  const json = getSetting(db, PROMPT_TEMPLATE_KEY);
  if (!json) return structuredClone(DEFAULT_PROMPT_TEMPLATE);
  try {
    const parsed = JSON.parse(json) as PromptTemplate;
    return mergeWithDefaults(parsed);
  } catch {
    return structuredClone(DEFAULT_PROMPT_TEMPLATE);
  }
}

export function setPromptTemplate(db: Database, template: PromptTemplate): void {
  setSetting(db, PROMPT_TEMPLATE_KEY, JSON.stringify(template));
}
