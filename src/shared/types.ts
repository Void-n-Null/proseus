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
  tags: string[];
  message_count: number;
  last_message_preview: string;
  created_at: number;
  updated_at: number;
}
