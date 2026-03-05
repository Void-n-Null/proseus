import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import type { ProviderName } from "../shared/providers.ts";
import { installHappyDom } from "./test-dom.ts";
import { flushMicrotasks } from "./hook-test-utils.tsx";

const { restore } = installHappyDom("https://proseus.test/stores");

const originalFetch = globalThis.fetch;
Object.defineProperty(globalThis, "fetch", {
  configurable: true,
  writable: true,
  value: async () =>
    new Response(JSON.stringify({ settings: {} }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
});

const [{ useConnectionStore }, { useStreamingStore }, { useModelStore }, { api }] =
  await Promise.all([
    import("../client/stores/connection.ts"),
    import("../client/stores/streaming.ts"),
    import("../client/stores/model.ts"),
    import("../client/api/client.ts"),
  ]);

const originalSettingsGet = api.settings.get;
const originalSettingsUpdate = api.settings.update;

afterAll(() => {
  api.settings.get = originalSettingsGet;
  api.settings.update = originalSettingsUpdate;
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    writable: true,
    value: originalFetch,
  });
  restore();
});

beforeEach(async () => {
  localStorage.clear();
  sessionStorage.clear();

  useConnectionStore.setState({
    status: "disconnected",
    reconnectAttempt: 0,
  });
  useStreamingStore.setState({ meta: null });
  useModelStore.setState({
    provider: "openrouter",
    modelId: "",
    hydrated: false,
  });

  api.settings.get = async () => ({ settings: {} });
  api.settings.update = async (settings) => ({ settings });

  await flushMicrotasks();
});

describe("connection store", () => {
  test("starts disconnected with zero reconnect attempts", () => {
    expect(useConnectionStore.getState().status).toBe("disconnected");
    expect(useConnectionStore.getState().reconnectAttempt).toBe(0);
  });

  test("markReconnecting tracks attempts and markConnected resets them", () => {
    useConnectionStore.getState().markReconnecting(3);
    expect(useConnectionStore.getState()).toMatchObject({
      status: "reconnecting",
      reconnectAttempt: 3,
    });

    useConnectionStore.getState().markConnected();
    expect(useConnectionStore.getState()).toMatchObject({
      status: "connected",
      reconnectAttempt: 0,
    });
  });

  test("setStatus and markDisconnected update the status explicitly", () => {
    useConnectionStore.getState().setStatus("connecting");
    expect(useConnectionStore.getState().status).toBe("connecting");

    useConnectionStore.getState().markDisconnected();
    expect(useConnectionStore.getState().status).toBe("disconnected");
  });
});

describe("streaming store", () => {
  test("starts idle", () => {
    expect(useStreamingStore.getState().meta).toBeNull();
  });

  test("start sets streaming metadata and stop clears it", () => {
    useStreamingStore.getState().start("parent-1", "speaker-1", "node-1");

    const meta = useStreamingStore.getState().meta;
    expect(meta).not.toBeNull();
    expect(meta).toMatchObject({
      parentId: "parent-1",
      speakerId: "speaker-1",
      nodeId: "node-1",
    });
    expect(typeof meta?.startedAt).toBe("number");

    useStreamingStore.getState().stop();
    expect(useStreamingStore.getState().meta).toBeNull();
  });
});

describe("model store", () => {
  test("defaults to openrouter with no selected model", () => {
    expect(useModelStore.getState()).toMatchObject({
      provider: "openrouter",
      modelId: "",
      hydrated: false,
    });
  });

  test("setProviderAndModel persists to localStorage and server settings", async () => {
    const updates: Array<Record<string, string>> = [];
    api.settings.update = async (settings) => {
      updates.push(settings);
      return { settings };
    };

    useModelStore.getState().setProviderAndModel("anthropic", "claude-3-7-sonnet");
    await flushMicrotasks();

    expect(useModelStore.getState()).toMatchObject({
      provider: "anthropic",
      modelId: "claude-3-7-sonnet",
    });
    expect(localStorage.getItem("proseus:provider")).toBe("anthropic");
    expect(localStorage.getItem("proseus:model")).toBe("claude-3-7-sonnet");
    expect(updates).toEqual([
      {
        selected_provider: "anthropic",
        selected_model: "claude-3-7-sonnet",
      },
    ]);
  });

  test("clearModel removes the stored model and persists an empty server value", async () => {
    const updates: Array<Record<string, string>> = [];
    api.settings.update = async (settings) => {
      updates.push(settings);
      return { settings };
    };

    useModelStore.setState({
      provider: "openai" satisfies ProviderName,
      modelId: "gpt-4.1",
      hydrated: true,
    });
    localStorage.setItem("proseus:provider", "openai");
    localStorage.setItem("proseus:model", "gpt-4.1");

    useModelStore.getState().clearModel();
    await flushMicrotasks();

    expect(useModelStore.getState()).toMatchObject({
      provider: "openai",
      modelId: "",
    });
    expect(localStorage.getItem("proseus:model")).toBeNull();
    expect(updates).toEqual([
      {
        selected_provider: "openai",
        selected_model: "",
      },
    ]);
  });

  test("hydrate adopts server settings when they exist", async () => {
    api.settings.get = async () => ({
      settings: {
        selected_provider: "xai",
        selected_model: "grok-3",
      },
    });

    await useModelStore.getState().hydrate();

    expect(useModelStore.getState()).toMatchObject({
      provider: "xai",
      modelId: "grok-3",
      hydrated: true,
    });
    expect(localStorage.getItem("proseus:provider")).toBe("xai");
    expect(localStorage.getItem("proseus:model")).toBe("grok-3");
  });
});
