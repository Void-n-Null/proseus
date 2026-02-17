import type { Database } from "bun:sqlite";
import type {
  Character,
  CharacterListItem,
} from "../../shared/types.ts";
import type { NormalizedCard } from "../lib/character-card-parser.ts";
import { generateId } from "../../shared/ids.ts";

interface CharacterRow {
  id: string;
  name: string;
  description: string;
  personality: string;
  scenario: string;
  first_mes: string;
  mes_example: string;

  creator_notes: string;
  system_prompt: string;
  post_history_instructions: string;
  alternate_greetings: string; // JSON
  tags: string; // JSON
  creator: string;
  character_version: string;

  avatar: Uint8Array | null;
  avatar_hash: string | null;
  source_spec: string;
  extensions: string; // JSON
  character_book: string | null; // JSON
  content_hash: string;

  created_at: number;
  updated_at: number;
}

function rowToCharacter(row: CharacterRow): Character {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    personality: row.personality,
    scenario: row.scenario,
    first_mes: row.first_mes,
    mes_example: row.mes_example,

    creator_notes: row.creator_notes,
    system_prompt: row.system_prompt,
    post_history_instructions: row.post_history_instructions,
    alternate_greetings: JSON.parse(row.alternate_greetings) as string[],
    tags: JSON.parse(row.tags) as string[],
    creator: row.creator,
    character_version: row.character_version,

    avatar_url: row.avatar ? `/api/characters/${row.id}/avatar` : null,
    avatar_hash: row.avatar_hash,
    source_spec: row.source_spec as Character["source_spec"],
    extensions: JSON.parse(row.extensions) as Record<string, unknown>,
    character_book: row.character_book
      ? (JSON.parse(row.character_book) as Character["character_book"])
      : null,
    content_hash: row.content_hash,

    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function rowToListItem(row: CharacterRow): CharacterListItem {
  return {
    id: row.id,
    name: row.name,
    avatar_url: row.avatar ? `/api/characters/${row.id}/avatar` : null,
    tags: JSON.parse(row.tags) as string[],
    creator: row.creator,
    created_at: row.created_at,
  };
}

/**
 * Compute a SHA-256 hash for deduplication.
 * Includes the fields card creators most commonly iterate on:
 * name, description, first_mes, system_prompt, post_history_instructions.
 * NUL-separated to avoid collisions between field boundaries.
 */
async function computeContentHash(card: NormalizedCard): Promise<string> {
  const content = [
    card.name,
    card.description,
    card.first_mes,
    card.system_prompt,
    card.post_history_instructions,
  ].join("\0");
  const data = new TextEncoder().encode(content);
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(data);
  return hasher.digest("hex");
}

/**
 * Compute a SHA-256 hash of avatar bytes for ETag caching.
 */
async function computeAvatarHash(avatar: Uint8Array): Promise<string> {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(avatar);
  return hasher.digest("hex");
}

/**
 * Check if a character with the same content hash already exists.
 */
export function findDuplicate(
  db: Database,
  contentHash: string,
): Character | null {
  const row = db
    .query("SELECT * FROM characters WHERE content_hash = $hash")
    .get({ $hash: contentHash }) as CharacterRow | null;
  return row ? rowToCharacter(row) : null;
}

/**
 * Create a new character from normalized card data.
 * Returns { character, duplicate } — duplicate is true if the exact
 * same character already existed (returns the existing one).
 *
 * Pass `force: true` to skip dedup and always create a new character.
 * When forced, the content_hash still gets a unique suffix to avoid
 * the UNIQUE constraint violation.
 */
export async function createCharacter(
  db: Database,
  card: NormalizedCard,
  avatarBuffer?: Uint8Array,
  options?: { force?: boolean },
): Promise<{ character: Character; duplicate: boolean }> {
  let contentHash = await computeContentHash(card);

  // Check for duplicates (unless force is set)
  if (!options?.force) {
    const existing = findDuplicate(db, contentHash);
    if (existing) {
      return { character: existing, duplicate: true };
    }
  } else {
    // Force mode: ensure unique content_hash by appending a random suffix
    const existing = findDuplicate(db, contentHash);
    if (existing) {
      contentHash = `${contentHash}:${generateId()}`;
    }
  }

  const id = generateId();
  const now = Date.now();
  const avatarHash = avatarBuffer
    ? await computeAvatarHash(avatarBuffer)
    : null;

  db.query(
    `INSERT INTO characters (
      id, name, description, personality, scenario, first_mes, mes_example,
      creator_notes, system_prompt, post_history_instructions,
      alternate_greetings, tags, creator, character_version,
      avatar, avatar_hash, source_spec, extensions, character_book, content_hash,
      created_at, updated_at
    ) VALUES (
      $id, $name, $description, $personality, $scenario, $first_mes, $mes_example,
      $creator_notes, $system_prompt, $post_history_instructions,
      $alternate_greetings, $tags, $creator, $character_version,
      $avatar, $avatar_hash, $source_spec, $extensions, $character_book, $content_hash,
      $created_at, $updated_at
    )`,
  ).run({
    $id: id,
    $name: card.name,
    $description: card.description,
    $personality: card.personality,
    $scenario: card.scenario,
    $first_mes: card.first_mes,
    $mes_example: card.mes_example,

    $creator_notes: card.creator_notes,
    $system_prompt: card.system_prompt,
    $post_history_instructions: card.post_history_instructions,
    $alternate_greetings: JSON.stringify(card.alternate_greetings),
    $tags: JSON.stringify(card.tags),
    $creator: card.creator,
    $character_version: card.character_version,

    $avatar: avatarBuffer ?? null,
    $avatar_hash: avatarHash,
    $source_spec: card.source_spec,
    $extensions: JSON.stringify(card.extensions),
    $character_book: card.character_book
      ? JSON.stringify(card.character_book)
      : null,
    $content_hash: contentHash,

    $created_at: now,
    $updated_at: now,
  });

  const character: Character = {
    id,
    name: card.name,
    description: card.description,
    personality: card.personality,
    scenario: card.scenario,
    first_mes: card.first_mes,
    mes_example: card.mes_example,

    creator_notes: card.creator_notes,
    system_prompt: card.system_prompt,
    post_history_instructions: card.post_history_instructions,
    alternate_greetings: card.alternate_greetings,
    tags: card.tags,
    creator: card.creator,
    character_version: card.character_version,

    avatar_url: avatarBuffer ? `/api/characters/${id}/avatar` : null,
    avatar_hash: avatarHash,
    source_spec: card.source_spec,
    extensions: card.extensions,
    character_book: card.character_book,
    content_hash: contentHash,

    created_at: now,
    updated_at: now,
  };

  return { character, duplicate: false };
}

export function getCharacter(db: Database, id: string): Character | null {
  const row = db
    .query("SELECT * FROM characters WHERE id = $id")
    .get({ $id: id }) as CharacterRow | null;
  return row ? rowToCharacter(row) : null;
}

/**
 * Get character avatar blob + hash for serving.
 */
export function getCharacterAvatar(
  db: Database,
  id: string,
): { avatar: Uint8Array; avatar_hash: string } | null {
  const row = db
    .query("SELECT avatar, avatar_hash FROM characters WHERE id = $id")
    .get({ $id: id }) as Pick<CharacterRow, "avatar" | "avatar_hash"> | null;

  if (!row?.avatar || !row.avatar_hash) return null;
  return { avatar: row.avatar, avatar_hash: row.avatar_hash };
}

export function listCharacters(db: Database): CharacterListItem[] {
  // Exclude avatar blob from the list query for performance
  const rows = db
    .query(
      `SELECT id, name, avatar IS NOT NULL as has_avatar, tags, creator, created_at
       FROM characters
       ORDER BY created_at DESC`,
    )
    .all() as (Pick<CharacterRow, "id" | "name" | "tags" | "creator" | "created_at"> & {
    has_avatar: number;
  })[];

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    avatar_url: row.has_avatar ? `/api/characters/${row.id}/avatar` : null,
    tags: JSON.parse(row.tags) as string[],
    creator: row.creator,
    created_at: row.created_at,
  }));
}

