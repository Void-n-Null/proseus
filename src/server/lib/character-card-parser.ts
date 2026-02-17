/**
 * Character Card Parser
 *
 * Extracts and normalizes character card data from PNG files (tEXt chunks)
 * and raw JSON. Supports TavernCardV1, V2, and V3 (V3 degrades to V2 features).
 *
 * PNG cards use base64-encoded JSON in tEXt chunks:
 *   - "ccv3" chunk → V3 card
 *   - "chara" chunk → V1 or V2 card
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const extractChunks = require("png-chunks-extract") as (
  data: Uint8Array,
) => Array<{ name: string; data: Uint8Array }>;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const decodeTextChunk = require("png-chunk-text/decode") as (
  data: Uint8Array,
) => { keyword: string; text: string };

import type { CharacterBook } from "../../shared/types.ts";

// ── Raw card types (what comes out of the JSON) ──

interface TavernCardV1 {
  name: string;
  description: string;
  personality: string;
  scenario: string;
  first_mes: string;
  mes_example: string;
}

interface TavernCardV2 {
  spec: "chara_card_v2";
  spec_version: string;
  data: TavernCardV1 & {
    creator_notes: string;
    system_prompt: string;
    post_history_instructions: string;
    alternate_greetings: string[];
    character_book?: CharacterBook;
    tags: string[];
    creator: string;
    character_version: string;
    extensions: Record<string, unknown>;
  };
}

interface TavernCardV3 {
  spec: "chara_card_v3";
  spec_version: string;
  data: TavernCardV2["data"] & {
    assets?: Array<{
      type: string;
      uri: string;
      name: string;
      ext: string;
    }>;
    nickname?: string;
    source?: string[];
    group_only_greetings?: string[];
  };
}

/** The normalized internal representation — all versions collapse to this. */
export interface NormalizedCard {
  name: string;
  description: string;
  personality: string;
  scenario: string;
  first_mes: string;
  mes_example: string;

  creator_notes: string;
  system_prompt: string;
  post_history_instructions: string;
  alternate_greetings: string[];
  tags: string[];
  creator: string;
  character_version: string;

  extensions: Record<string, unknown>;
  character_book: CharacterBook | null;
  source_spec: "v1" | "v2" | "v3";
}

export class CardParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CardParseError";
  }
}

// ── Public API ──

/**
 * Extract character card data from a PNG buffer.
 * Checks ccv3 chunk first, falls back to chara chunk.
 */
export function extractCardFromPNG(buffer: Uint8Array): NormalizedCard {
  let chunks: Array<{ name: string; data: Uint8Array }>;
  try {
    chunks = extractChunks(buffer);
  } catch (err) {
    throw new CardParseError(
      `Invalid PNG file: ${err instanceof Error ? err.message : "unknown error"}`,
    );
  }

  // Find tEXt chunks — check ccv3 first (V3), then chara (V1/V2)
  const textChunks = chunks.filter((c) => c.name === "tEXt");

  let cardJson: string | null = null;
  let fromCcv3 = false;

  for (const chunk of textChunks) {
    let decoded: { keyword: string; text: string };
    try {
      decoded = decodeTextChunk(chunk.data);
    } catch {
      continue;
    }

    if (decoded.keyword.toLowerCase() === "ccv3") {
      cardJson = decodeBase64(decoded.text);
      fromCcv3 = true;
      break;
    }
  }

  if (!cardJson) {
    for (const chunk of textChunks) {
      let decoded: { keyword: string; text: string };
      try {
        decoded = decodeTextChunk(chunk.data);
      } catch {
        continue;
      }

      if (decoded.keyword.toLowerCase() === "chara") {
        cardJson = decodeBase64(decoded.text);
        break;
      }
    }
  }

  if (!cardJson) {
    throw new CardParseError(
      "No character card data found in PNG. Expected a tEXt chunk with keyword 'chara' or 'ccv3'.",
    );
  }

  return parseAndNormalize(cardJson, fromCcv3);
}

/**
 * Extract character card data from a raw JSON string.
 */
export function extractCardFromJSON(json: string): NormalizedCard {
  return parseAndNormalize(json, false);
}

// ── Internal helpers ──

function decodeBase64(text: string): string {
  try {
    return atob(text);
  } catch {
    throw new CardParseError("Failed to decode base64 character data from PNG chunk.");
  }
}

