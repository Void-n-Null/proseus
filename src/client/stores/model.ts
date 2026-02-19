/**
 * Model Selection Store
 *
 * Persists the selected provider + model to both localStorage (for fast
 * hydration) and the server database (for durability across devices).
 *
 * On startup, the store hydrates from localStorage immediately, then
 * fetches the server settings and reconciles. Server is the source of truth.
 *
 * There is NO default model — the user must actively select one.
 * The provider defaults to "openrouter" only as the initial browser tab;
 * it does NOT imply a model has been selected.
 */

import { create } from "zustand";
import type { ProviderName } from "../../shared/providers.ts";
import { api } from "../api/client.ts";

const STORAGE_KEY = "proseus:model";
const PROVIDER_KEY = "proseus:provider";

interface ModelState {
  provider: ProviderName;
  modelId: string;
  /** Whether the store has been hydrated from the server. */
  hydrated: boolean;
  setProvider: (provider: ProviderName) => void;
  setModelId: (modelId: string) => void;
  setProviderAndModel: (provider: ProviderName, modelId: string) => void;
  /** Clear the selected model (but keep provider). */
  clearModel: () => void;
  /** Hydrate from server settings. Called once on app startup. */
  hydrate: () => Promise<void>;
}

/** Persist to both localStorage and server DB. */
function persistToServer(provider: ProviderName, modelId: string): void {
  const settings: Record<string, string> = {
    selected_provider: provider,
    selected_model: modelId,
  };
  api.settings.update(settings).catch(() => {
    // Silently fail — localStorage is the fast fallback
  });
}

export const useModelStore = create<ModelState>((set, get) => ({
  // Initialize from localStorage for instant hydration.
  // Provider defaults to "openrouter" (just the browser tab, not a model choice).
  // modelId defaults to "" — NO default model.
  provider:
    (localStorage.getItem(PROVIDER_KEY) as ProviderName) || "openrouter",
  modelId: localStorage.getItem(STORAGE_KEY) || "",
  hydrated: false,

  setProvider: (provider) => {
    localStorage.setItem(PROVIDER_KEY, provider);
    set({ provider });
    persistToServer(provider, get().modelId);
  },

  setModelId: (modelId) => {
    localStorage.setItem(STORAGE_KEY, modelId);
    set({ modelId });
    persistToServer(get().provider, modelId);
  },

  setProviderAndModel: (provider, modelId) => {
    localStorage.setItem(PROVIDER_KEY, provider);
    localStorage.setItem(STORAGE_KEY, modelId);
    set({ provider, modelId });
    persistToServer(provider, modelId);
  },

  clearModel: () => {
    localStorage.removeItem(STORAGE_KEY);
    set({ modelId: "" });
    persistToServer(get().provider, "");
  },

  hydrate: async () => {
    try {
      const { settings } = await api.settings.get();
      const serverModel = settings.selected_model || "";
      const serverProvider =
        (settings.selected_provider as ProviderName) || "";

      const currentModel = get().modelId;
      const currentProvider = get().provider;

      if (serverModel || serverProvider) {
        // Server has settings — adopt them
        const newModel = serverModel || currentModel;
        const newProvider = serverProvider || currentProvider;
        localStorage.setItem(STORAGE_KEY, newModel);
        localStorage.setItem(PROVIDER_KEY, newProvider);
        set({
          modelId: newModel,
          provider: newProvider as ProviderName,
          hydrated: true,
        });
      } else if (currentModel || currentProvider !== "openrouter") {
        // Server empty, localStorage has meaningful values — migrate to server
        persistToServer(currentProvider, currentModel);
        set({ hydrated: true });
      } else {
        // Both empty — user has never selected a model
        set({ hydrated: true });
      }
    } catch {
      // Server unreachable — proceed with localStorage values
      set({ hydrated: true });
    }
  },
}));

// Hydrate from server on module load
useModelStore.getState().hydrate();
