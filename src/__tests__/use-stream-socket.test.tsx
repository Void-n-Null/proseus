import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { ChatNode } from "../shared/types.ts";
import type { ClientWsMessage, ServerWsMessage } from "../shared/ws-types.ts";
import { installHappyDom } from "./test-dom.ts";
import { createQueryClientWrapper } from "./hook-test-utils.tsx";

const { restore } = installHappyDom("https://proseus.test/chat");

const testing = await import("@testing-library/react");
const { act, cleanup, renderHook, waitFor } = testing;
const [
  { useStreamSocket },
  { useConnectionStore },
  { useStreamingStore },
  streamingBuffer,
  { toast },
] = await Promise.all([
  import("../client/hooks/useStreamSocket.ts"),
  import("../client/stores/connection.ts"),
  import("../client/stores/streaming.ts"),
  import("../client/lib/streaming-buffer.ts"),
  import("sonner"),
]);

interface TreeData {
  nodes: Map<string, ChatNode>;
  rootNodeId: string | null;
}

type Listener = (event: { data?: string }) => void;

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: MockWebSocket[] = [];

  readyState = MockWebSocket.CONNECTING;
  sent: string[] = [];
  private listeners = new Map<string, Set<Listener>>();

  constructor(public url: string) {
    MockWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: Listener) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener);
  }

  removeEventListener(type: string, listener: Listener) {
    this.listeners.get(type)?.delete(listener);
  }

  send(message: string) {
    this.sent.push(message);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.emit("close", {});
  }

  open() {
    this.readyState = MockWebSocket.OPEN;
    this.emit("open", {});
  }

  message(msg: ServerWsMessage) {
    this.emit("message", { data: JSON.stringify(msg) });
  }

  messageRaw(data: string) {
    this.emit("message", { data });
  }

  serverClose() {
    this.readyState = MockWebSocket.CLOSED;
    this.emit("close", {});
  }

  private emit(type: string, event: { data?: string }) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
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

function getLastSocket(): MockWebSocket {
  const socket = MockWebSocket.instances.at(-1);
  if (!socket) throw new Error("expected a WebSocket instance");
  return socket;
}

function parseSent(socket: MockWebSocket): ClientWsMessage[] {
  return socket.sent.map((message) => JSON.parse(message) as ClientWsMessage);
}

const originalWebSocket = globalThis.WebSocket;
const originalToastError = toast.error;

Object.defineProperty(globalThis, "WebSocket", {
  configurable: true,
  writable: true,
  value: MockWebSocket,
});
Object.defineProperty(window, "WebSocket", {
  configurable: true,
  writable: true,
  value: MockWebSocket,
});

afterEach(() => {
  cleanup();
});

afterAll(() => {
  toast.error = originalToastError;
  Object.defineProperty(globalThis, "WebSocket", {
    configurable: true,
    writable: true,
    value: originalWebSocket,
  });
  Object.defineProperty(window, "WebSocket", {
    configurable: true,
    writable: true,
    value: originalWebSocket,
  });
  restore();
});

beforeEach(() => {
  MockWebSocket.instances.length = 0;
  useConnectionStore.setState({
    status: "disconnected",
    reconnectAttempt: 0,
  });
  useStreamingStore.setState({ meta: null });
  if (streamingBuffer.isSessionActive()) {
    streamingBuffer.cancelSession();
  }
  toast.error = (() => 1) as unknown as typeof toast.error;
});

