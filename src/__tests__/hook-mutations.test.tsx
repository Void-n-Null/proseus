import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { ChatNode } from "../shared/types.ts";
import { installHappyDom } from "./test-dom.ts";
import { createQueryClientWrapper } from "./hook-test-utils.tsx";

const { restore } = installHappyDom("https://proseus.test/mutations");

const testing = await import("@testing-library/react");
const { cleanup, renderHook, waitFor } = testing;
const [{ api }, { useChatMutations }] = await Promise.all([
  import("../client/api/client.ts"),
  import("../client/hooks/useMutations.ts"),
]);

interface TreeData {
  nodes: Map<string, ChatNode>;
  rootNodeId: string | null;
}

function createNode(overrides: Partial<ChatNode> & Pick<ChatNode, "id">): ChatNode {
  const { id, ...rest } = overrides;
  return {
    id,
    client_id: null,
    parent_id: null,
    child_ids: [],
    active_child_index: null,
    speaker_id: "speaker-1",
    message: "",
    is_bot: false,
    created_at: 1,
    updated_at: null,
    ...rest,
  };
}

afterEach(() => {
  cleanup();
});

afterAll(() => {
  restore();
});

beforeEach(() => {
  api.messages.add = async () => {
    throw new Error("unmocked messages.add");
  };
  api.messages.edit = async () => {
    throw new Error("unmocked messages.edit");
  };
  api.messages.delete = async () => {
    throw new Error("unmocked messages.delete");
  };
  api.messages.switchBranch = async () => {
    throw new Error("unmocked messages.switchBranch");
  };
  api.messages.swipe = async () => {
    throw new Error("unmocked messages.swipe");
  };
});

