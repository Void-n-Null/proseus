/** A node in the message tree. Every message is a node. Swipes are sibling nodes. */
export interface ChatNode {
  id: string;
  client_id: string | null;
  parent_id: string | null;
  child_ids: string[];
  active_child_index: number | null;
  speaker_id: string;
  message: string;
  is_bot: boolean;
  created_at: number;
  updated_at: number | null;
}

/** A participant in a chat. Both users and AI characters are speakers. */
export interface Speaker {
  id: string;
  name: string;
  avatar_url: string | null;
  color: string | null;
  is_user: boolean;
  created_at: number;
}

/** Chat metadata. Does NOT contain messages — those load separately. */
export interface Chat {
  id: string;
  name: string;
  root_node_id: string | null;
  speaker_ids: string[];
  tags: string[];
  persona_id: string | null;
  created_at: number;
  updated_at: number;
}

/** A user persona: name, avatar, and a prompt injected into the system context. */
export interface Persona {
  id: string;
  name: string;
  prompt: string;
  avatar_url: string | null;
  is_global: boolean;
  created_at: number;
  updated_at: number;
}

/** The computed linear path through the tree, following active_child_index at each node. */
export interface ActivePath {
  node_ids: string[];
  nodes: ChatNode[];
}

/** Lightweight row for chat list display (no full tree). */
export interface ChatListItem {
  id: string;
  name: string;
  speaker_ids: string[];
  character_id: string | null;
  character_name: string | null;
  character_avatar_url: string | null;
  is_pinned: boolean;
  tags: string[];
  message_count: number;
  last_message_preview: string;
  created_at: number;
  updated_at: number;
}

// ── Character Card Types ──

/** Normalized character data — the internal representation used by Proseus. */
export interface Character {
  id: string;
  name: string;
  description: string;
  personality: string;
  scenario: string;
  first_mes: string;
  mes_example: string;

  // V2 fields
  creator_notes: string;
  system_prompt: string;
  post_history_instructions: string;
  alternate_greetings: string[];
  tags: string[];
  creator: string;
  character_version: string;

  // Metadata
  avatar_url: string | null;
  avatar_hash: string | null;
  source_spec: "v1" | "v2" | "v3";
  extensions: Record<string, unknown>;
  character_book: CharacterBook | null;
  content_hash: string;

  created_at: number;
  updated_at: number;
}

/** Lightweight row for character list display. */
export interface CharacterListItem {
  id: string;
  name: string;
  avatar_url: string | null;
  tags: string[];
  creator: string;
  created_at: number;
}

/** Embedded lorebook. Stored as JSON, not activated at runtime (yet). */
export interface CharacterBook {
  name?: string;
  description?: string;
  scan_depth?: number;
  token_budget?: number;
  recursive_scanning?: boolean;
  extensions: Record<string, unknown>;
  entries: CharacterBookEntry[];
}

export interface CharacterBookEntry {
  keys: string[];
  content: string;
  extensions: Record<string, unknown>;
  enabled: boolean;
  insertion_order: number;
  case_sensitive?: boolean;
  name?: string;
  priority?: number;
  id?: number;
  comment?: string;
  selective?: boolean;
  secondary_keys?: string[];
  constant?: boolean;
  position?: "before_char" | "after_char";
}
