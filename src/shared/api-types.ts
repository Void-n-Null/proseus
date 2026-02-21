import type { Chat, ChatNode, Speaker, ChatListItem, ActivePath, Character, CharacterListItem, Persona } from "./types";
import type { ProviderName } from "./providers.ts";

// ── Chat endpoints ──

export interface CreateChatRequest {
  name: string;
  speaker_ids: string[];
  tags?: string[];
  greeting?: string;
}

export interface CreateChatResponse {
  chat: Chat;
  root_node: ChatNode | null;
}

export interface GetChatResponse {
  chat: Chat;
  speakers: Speaker[];
}

export interface ListChatsResponse {
  chats: ChatListItem[];
}

export interface UpdateChatRequest {
  name?: string;
  tags?: string[];
  persona_id?: string | null;
}

// ── Persona endpoints ──

export interface ListPersonasResponse {
  personas: Persona[];
}

export interface GetPersonaResponse {
  persona: Persona;
}

export interface CreatePersonaRequest {
  name: string;
  prompt?: string;
  is_global?: boolean;
}

export interface CreatePersonaResponse {
  persona: Persona;
}

export interface UpdatePersonaRequest {
  name?: string;
  prompt?: string;
  is_global?: boolean;
}

export interface UpdatePersonaResponse {
  persona: Persona;
}

export interface SetChatPersonaRequest {
  persona_id: string | null;
}

export interface SetChatPersonaResponse {
  chat: Chat;
}

// ── Message endpoints ──

export interface GetChatTreeResponse {
  nodes: Record<string, ChatNode>;
  root_node_id: string | null;
}

export interface GetActivePathResponse {
  active_path: ActivePath;
}

export interface AddMessageRequest {
  parent_id: string;
  message: string;
  speaker_id: string;
  is_bot: boolean;
  client_id?: string;
}

export interface AddMessageResponse {
  node: ChatNode;
  updated_parent: ChatNode;
}

export interface EditMessageRequest {
  message: string;
}

export interface EditMessageResponse {
  node: ChatNode;
}

export interface SwitchBranchRequest {
  node_id: string;
}

export interface SwitchBranchResponse {
  updated_nodes: ChatNode[];
  active_path: ActivePath;
}

export interface SwipeSiblingRequest {
  direction: "prev" | "next";
}

export interface SwipeSiblingResponse {
  updated_parent: ChatNode;
  active_sibling: ChatNode;
}

// ── Character endpoints ──

export interface ImportCharacterResponse {
  character: Character;
  duplicate: boolean;
}

export interface ListCharactersResponse {
  characters: CharacterListItem[];
}

export interface GetCharacterResponse {
  character: Character;
}

export interface ImportUrlRequest {
  url: string;
}

export interface CreateChatFromCharacterRequest {
  character_id: string;
}

// ── Speaker endpoints ──

export interface CreateSpeakerRequest {
  name: string;
  is_user: boolean;
  color?: string;
}

export interface CreateSpeakerResponse {
  speaker: Speaker;
}

export interface ListSpeakersResponse {
  speakers: Speaker[];
}

// ── Connection endpoints ──

export interface ConnectionStatusItem {
  provider: ProviderName;
  connected: boolean;
  updated_at: number | null;
}

export interface ListConnectionsResponse {
  connections: ConnectionStatusItem[];
}

export interface SaveConnectionRequest {
  provider: ProviderName;
  api_key: string;
}

export interface SaveConnectionResponse {
  provider: ProviderName;
  connected: boolean;
}

export interface DeleteConnectionResponse {
  ok: true;
}

// ── Settings endpoints ──

export interface GetSettingsResponse {
  settings: Record<string, string>;
}

export interface UpdateSettingsRequest {
  settings: Record<string, string>;
}

export interface UpdateSettingsResponse {
  settings: Record<string, string>;
}

// ── Prompt template endpoints ──

import type { PromptTemplate } from "./prompt-template.ts";

export interface GetPromptTemplateResponse {
  template: PromptTemplate;
}

export interface UpdatePromptTemplateResponse {
  template: PromptTemplate;
}
