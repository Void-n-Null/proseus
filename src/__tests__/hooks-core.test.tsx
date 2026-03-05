import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { CharacterListItem, Chat, ChatNode, Speaker } from "../shared/types.ts";
import { installHappyDom } from "./test-dom.ts";
import { createQueryClientWrapper } from "./hook-test-utils.tsx";

const { restore } = installHappyDom("https://proseus.test/hooks");

const testing = await import("@testing-library/react");
const { cleanup, renderHook, waitFor } = testing;
const [{ api }, chatHooks, { useChatTree }, { useActivePath }, { useCharacters }] =
  await Promise.all([
    import("../client/api/client.ts"),
    import("../client/hooks/useChat.ts"),
    import("../client/hooks/useChatTree.ts"),
    import("../client/hooks/useActivePath.ts"),
    import("../client/hooks/useCharacters.ts"),
  ]);

const { useChat } = chatHooks;

afterEach(() => {
  cleanup();
});

afterAll(() => {
  restore();
});

beforeEach(() => {
  api.chats.get = async () => {
    throw new Error("unmocked chats.get");
  };
  api.messages.getTree = async () => {
    throw new Error("unmocked messages.getTree");
  };
  api.characters.list = async () => {
    throw new Error("unmocked characters.list");
  };
});

describe("core query hooks", () => {
  test("useChat stays idle when chatId is null", () => {
    let calls = 0;
    api.chats.get = async () => {
      calls++;
      throw new Error("should not be called");
    };

    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useChat(null), { wrapper });

    expect(calls).toBe(0);
    expect(result.current.fetchStatus).toBe("idle");
  });

  test("useChat loads chat data", async () => {
    const chat: Chat = {
      id: "chat-1",
      name: "Test chat",
      root_node_id: "root",
      speaker_ids: ["speaker-1"],
      tags: [],
      persona_id: null,
      created_at: 1,
      updated_at: 2,
    };
    const speakers: Speaker[] = [
      {
        id: "speaker-1",
        name: "Narrator",
        avatar_url: null,
        color: null,
        is_user: false,
        created_at: 1,
      },
    ];

    api.chats.get = async (id: string) => {
      expect(id).toBe("chat-1");
      return { chat, speakers };
    };

    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useChat("chat-1"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ chat, speakers });
  });

  test("useChatTree converts nodes into a Map keyed by node id", async () => {
    const root: ChatNode = {
      id: "root",
      client_id: null,
      parent_id: null,
      child_ids: ["child"],
      active_child_index: 0,
      speaker_id: "speaker-1",
      message: "Root",
      is_bot: false,
      created_at: 1,
      updated_at: null,
    };
    const child: ChatNode = {
      id: "child",
      client_id: null,
      parent_id: "root",
      child_ids: [],
      active_child_index: null,
      speaker_id: "speaker-2",
      message: "Child",
      is_bot: true,
      created_at: 2,
      updated_at: null,
    };

    api.messages.getTree = async (chatId: string) => {
      expect(chatId).toBe("chat-1");
      return {
        nodes: {
          root,
          child,
        },
        root_node_id: "root",
      };
    };

    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useChatTree("chat-1"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.rootNodeId).toBe("root");
    expect(result.current.data?.nodes).toBeInstanceOf(Map);
    expect(result.current.data?.nodes.get("child")).toEqual(child);
  });

  test("useActivePath returns the active branch from a tree map", () => {
    const root: ChatNode = {
      id: "root",
      client_id: null,
      parent_id: null,
      child_ids: ["child-a", "child-b"],
      active_child_index: 1,
      speaker_id: "speaker-1",
      message: "Root",
      is_bot: false,
      created_at: 1,
      updated_at: null,
    };
    const childA: ChatNode = {
      id: "child-a",
      client_id: null,
      parent_id: "root",
      child_ids: [],
      active_child_index: null,
      speaker_id: "speaker-2",
      message: "Ignored",
      is_bot: true,
      created_at: 2,
      updated_at: null,
    };
    const childB: ChatNode = {
      id: "child-b",
      client_id: null,
      parent_id: "root",
      child_ids: [],
      active_child_index: null,
      speaker_id: "speaker-3",
      message: "Active",
      is_bot: true,
      created_at: 3,
      updated_at: null,
    };

    const nodes = new Map(
      [root, childA, childB].map((node) => [node.id, node] as const),
    );

    const { result } = renderHook(() => useActivePath(nodes, "root"));

    expect(result.current).toEqual({
      node_ids: ["root", "child-b"],
      nodes: [root, childB],
    });
  });

  test("useCharacters returns query errors from the API", async () => {
    const expected = new Error("characters unavailable");
    api.characters.list = async () => {
      throw expected;
    };

    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useCharacters(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBe(expected);
  });

  test("useCharacters loads list results", async () => {
    const characters: CharacterListItem[] = [
      {
        id: "char-1",
        name: "Astra",
        description: "Explorer",
        avatar_url: null,
        tags: ["space"],
        creator: "Blake",
        created_at: 1,
      },
    ];
    api.characters.list = async () => ({ characters });

    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useCharacters(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ characters });
  });
});
