import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client.ts";
import type { ChatNode } from "../../shared/types.ts";

export function useChatTree(chatId: string | null) {
  return useQuery({
    queryKey: ["chat-tree", chatId],
    queryFn: async () => {
      const data = await api.messages.getTree(chatId!);
      return {
        nodes: new Map(Object.entries(data.nodes)) as Map<string, ChatNode>,
        rootNodeId: data.root_node_id,
      };
    },
    enabled: !!chatId,
  });
}