function parseAndNormalize(json: string, fromCcv3: boolean): NormalizedCard {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new CardParseError("Character card contains invalid JSON.");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new CardParseError("Character card JSON is not an object.");
  }

  const obj = parsed as Record<string, unknown>;

  // V3 detection
  if (obj.spec === "chara_card_v3" || fromCcv3) {
    return normalizeV3(obj as unknown as TavernCardV3);
  }

  // V2 detection
  if (obj.spec === "chara_card_v2") {
    return normalizeV2(obj as unknown as TavernCardV2);
  }

  // V1 detection — no spec field, has name at root
  if (obj.name !== undefined && !obj.spec) {
    return normalizeV1(obj as unknown as TavernCardV1);
  }

  // V2 data might be at root without spec wrapper (some exporters do this)
  if (obj.data && typeof obj.data === "object") {
    const data = obj.data as Record<string, unknown>;
    if (data.name !== undefined) {
      return normalizeV2({
        spec: "chara_card_v2",
        spec_version: "2.0",
        data: data as unknown as TavernCardV2["data"],
      });
    }
  }

  throw new CardParseError(
    "Could not determine character card format. Expected V1 (flat fields), V2 (spec: 'chara_card_v2'), or V3 (spec: 'chara_card_v3').",
  );
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function strArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

function normalizeV1(card: TavernCardV1): NormalizedCard {
  return {
    name: str(card.name) || "Unnamed",
    description: str(card.description),
    personality: str(card.personality),
    scenario: str(card.scenario),
    first_mes: str(card.first_mes),
    mes_example: str(card.mes_example),

    creator_notes: "",
    system_prompt: "",
    post_history_instructions: "",
    alternate_greetings: [],
    tags: [],
    creator: "",
    character_version: "",

    extensions: {},
    character_book: null,
    source_spec: "v1",
  };
}

function normalizeV2(card: TavernCardV2): NormalizedCard {
  const d = card.data ?? ({} as TavernCardV2["data"]);

  return {
    name: str(d.name) || "Unnamed",
    description: str(d.description),
    personality: str(d.personality),
    scenario: str(d.scenario),
    first_mes: str(d.first_mes),
    mes_example: str(d.mes_example),

    creator_notes: str(d.creator_notes),
    system_prompt: str(d.system_prompt),
    post_history_instructions: str(d.post_history_instructions),
    alternate_greetings: strArray(d.alternate_greetings),
    tags: strArray(d.tags),
    creator: str(d.creator),
    character_version: str(d.character_version),

    extensions:
      d.extensions && typeof d.extensions === "object"
        ? (d.extensions as Record<string, unknown>)
        : {},
    character_book: normalizeCharacterBook(d.character_book),
    source_spec: "v2",
  };
}

function normalizeV3(card: TavernCardV3): NormalizedCard {
  // Extract V2-compatible fields, store full V3 data in extensions
  const normalized = normalizeV2({
    spec: "chara_card_v2",
    spec_version: "2.0",
    data: card.data ?? ({} as TavernCardV3["data"]),
  });

  // Preserve the full original V3 card for lossless round-trip
  normalized.extensions = {
    ...normalized.extensions,
    "proseus/original_v3": card,
  };
  normalized.source_spec = "v3";

  return normalized;
}

function normalizeCharacterBook(
  book: unknown,
): CharacterBook | null {
  if (!book || typeof book !== "object") return null;
  const b = book as Record<string, unknown>;

  return {
    name: typeof b.name === "string" ? b.name : undefined,
    description: typeof b.description === "string" ? b.description : undefined,
    scan_depth: typeof b.scan_depth === "number" ? b.scan_depth : undefined,
    token_budget: typeof b.token_budget === "number" ? b.token_budget : undefined,
    recursive_scanning:
      typeof b.recursive_scanning === "boolean" ? b.recursive_scanning : undefined,
    extensions:
      b.extensions && typeof b.extensions === "object"
        ? (b.extensions as Record<string, unknown>)
        : {},
    entries: normalizeBookEntries(b.entries),
  };
}

function normalizeBookEntries(entries: unknown): CharacterBook["entries"] {
  if (!Array.isArray(entries)) return [];

  return entries
    .filter((e): e is Record<string, unknown> => e && typeof e === "object")
    .map((e) => ({
      keys: strArray(e.keys),
      content: str(e.content),
      extensions:
        e.extensions && typeof e.extensions === "object"
          ? (e.extensions as Record<string, unknown>)
          : {},
      enabled: typeof e.enabled === "boolean" ? e.enabled : true,
      insertion_order: typeof e.insertion_order === "number" ? e.insertion_order : 0,
      case_sensitive:
        typeof e.case_sensitive === "boolean" ? e.case_sensitive : undefined,
      name: typeof e.name === "string" ? e.name : undefined,
      priority: typeof e.priority === "number" ? e.priority : undefined,
      id: typeof e.id === "number" ? e.id : undefined,
      comment: typeof e.comment === "string" ? e.comment : undefined,
      selective: typeof e.selective === "boolean" ? e.selective : undefined,
      secondary_keys: strArray(e.secondary_keys),
      constant: typeof e.constant === "boolean" ? e.constant : undefined,
      position:
        e.position === "before_char" || e.position === "after_char"
          ? e.position
          : undefined,
    }));
}