describe("useChatMutations", () => {
  test("addMessage patches the cached tree and invalidates the chat list", async () => {
    const root = createNode({
      id: "root",
      child_ids: [],
      active_child_index: null,
      message: "Root",
    });
    const newNode = createNode({
      id: "child-1",
      parent_id: "root",
      speaker_id: "speaker-2",
      message: "Hello there",
      is_bot: true,
    });
    const updatedParent = createNode({
      id: "root",
      child_ids: ["child-1"],
      active_child_index: 0,
      message: "Root",
    });

    api.messages.add = async (chatId, body) => {
      expect(chatId).toBe("chat-1");
      expect(body).toEqual({
        parent_id: "root",
        message: "Hello there",
        speaker_id: "speaker-2",
        is_bot: true,
      });
      return { node: newNode, updated_parent: updatedParent };
    };

    const { client, wrapper } = createQueryClientWrapper();
    const invalidateCalls: unknown[] = [];
    const originalInvalidate = client.invalidateQueries.bind(client);
    client.invalidateQueries = ((filters: unknown) => {
      invalidateCalls.push(filters);
      return originalInvalidate(filters as never);
    }) as typeof client.invalidateQueries;

    client.setQueryData<TreeData>(["chat-tree", "chat-1"], {
      nodes: new Map([["root", root]]),
      rootNodeId: "root",
    });

    const { result } = renderHook(() => useChatMutations("chat-1"), { wrapper });
    await result.current.addMessage.mutateAsync({
      parent_id: "root",
      message: "Hello there",
      speaker_id: "speaker-2",
      is_bot: true,
    });

    const tree = client.getQueryData<TreeData>(["chat-tree", "chat-1"]);
    expect(tree?.nodes.get("child-1")).toEqual(newNode);
    expect(tree?.nodes.get("root")).toEqual(updatedParent);
    expect(invalidateCalls).toContainEqual({ queryKey: ["chats"] });
  });

  test("editMessage delegates to the API and invalidates tree + list queries", async () => {
    const { client, wrapper } = createQueryClientWrapper();
    const invalidateCalls: unknown[] = [];
    const originalInvalidate = client.invalidateQueries.bind(client);
    client.invalidateQueries = ((filters: unknown) => {
      invalidateCalls.push(filters);
      return originalInvalidate(filters as never);
    }) as typeof client.invalidateQueries;

    api.messages.edit = async (chatId, nodeId, body) => {
      expect(chatId).toBe("chat-1");
      expect(nodeId).toBe("node-1");
      expect(body).toEqual({ message: "Edited" });
      return { node: createNode({ id: "node-1", message: "Edited" }) };
    };

    const { result } = renderHook(() => useChatMutations("chat-1"), { wrapper });
    await result.current.editMessage.mutateAsync({
      nodeId: "node-1",
      message: "Edited",
    });

    expect(invalidateCalls).toContainEqual({ queryKey: ["chat-tree", "chat-1"] });
    expect(invalidateCalls).toContainEqual({ queryKey: ["chats"] });
  });

  test("switchBranch applies an optimistic branch switch and keeps server-confirmed nodes", async () => {
    const root = createNode({
      id: "root",
      child_ids: ["child-a", "child-b"],
      active_child_index: 0,
    });
    const childA = createNode({ id: "child-a", parent_id: "root" });
    const childB = createNode({ id: "child-b", parent_id: "root" });

    let resolveRequest:
      | ((value: {
          updated_nodes: ChatNode[];
          active_path: { node_ids: string[]; nodes: ChatNode[] };
        }) => void)
      | undefined;
    api.messages.switchBranch = () =>
      new Promise((resolve) => {
        resolveRequest = resolve;
      });

    const { client, wrapper } = createQueryClientWrapper();
    client.setQueryData<TreeData>(["chat-tree", "chat-1"], {
      nodes: new Map([
        ["root", root],
        ["child-a", childA],
        ["child-b", childB],
      ]),
      rootNodeId: "root",
    });

    const { result } = renderHook(() => useChatMutations("chat-1"), { wrapper });
    const pending = result.current.switchBranch.mutateAsync({ node_id: "child-b" });

    await waitFor(() =>
      expect(
        client.getQueryData<TreeData>(["chat-tree", "chat-1"])?.nodes.get("root")
          ?.active_child_index,
      ).toBe(1),
    );

    if (resolveRequest) {
      resolveRequest({
        updated_nodes: [
          createNode({
            id: "root",
            child_ids: ["child-a", "child-b"],
            active_child_index: 1,
          }),
        ],
        active_path: {
          node_ids: ["root", "child-b"],
          nodes: [root, childB],
        },
      });
    }
    await pending;

    expect(
      client.getQueryData<TreeData>(["chat-tree", "chat-1"])?.nodes.get("root")
        ?.active_child_index,
    ).toBe(1);
  });

  test("switchBranch rolls back the optimistic update on API failure", async () => {
    const root = createNode({
      id: "root",
      child_ids: ["child-a", "child-b"],
      active_child_index: 0,
    });
    const childA = createNode({ id: "child-a", parent_id: "root" });
    const childB = createNode({ id: "child-b", parent_id: "root" });

    let rejectRequest: ((reason?: unknown) => void) | undefined;
    api.messages.switchBranch = () =>
      new Promise((_resolve, reject) => {
        rejectRequest = reject;
      });

    const { client, wrapper } = createQueryClientWrapper();
    client.setQueryData<TreeData>(["chat-tree", "chat-1"], {
      nodes: new Map([
        ["root", root],
        ["child-a", childA],
        ["child-b", childB],
      ]),
      rootNodeId: "root",
    });

    const { result } = renderHook(() => useChatMutations("chat-1"), { wrapper });
    const pending = result.current.switchBranch.mutateAsync({ node_id: "child-b" });

    await waitFor(() =>
      expect(
        client.getQueryData<TreeData>(["chat-tree", "chat-1"])?.nodes.get("root")
          ?.active_child_index,
      ).toBe(1),
    );

    if (rejectRequest) {
      rejectRequest(new Error("server rejected branch switch"));
    }
    await expect(pending).rejects.toThrow("server rejected branch switch");
    await waitFor(() =>
      expect(
        client.getQueryData<TreeData>(["chat-tree", "chat-1"])?.nodes.get("root")
          ?.active_child_index,
      ).toBe(0),
    );
  });

  test("swipeSibling updates the active sibling optimistically and reconciles the response", async () => {
    const parent = createNode({
      id: "parent",
      child_ids: ["sibling-a", "sibling-b"],
      active_child_index: 0,
    });
    const siblingA = createNode({ id: "sibling-a", parent_id: "parent", message: "A" });
    const siblingB = createNode({ id: "sibling-b", parent_id: "parent", message: "B" });

    api.messages.swipe = async () => ({
      updated_parent: createNode({
        id: "parent",
        child_ids: ["sibling-a", "sibling-b"],
        active_child_index: 1,
      }),
      active_sibling: createNode({
        id: "sibling-b",
        parent_id: "parent",
        message: "B",
      }),
    });

    const { client, wrapper } = createQueryClientWrapper();
    client.setQueryData<TreeData>(["chat-tree", "chat-1"], {
      nodes: new Map([
        ["parent", parent],
        ["sibling-a", siblingA],
        ["sibling-b", siblingB],
      ]),
      rootNodeId: "parent",
    });

    const { result } = renderHook(() => useChatMutations("chat-1"), { wrapper });
    await result.current.swipeSibling.mutateAsync({
      nodeId: "sibling-a",
      direction: "next",
    });

    expect(
      client.getQueryData<TreeData>(["chat-tree", "chat-1"])?.nodes.get("parent")
        ?.active_child_index,
    ).toBe(1);
    expect(
      client.getQueryData<TreeData>(["chat-tree", "chat-1"])?.nodes.get("sibling-b")
        ?.message,
    ).toBe("B");
  });
});
