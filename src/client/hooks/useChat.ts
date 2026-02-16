import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client.ts";

export function useChat(chatId: string | null) {
  return useQuery({
    queryKey: ["chat", chatId],
    queryFn: () => api.chats.get(chatId!),
    enabled: !!chatId,
  });
}

export function useChatList() {
  return useQuery({
    queryKey: ["chats"],
    queryFn: () => api.chats.list(),
  });
}
