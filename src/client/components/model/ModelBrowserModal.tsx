/**
 * ModelBrowserModal - Full model browsing experience in a Dialog.
 *
 * The single gateway for provider connections AND model selection.
 * When a provider is disconnected, shows inline API key input.
 * When connected, shows the full browsing grid with search/filter/sort.
 *
 * Orchestrator component that owns state, data fetching, and composes:
 * - ModelHero (toolbar + connection gateway + search + sort/filter)
 * - ModelGridCard (individual model cards in the browsing grid)
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../ui/dialog.tsx";
import { useModelStore } from "../../stores/model.ts";
import { useProviderModels } from "../../hooks/useModels.ts";
import { useConnections } from "../../hooks/useConnections.ts";
import { api } from "../../api/client.ts";
import {
  rankModelsBySearch,
  filterModels,
  sortModels,
  type ModelSortKey,
  type ModelFilters,
} from "../../../shared/models.ts";
import { PROVIDER_IDS, type ProviderName } from "../../../shared/providers.ts";
import { startOpenRouterOAuth } from "../../lib/openrouter-oauth.ts";
import ModelHero from "./ModelHero.tsx";
import ModelGridCard from "./ModelGridCard.tsx";

const DEFAULT_FILTERS: ModelFilters = { toolCall: true };

export interface ModelBrowserModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ModelBrowserModal({
  open,
  onOpenChange,
}: ModelBrowserModalProps) {
  const { provider, modelId, setProviderAndModel, setProvider } =
    useModelStore();
  const { models, isLoading } = useProviderModels(provider);
  const { connectionStatus, refetch: refetchConnections } = useConnections();

  // Connection flow state
  const [connectState, setConnectState] = useState<
    "idle" | "validating" | "failed"
  >("idle");
  const [connectError, setConnectError] = useState<string | null>(null);

  const providerConnected = connectionStatus[provider] ?? false;

  // Search
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  // Sort & Filter
  const [sort, setSort] = useState<ModelSortKey>("newest");
  const [filters, setFilters] = useState<ModelFilters>(DEFAULT_FILTERS);

  // Provider change resets local UI state
  const handleProviderChange = useCallback(
    (newProvider: ProviderName) => {
      setSearch("");
      setFilters(DEFAULT_FILTERS);
      setSort("newest");
      setConnectState("idle");
      setConnectError(null);
      setProvider(newProvider);
    },
    [setProvider],
  );

  // Auto-switch to a connected provider on first open.
  // Prefers OpenRouter; falls back to first connected provider in registry order.
  // Only fires once per open to avoid fighting user's intentional switches.
  const hasAutoSwitchedRef = useRef(false);
  useEffect(() => {
    if (!open || hasAutoSwitchedRef.current) return;
    // Wait until connectionStatus has real data (at least one key present)
    if (Object.keys(connectionStatus).length === 0) return;

    hasAutoSwitchedRef.current = true;

    if (connectionStatus[provider]) return; // Current provider is fine

    // Prefer OpenRouter
    if (provider !== "openrouter" && connectionStatus.openrouter) {
      handleProviderChange("openrouter");
      return;
    }

    // Otherwise first connected provider in registry order
    const connected = PROVIDER_IDS.find(
      (id) => id !== provider && connectionStatus[id],
    );
    if (connected) {
      handleProviderChange(connected);
    }
    // No connected providers — stay put, DisconnectedPane handles it
  }, [open, connectionStatus, provider, handleProviderChange]);

  // Reset auto-switch flag when modal is closed so it re-evaluates on next open
  useEffect(() => {
    if (!open) {
      hasAutoSwitchedRef.current = false;
    }
  }, [open]);

  // Apply filters -> sort -> search
  const displayModels = useMemo(() => {
    const hasFilters = Object.values(filters).some(Boolean);
    const filtered = hasFilters ? filterModels(models, filters) : models;
    const sorted = sortModels(filtered, sort);

    if (search.trim()) {
      return rankModelsBySearch(sorted, search.trim(), 60);
    }
    return sorted;
  }, [models, filters, sort, search]);

  // Save API key (connect) — drives the validating -> idle/failed flow
  const handleSaveKey = useCallback(
    async (apiKey: string) => {
      setConnectState("validating");
      setConnectError(null);
      try {
        await api.connections.save(provider, apiKey);
        await refetchConnections();
        setConnectState("idle");
      } catch (err) {
        setConnectError(
          err instanceof Error ? err.message : "Failed to save connection",
        );
        setConnectState("failed");
      }
    },
    [provider, refetchConnections],
  );

  // Disconnect
  const handleDisconnect = useCallback(async () => {
    setConnectState("validating");
    setConnectError(null);
    try {
      await api.connections.delete(provider);
      await refetchConnections();
      setConnectState("idle");
    } catch (err) {
      setConnectError(
        err instanceof Error ? err.message : "Failed to disconnect",
      );
      setConnectState("failed");
    }
  }, [provider, refetchConnections]);

  // Select model
  const handleSelect = useCallback(
    (id: string) => {
      setProviderAndModel(provider, id);
    },
    [provider, setProviderAndModel],
  );

  const handleToggleFilter = useCallback((key: keyof ModelFilters) => {
    setFilters((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const selectedModel = useMemo(
    () => (modelId ? models.find((m) => m.id === modelId) : null),
    [models, modelId],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[900px] max-h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-0">
          <DialogTitle className="text-foreground text-lg font-semibold">
            Model Browser
          </DialogTitle>
          <DialogDescription className="text-text-muted text-sm">
            Connect providers and select an AI model for your generations.
          </DialogDescription>
        </DialogHeader>

        {/* Hero: non-scrolling zone so dropdowns aren't clipped */}
        <div className="flex flex-col gap-4 px-6 pt-4 pb-2 shrink-0 overflow-visible relative z-10">
          <ModelHero
            provider={provider}
            onProviderChange={handleProviderChange}
            connectionStatus={connectionStatus}
            providerConnected={providerConnected}
            onSaveKey={handleSaveKey}
            onDisconnect={handleDisconnect}
            onOAuth={() => startOpenRouterOAuth()}
            connectState={connectState}
            connectError={connectError}
            onDismissError={() => { setConnectState("idle"); setConnectError(null); }}
            search={search}
            onSearchChange={setSearch}
            searchRef={searchRef}
            totalCount={models.length}
            loading={isLoading}
            selectedModel={selectedModel ?? null}
            sort={sort}
            onSortChange={setSort}
            filters={filters}
            onToggleFilter={handleToggleFilter}
          />
        </div>

        {/* Grid: scrollable zone */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-4">
          {!providerConnected ? null : isLoading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin mb-3" />
              <span className="text-sm text-text-muted">
                Loading models...
              </span>
              <span className="text-xs text-text-dim mt-1">
                Syncing catalog from models.dev
              </span>
            </div>
          ) : displayModels.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 auto-rows-min pb-2">
              {displayModels.map((m) => (
                <ModelGridCard
                  key={m.id}
                  model={m}
                  isSelected={m.id === modelId}
                  onSelect={() => handleSelect(m.id)}
                />
              ))}
            </div>
          ) : search || Object.values(filters).some(Boolean) ? (
            <div className="py-16 text-center">
              <span className="text-sm text-text-muted">
                No models match
                {search ? (
                  <>
                    {" "}
                    <span className="font-mono text-text-body">
                      &quot;{search}&quot;
                    </span>
                  </>
                ) : (
                  ""
                )}
                {search && Object.values(filters).some(Boolean)
                  ? " with"
                  : ""}
                {Object.values(filters).some(Boolean)
                  ? " active filters"
                  : ""}
              </span>
              <p className="text-xs text-text-dim mt-1.5">
                Try broadening your search or clearing a filter.
              </p>
            </div>
          ) : (
            <div className="py-16 text-center">
              <span className="text-sm text-text-dim">
                No models available
              </span>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
