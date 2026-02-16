import type { Chat, ChatNode, Speaker, ChatListItem, ActivePath } from "./types";

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
