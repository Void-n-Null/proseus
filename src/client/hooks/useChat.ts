import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client.ts";
import type { UpdateChatRequest } from "../../shared/api-types.ts";

export type ChatListSort =
  | "updated_at"
  | "created_at"
  | "message_count"
  | "name"
  | "pinned_first";

export interface UseChatListOptions {
  q?: string;
  sort?: ChatListSort;
}

export function useChat(chatId: string | null) {
  return useQuery({
    queryKey: ["chat", chatId],
    queryFn: () => api.chats.get(chatId!),
    enabled: !!chatId,
  });
}

export function useChatList(opts?: UseChatListOptions) {
  return useQuery({
    queryKey: ["chats", opts?.q ?? "", opts?.sort ?? "updated_at"],
    queryFn: () => api.chats.list(opts),
  });
}

export function useRenameChat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      api.chats.update(id, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chats"] });
    },
  });
}

export function useDeleteChat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.chats.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chats"] });
    },
  });
}

export function useDuplicateChat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.chats.duplicate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chats"] });
    },
  });
}

export function usePinChat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, is_pinned }: { id: string; is_pinned: boolean }) =>
      api.chats.pin(id, is_pinned),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chats"] });
    },
  });
}

export function useUpdateChat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & UpdateChatRequest) =>
      api.chats.update(id, body),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["chats"] });
      queryClient.invalidateQueries({ queryKey: ["chat", id] });
    },
  });
}
