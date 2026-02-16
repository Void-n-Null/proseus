import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client.ts";
import type {
  AddMessageRequest,
  SwipeSiblingRequest,
  SwitchBranchRequest,
} from "../../shared/api-types.ts";

export function useChatMutations(chatId: string | null) {
  const qc = useQueryClient();

  const invalidateTree = () => {
    if (chatId) {
      qc.invalidateQueries({ queryKey: ["chat-tree", chatId] });
      qc.invalidateQueries({ queryKey: ["chats"] }); // list may change (updated_at, preview)
    }
  };

  const addMessage = useMutation({
    mutationFn: (body: AddMessageRequest) => api.messages.add(chatId!, body),
    onSuccess: invalidateTree,
  });

  const editMessage = useMutation({
    mutationFn: ({ nodeId, message }: { nodeId: string; message: string }) =>
      api.messages.edit(chatId!, nodeId, { message }),
    onSuccess: invalidateTree,
  });

  const deleteMessage = useMutation({
    mutationFn: (nodeId: string) => api.messages.delete(chatId!, nodeId),
    onSuccess: invalidateTree,
  });

  const switchBranch = useMutation({
    mutationFn: (body: SwitchBranchRequest) =>
      api.messages.switchBranch(chatId!, body),
    onSuccess: invalidateTree,
  });

  const swipeSibling = useMutation({
    mutationFn: ({
      nodeId,
      direction,
    }: {
      nodeId: string;
      direction: "prev" | "next";
    }) => api.messages.swipe(chatId!, nodeId, { direction }),
    onSuccess: invalidateTree,
  });

  return { addMessage, editMessage, deleteMessage, switchBranch, swipeSibling };
}