describe("useStreamSocket", () => {
  test("creates one socket, subscribes on open, and switches chat topics without reconnecting", async () => {
    const { wrapper } = createQueryClientWrapper();
    const { result, rerender, unmount } = renderHook(
      ({ chatId }: { chatId: string | null }) => useStreamSocket(chatId),
      {
        initialProps: { chatId: "chat-1" },
        wrapper,
      },
    );

    expect(result.current.status).toBe("connecting");
    const socket = getLastSocket();
    expect(socket.url).toBe("wss://proseus.test/ws");

    act(() => {
      socket.open();
    });

    await waitFor(() => expect(useConnectionStore.getState().status).toBe("connected"));
    expect(parseSent(socket)).toEqual([{ type: "subscribe", chatId: "chat-1" }]);

    rerender({ chatId: "chat-2" });
    expect(parseSent(socket).slice(-2)).toEqual([
      { type: "unsubscribe", chatId: "chat-1" },
      { type: "subscribe", chatId: "chat-2" },
    ]);

    unmount();
    expect(useConnectionStore.getState().status).toBe("disconnected");
  });

  test("sendGenerate and cancelStream send the expected client messages", async () => {
    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useStreamSocket("chat-1"), { wrapper });
    const socket = getLastSocket();

    act(() => {
      socket.open();
    });

    await waitFor(() => expect(useConnectionStore.getState().status).toBe("connected"));

    result.current.sendGenerate("claude-3-7-sonnet", "anthropic", true, "target-1");
    result.current.cancelStream();

    const sent = parseSent(socket);
    expect(sent[1]).toMatchObject({
      type: "generate",
      chatId: "chat-1",
      model: "claude-3-7-sonnet",
      provider: "anthropic",
      regenerate: true,
      targetNodeId: "target-1",
    });
    expect(sent[2]).toEqual({ type: "cancel-stream", chatId: "chat-1" });
  });

  test("stream messages insert a placeholder, track content, and finalize into the tree cache", async () => {
    const { client, wrapper } = createQueryClientWrapper();
    const invalidateCalls: unknown[] = [];
    const originalInvalidate = client.invalidateQueries.bind(client);
    client.invalidateQueries = ((filters: unknown) => {
      invalidateCalls.push(filters);
      return originalInvalidate(filters as never);
    }) as typeof client.invalidateQueries;

    client.setQueryData<TreeData>(["chat-tree", "chat-1"], {
      nodes: new Map([
        [
          "root",
          createNode({
            id: "root",
            child_ids: [],
            active_child_index: null,
            message: "Root",
          }),
        ],
      ]),
      rootNodeId: "root",
    });

    renderHook(() => useStreamSocket("chat-1"), { wrapper });
    const socket = getLastSocket();

    act(() => {
      socket.open();
      socket.message({
        type: "stream:start",
        chatId: "chat-1",
        streamId: "stream-1",
        parentId: "root",
        speakerId: "speaker-2",
        nodeId: "node-1",
      });
    });

    await waitFor(() =>
      expect(useStreamingStore.getState().meta?.nodeId).toBe("node-1"),
    );
    expect(
      client.getQueryData<TreeData>(["chat-tree", "chat-1"])?.nodes.get("node-1"),
    ).toMatchObject({
      id: "node-1",
      parent_id: "root",
      speaker_id: "speaker-2",
      message: "",
    });

    act(() => {
      socket.message({
        type: "stream:content",
        chatId: "chat-1",
        streamId: "stream-1",
        content: "Hello world",
      });
      socket.message({
        type: "stream:end",
        chatId: "chat-1",
        streamId: "stream-1",
        nodeId: "node-1",
      });
    });

    await waitFor(() => expect(useStreamingStore.getState().meta).toBeNull());
    expect(
      client.getQueryData<TreeData>(["chat-tree", "chat-1"])?.nodes.get("node-1")
        ?.message,
    ).toBe("Hello world");
    expect(invalidateCalls).toContainEqual({ queryKey: ["chat-tree", "chat-1"] });
    expect(invalidateCalls).toContainEqual({ queryKey: ["chats"] });
  });

  test("stream:error removes the placeholder and surfaces a toast", async () => {
    const { client, wrapper } = createQueryClientWrapper();
    const toastCalls: Array<{ title: string; description?: string }> = [];
    toast.error = ((title: string, options?: { description?: string }) => {
      toastCalls.push({ title, description: options?.description });
      return 1;
    }) as unknown as typeof toast.error;

    client.setQueryData<TreeData>(["chat-tree", "chat-1"], {
      nodes: new Map([
        [
          "root",
          createNode({
            id: "root",
            child_ids: [],
            active_child_index: null,
          }),
        ],
      ]),
      rootNodeId: "root",
    });

    renderHook(() => useStreamSocket("chat-1"), { wrapper });
    const socket = getLastSocket();

    act(() => {
      socket.open();
      socket.message({
        type: "stream:start",
        chatId: "chat-1",
        streamId: "stream-2",
        parentId: "root",
        speakerId: "speaker-2",
        nodeId: "node-2",
      });
    });

    await waitFor(() =>
      expect(
        client.getQueryData<TreeData>(["chat-tree", "chat-1"])?.nodes.has("node-2"),
      ).toBe(true),
    );

    act(() => {
      socket.message({
        type: "stream:error",
        chatId: "chat-1",
        streamId: "stream-2",
        error: "Provider rejected the request",
      });
    });

    await waitFor(() => expect(useStreamingStore.getState().meta).toBeNull());
    expect(
      client.getQueryData<TreeData>(["chat-tree", "chat-1"])?.nodes.has("node-2"),
    ).toBe(false);
    expect(toastCalls).toEqual([
      {
        title: "Generation failed",
        description: "Provider rejected the request",
      },
    ]);
  });

  test("ignores malformed messages and reconnects after an unexpected close", async () => {
    const originalSetTimeout = globalThis.setTimeout;
    const originalClearTimeout = globalThis.clearTimeout;
    Object.defineProperty(globalThis, "setTimeout", {
      configurable: true,
      writable: true,
      value: ((callback: () => void) => {
        callback();
        return 1;
      }) as typeof setTimeout,
    });
    Object.defineProperty(globalThis, "clearTimeout", {
      configurable: true,
      writable: true,
      value: (() => {}) as typeof clearTimeout,
    });

    try {
      const { wrapper } = createQueryClientWrapper();
      renderHook(() => useStreamSocket("chat-1"), { wrapper });
      const firstSocket = getLastSocket();

      act(() => {
        firstSocket.open();
        firstSocket.messageRaw("this is not json");
      });

      expect(useConnectionStore.getState().status).toBe("connected");

      act(() => {
        firstSocket.serverClose();
      });

      expect(MockWebSocket.instances).toHaveLength(2);
      expect(["reconnecting", "connecting"]).toContain(
        useConnectionStore.getState().status,
      );

      const secondSocket = getLastSocket();
      act(() => {
        secondSocket.open();
      });

      expect(useConnectionStore.getState().status).toBe("connected");
      expect(parseSent(secondSocket)).toEqual([{ type: "subscribe", chatId: "chat-1" }]);
    } finally {
      Object.defineProperty(globalThis, "setTimeout", {
        configurable: true,
        writable: true,
        value: originalSetTimeout,
      });
      Object.defineProperty(globalThis, "clearTimeout", {
        configurable: true,
        writable: true,
        value: originalClearTimeout,
      });
    }
  });
});
