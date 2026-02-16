import type {
  CreateChatRequest,
  CreateChatResponse,
  GetChatResponse,
  ListChatsResponse,
  UpdateChatRequest,
  GetChatTreeResponse,
  GetActivePathResponse,
  AddMessageRequest,
  AddMessageResponse,
  EditMessageRequest,
  EditMessageResponse,
  SwitchBranchRequest,
  SwitchBranchResponse,
  SwipeSiblingRequest,
  SwipeSiblingResponse,
  CreateSpeakerRequest,
  CreateSpeakerResponse,
  ListSpeakersResponse,
} from "../../shared/api-types.ts";
import type { Chat, Speaker } from "../../shared/types.ts";

const BASE = "/api";

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((error as { error?: string }).error || res.statusText);
  }
  return res.json() as Promise<T>;
}

export const api = {
  chats: {
    list: () => fetchJson<ListChatsResponse>("/chats"),
    get: (id: string) => fetchJson<GetChatResponse>(`/chats/${id}`),
    create: (body: CreateChatRequest) =>
      fetchJson<CreateChatResponse>("/chats", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    update: (id: string, body: UpdateChatRequest) =>
      fetchJson<{ chat: Chat }>(`/chats/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    delete: (id: string) =>
      fetchJson<{ ok: true }>(`/chats/${id}`, { method: "DELETE" }),
  },
  messages: {
    getTree: (chatId: string) =>
      fetchJson<GetChatTreeResponse>(`/chats/${chatId}/tree`),
    getActivePath: (chatId: string) =>
      fetchJson<GetActivePathResponse>(`/chats/${chatId}/active-path`),
    add: (chatId: string, body: AddMessageRequest) =>
      fetchJson<AddMessageResponse>(`/chats/${chatId}/messages`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    edit: (chatId: string, nodeId: string, body: EditMessageRequest) =>
      fetchJson<EditMessageResponse>(`/chats/${chatId}/messages/${nodeId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    delete: (chatId: string, nodeId: string) =>
      fetchJson<{ ok: true }>(`/chats/${chatId}/messages/${nodeId}`, {
        method: "DELETE",
      }),
    switchBranch: (chatId: string, body: SwitchBranchRequest) =>
      fetchJson<SwitchBranchResponse>(`/chats/${chatId}/switch-branch`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    swipe: (chatId: string, nodeId: string, body: SwipeSiblingRequest) =>
      fetchJson<SwipeSiblingResponse>(
        `/chats/${chatId}/messages/${nodeId}/swipe`,
        {
          method: "POST",
          body: JSON.stringify(body),
        },
      ),
  },
  speakers: {
    list: () => fetchJson<ListSpeakersResponse>("/speakers"),
    get: (id: string) => fetchJson<{ speaker: Speaker }>(`/speakers/${id}`),
    create: (body: CreateSpeakerRequest) =>
      fetchJson<CreateSpeakerResponse>("/speakers", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    update: (id: string, body: { name?: string; color?: string }) =>
      fetchJson<{ speaker: Speaker }>(`/speakers/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    delete: (id: string) =>
      fetchJson<{ ok: true }>(`/speakers/${id}`, { method: "DELETE" }),
  },
  dev: {
    seed: () => fetchJson<{ ok: true }>("/dev/seed", { method: "POST" }),
    reset: () => fetchJson<{ ok: true }>("/dev/reset", { method: "POST" }),
  },
};
