// ── Client -> Server ───────────────────────────────────────────

import type { ProviderName } from "./providers.ts";

export type ClientWsMessage =
  | { type: "subscribe"; chatId: string }
  | { type: "unsubscribe"; chatId: string }
  | {
      type: "test-stream";
      chatId: string;
      parentId: string;
      speakerId: string;
      nodeId: string;
    }
  | {
      type: "ai-stream";
      chatId: string;
      parentId: string;
      speakerId: string;
      model: string;
      nodeId: string;
      provider?: ProviderName;
    }
  | {
      type: "generate";
      chatId: string;
      model: string;
      nodeId: string;
      provider?: ProviderName;
      /** When true, branch from the parent of the leaf (sibling of last message). */
      regenerate?: boolean;
    }
  | { type: "cancel-stream"; chatId: string };

// ── Server -> Client ───────────────────────────────────────────

export type ServerWsMessage =
  | {
      type: "stream:start";
      chatId: string;
      streamId: string;
      parentId: string;
      speakerId: string;
      nodeId: string;
    }
  | { type: "stream:chunk"; chatId: string; streamId: string; delta: string }
  | {
      type: "stream:content";
      chatId: string;
      streamId: string;
      content: string;
    }
  | {
      type: "stream:end";
      chatId: string;
      streamId: string;
      nodeId: string;
    }
  | {
      type: "stream:cancelled";
      chatId: string;
      streamId: string;
      nodeId: string;
    }
  | {
      type: "stream:error";
      chatId: string;
      streamId: string;
      error: string;
    };

// ── WebSocket connection data ──────────────────────────────────

export interface WsContext {
  subscribedChats: Set<string>;
}