export function deleteCharacter(db: Database, id: string): boolean {
  const result = db
    .query("DELETE FROM characters WHERE id = $id")
    .run({ $id: id });
  return result.changes > 0;
}

export function updateCharacter(
  db: Database,
  id: string,
  input: Partial<NormalizedCard>,
): Character | null {
  const existing = db
    .query("SELECT * FROM characters WHERE id = $id")
    .get({ $id: id }) as CharacterRow | null;

  if (!existing) return null;

  const now = Date.now();
  const name = input.name ?? existing.name;
  const description = input.description ?? existing.description;
  const personality = input.personality ?? existing.personality;
  const scenario = input.scenario ?? existing.scenario;
  const first_mes = input.first_mes ?? existing.first_mes;
  const mes_example = input.mes_example ?? existing.mes_example;

  const creator_notes = input.creator_notes ?? existing.creator_notes;
  const system_prompt = input.system_prompt ?? existing.system_prompt;
  const post_history_instructions =
    input.post_history_instructions ?? existing.post_history_instructions;
  const alternate_greetings =
    input.alternate_greetings !== undefined
      ? JSON.stringify(input.alternate_greetings)
      : existing.alternate_greetings;
  const tags =
    input.tags !== undefined ? JSON.stringify(input.tags) : existing.tags;
  const creator = input.creator ?? existing.creator;
  const character_version = input.character_version ?? existing.character_version;
  const extensions =
    input.extensions !== undefined
      ? JSON.stringify(input.extensions)
      : existing.extensions;
  const character_book =
    input.character_book !== undefined
      ? input.character_book
        ? JSON.stringify(input.character_book)
        : null
      : existing.character_book;

  db.query(
    `UPDATE characters SET
      name = $name, description = $description, personality = $personality,
      scenario = $scenario, first_mes = $first_mes, mes_example = $mes_example,
      creator_notes = $creator_notes, system_prompt = $system_prompt,
      post_history_instructions = $post_history_instructions,
      alternate_greetings = $alternate_greetings, tags = $tags,
      creator = $creator, character_version = $character_version,
      extensions = $extensions, character_book = $character_book,
      updated_at = $updated_at
    WHERE id = $id`,
  ).run({
    $id: id,
    $name: name,
    $description: description,
    $personality: personality,
    $scenario: scenario,
    $first_mes: first_mes,
    $mes_example: mes_example,
    $creator_notes: creator_notes,
    $system_prompt: system_prompt,
    $post_history_instructions: post_history_instructions,
    $alternate_greetings: alternate_greetings,
    $tags: tags,
    $creator: creator,
    $character_version: character_version,
    $extensions: extensions,
    $character_book: character_book,
    $updated_at: now,
  });

  const updated = db
    .query("SELECT * FROM characters WHERE id = $id")
    .get({ $id: id }) as CharacterRow | null;
  return updated ? rowToCharacter(updated) : null;
}
