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
  ImportCharacterResponse,
  ListCharactersResponse,
  GetCharacterResponse,
  CreateCharacterRequest,
  CreateCharacterResponse,
  UpdateCharacterRequest,
  UpdateCharacterResponse,
  ListConnectionsResponse,
  SaveConnectionResponse,
  DeleteConnectionResponse,
  GetSettingsResponse,
  UpdateSettingsResponse,
  ListPersonasResponse,
  GetPersonaResponse,
  CreatePersonaRequest,
  CreatePersonaResponse,
  UpdatePersonaRequest,
  UpdatePersonaResponse,
  SetChatPersonaResponse,
  GetPromptTemplateResponse,
  UpdatePromptTemplateResponse,
} from "../../shared/api-types.ts";
import type { PromptTemplate } from "../../shared/prompt-template.ts";
import type { Chat, Speaker } from "../../shared/types.ts";
import type { ProviderName } from "../../shared/providers.ts";

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
    list: (opts?: {
      q?: string;
      sort?: "updated_at" | "created_at" | "message_count" | "name" | "pinned_first";
    }) => {
      const params = new URLSearchParams();
      if (opts?.q?.trim()) params.set("q", opts.q.trim());
      if (opts?.sort) params.set("sort", opts.sort);
      const query = params.toString();
      return fetchJson<ListChatsResponse>(`/chats${query ? `?${query}` : ""}`);
    },
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
    duplicate: (id: string) =>
      fetchJson<{ chat: Chat }>(`/chats/${id}/duplicate`, { method: "POST" }),
    pin: (id: string, isPinned: boolean) =>
      fetchJson<{ ok: true }>(`/chats/${id}/pin`, {
        method: "PATCH",
        body: JSON.stringify({ is_pinned: isPinned }),
      }),
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
  characters: {
    list: () => fetchJson<ListCharactersResponse>("/characters"),
    get: (id: string) =>
      fetchJson<GetCharacterResponse>(`/characters/${id}`),
    import: async (file: File, options?: { force?: boolean }) => {
      const form = new FormData();
      form.append("file", file);
      if (options?.force) form.append("force", "true");
      const res = await fetch(`${BASE}/characters/import`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(
          (error as { error?: string }).error || res.statusText,
        );
      }
      return res.json() as Promise<ImportCharacterResponse>;
    },
    importUrl: (url: string) =>
      fetchJson<ImportCharacterResponse>("/characters/import-url", {
        method: "POST",
        body: JSON.stringify({ url }),
      }),
    create: (body: CreateCharacterRequest) =>
      fetchJson<CreateCharacterResponse>("/characters", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    update: (id: string, body: UpdateCharacterRequest) =>
      fetchJson<UpdateCharacterResponse>(`/characters/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    uploadAvatar: async (id: string, file: File) => {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${BASE}/characters/${id}/avatar`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error((error as { error?: string }).error || res.statusText);
      }
      return res.json() as Promise<GetCharacterResponse>;
    },
    delete: (id: string) =>
      fetchJson<{ ok: true }>(`/characters/${id}`, { method: "DELETE" }),
    createChat: (characterId: string) =>
      fetchJson<CreateChatResponse>(`/characters/${characterId}/chat`, {
        method: "POST",
      }),
    getRecentChat: (characterId: string) =>
      fetchJson<{ chat: { id: string; name: string; updated_at: number } | null }>(
        `/characters/${characterId}/recent-chat`,
      ),
  },
  connections: {
    list: () => fetchJson<ListConnectionsResponse>("/connections"),
    save: (provider: ProviderName, apiKey: string) =>
      fetchJson<SaveConnectionResponse>(`/connections/${provider}`, {
        method: "PUT",
        body: JSON.stringify({ api_key: apiKey }),
      }),
    delete: (provider: ProviderName) =>
      fetchJson<DeleteConnectionResponse>(`/connections/${provider}`, {
        method: "DELETE",
      }),
  },
  settings: {
    get: () => fetchJson<GetSettingsResponse>("/settings"),
    update: (settings: Record<string, string>) =>
      fetchJson<UpdateSettingsResponse>("/settings", {
        method: "PUT",
        body: JSON.stringify({ settings }),
      }),
    getPromptTemplate: () =>
      fetchJson<GetPromptTemplateResponse>("/settings/prompt-template"),
    updatePromptTemplate: (template: PromptTemplate) =>
      fetchJson<UpdatePromptTemplateResponse>("/settings/prompt-template", {
        method: "PUT",
        body: JSON.stringify({ template }),
      }),
  },
  personas: {
    list: () => fetchJson<ListPersonasResponse>("/personas"),
    get: (id: string) => fetchJson<GetPersonaResponse>(`/personas/${id}`),
    create: (body: CreatePersonaRequest) =>
      fetchJson<CreatePersonaResponse>("/personas", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    update: (id: string, body: UpdatePersonaRequest) =>
      fetchJson<UpdatePersonaResponse>(`/personas/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    uploadAvatar: async (id: string, file: File) => {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${BASE}/personas/${id}/avatar`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error((error as { error?: string }).error || res.statusText);
      }
      return res.json() as Promise<GetPersonaResponse>;
    },
    delete: (id: string) =>
      fetchJson<{ ok: true }>(`/personas/${id}`, { method: "DELETE" }),
    setChatPersona: (chatId: string, personaId: string | null) =>
      fetchJson<SetChatPersonaResponse>(`/personas/chats/${chatId}/persona`, {
        method: "PUT",
        body: JSON.stringify({ persona_id: personaId }),
      }),
  },
  dev: {
    seed: () => fetchJson<{ ok: true }>("/dev/seed", { method: "POST" }),
    reset: () => fetchJson<{ ok: true }>("/dev/reset", { method: "POST" }),
  },
};
