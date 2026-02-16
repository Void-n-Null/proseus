import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client.ts";
import { computeBranchSwitch } from "../../shared/tree.ts";
import type { ChatNode } from "../../shared/types.ts";
import type { AddMessageRequest } from "../../shared/api-types.ts";

/**
 * Shape of the cached tree data in TanStack Query.
 * Matches the return type of useChatTree's queryFn.
 */
interface TreeData {
  nodes: Map<string, ChatNode>;
  rootNodeId: string | null;
}

export function useChatMutations(chatId: string | null) {
  const qc = useQueryClient();
  const treeKey = ["chat-tree", chatId];
  const listKey = ["chats"];

  /**
   * Full invalidation — used for add/edit/delete where the server
   * is the source of truth (new IDs, timestamps, subtree removal).
   */
  const invalidateTree = () => {
    if (chatId) {
      qc.invalidateQueries({ queryKey: treeKey });
      qc.invalidateQueries({ queryKey: listKey });
    }
  };

  // ── Add message ──────────────────────────────────────────────
  // Server generates the ID and timestamp, so we invalidate.
  const addMessage = useMutation({
    mutationFn: (body: AddMessageRequest) => api.messages.add(chatId!, body),
    onSuccess: invalidateTree,
  });

  // ── Edit message ─────────────────────────────────────────────
  const editMessage = useMutation({
    mutationFn: ({ nodeId, message }: { nodeId: string; message: string }) =>
      api.messages.edit(chatId!, nodeId, { message }),
    onSuccess: invalidateTree,
  });

  // ── Delete message ───────────────────────────────────────────
  const deleteMessage = useMutation({
    mutationFn: (nodeId: string) => api.messages.delete(chatId!, nodeId),
    onSuccess: invalidateTree,
  });

  // ── Switch branch (deep) ────────────────────────────────────
  // Uses computeBranchSwitch to optimistically patch only the
  // ancestors whose active_child_index actually changes.
  // O(depth-to-divergence), not O(n).
  const switchBranch = useMutation({
    mutationFn: ({ node_id }: { node_id: string }) =>
      api.messages.switchBranch(chatId!, { node_id }),

    onMutate: async ({ node_id }) => {
      await qc.cancelQueries({ queryKey: treeKey });
      const previous = qc.getQueryData<TreeData>(treeKey);

      if (previous) {
        const patches = computeBranchSwitch(node_id, previous.nodes);
        if (patches.length > 0) {
          const newNodes = new Map(previous.nodes);
          for (const patch of patches) {
            const node = newNodes.get(patch.id);
            if (node) {
              newNodes.set(patch.id, {
                ...node,
                active_child_index: patch.newActiveChildIndex,
              });
            }
          }
          qc.setQueryData<TreeData>(treeKey, {
            ...previous,
            nodes: newNodes,
          });
        }
      }

      return { previous };
    },

    onError: (_err, _vars, context) => {
      if (context?.previous) {
        qc.setQueryData<TreeData>(treeKey, context.previous);
      }
    },

    onSuccess: (data) => {
      // Reconcile with server-confirmed node states.
      // No full invalidation — the optimistic update was correct.
      const current = qc.getQueryData<TreeData>(treeKey);
      if (current && data.updated_nodes.length > 0) {
        const newNodes = new Map(current.nodes);
        for (const node of data.updated_nodes) {
          newNodes.set(node.id, node);
        }
        qc.setQueryData<TreeData>(treeKey, { ...current, nodes: newNodes });
      }
    },
  });

  // ── Swipe sibling (O(1) index update) ───────────────────────
  // Optimistically updates the parent's active_child_index.
  // Single index change, no server round-trip before UI update.
  const swipeSibling = useMutation({
    mutationFn: ({
      nodeId,
      direction,
    }: {
      nodeId: string;
      direction: "prev" | "next";
    }) => api.messages.swipe(chatId!, nodeId, { direction }),

    onMutate: async ({ nodeId, direction }) => {
      await qc.cancelQueries({ queryKey: treeKey });
      const previous = qc.getQueryData<TreeData>(treeKey);

      if (previous) {
        const node = previous.nodes.get(nodeId);
        if (node?.parent_id) {
          const parent = previous.nodes.get(node.parent_id);
          if (parent && parent.child_ids.length > 1) {
            const currentIndex = parent.active_child_index ?? 0;
            const newIndex =
              direction === "next"
                ? Math.min(currentIndex + 1, parent.child_ids.length - 1)
                : Math.max(currentIndex - 1, 0);

            if (newIndex !== currentIndex) {
              const newNodes = new Map(previous.nodes);
              newNodes.set(parent.id, {
                ...parent,
                active_child_index: newIndex,
              });
              qc.setQueryData<TreeData>(treeKey, {
                ...previous,
                nodes: newNodes,
              });
            }
          }
        }
      }

      return { previous };
    },

    onError: (_err, _vars, context) => {
      if (context?.previous) {
        qc.setQueryData<TreeData>(treeKey, context.previous);
      }
    },

    onSuccess: (data) => {
      // Reconcile with server-confirmed node states.
      const current = qc.getQueryData<TreeData>(treeKey);
      if (current) {
        const newNodes = new Map(current.nodes);
        newNodes.set(data.updated_parent.id, data.updated_parent);
        newNodes.set(data.active_sibling.id, data.active_sibling);
        qc.setQueryData<TreeData>(treeKey, { ...current, nodes: newNodes });
      }
    },
  });

  return { addMessage, editMessage, deleteMessage, switchBranch, swipeSibling };
}
