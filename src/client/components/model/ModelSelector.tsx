/**
 * Model Selector — compact header trigger that opens the Model Browser modal.
 *
 * Three display states:
 * 1. No provider connected → "Connect Provider" (dimmed, dashed border)
 * 2. Provider connected, no model → "Select model…" (dimmed)
 * 3. Fully configured → provider icon + model name
 */

import React, { useState } from "react";
import ProviderIcon from "../ui/provider-icon.tsx";
import { useModelStore } from "../../stores/model.ts";
import { useProviderModels } from "../../hooks/useModels.ts";
import { useConnections } from "../../hooks/useConnections.ts";
import ModelBrowserModal from "./ModelBrowserModal.tsx";
import { getProviderBranding } from "../../../shared/brandingData.ts";

export default function ModelSelector() {
  const { provider, modelId } = useModelStore();
  const { models } = useProviderModels(provider);
  const { connectionStatus } = useConnections();
  const [modalOpen, setModalOpen] = useState(false);
  const providerBranding = getProviderBranding(provider);

  const providerConnected = connectionStatus[provider] ?? false;
  const hasAnyConnection = Object.values(connectionStatus).some(Boolean);
  const selectedModel = models.find((m) => m.id === modelId);

  // Determine display state
  const needsProvider = !providerConnected && !hasAnyConnection;
  const needsModel = providerConnected && !selectedModel;
  const isReady = providerConnected && !!selectedModel;

  const displayName = isReady
    ? selectedModel.name
    : needsProvider
      ? "Connect Provider"
      : needsModel
        ? "Select model\u2026"
        : selectedModel?.name || modelId || "Select model\u2026";

  return (
    <>
      <button
        onClick={() => setModalOpen(true)}
        className={[
          "flex items-center gap-1.5 h-8 px-3 max-w-[240px]",
          "rounded-lg text-xs font-medium transition-all duration-150",
          "hover:bg-surface-hover active:scale-[0.97]",
          needsProvider
            ? "border border-dashed border-border text-text-dim bg-surface"
            : "border border-border bg-surface-raised hover:border-border",
          isReady ? "text-text-body" : "text-text-dim",
        ].join(" ")}
      >
        {needsProvider ? (
          // Unlinked icon when no provider connected
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-3.5 h-3.5 shrink-0 opacity-50"
          >
            <path d="m18.84 12.25 1.72-1.71h-.02a5.004 5.004 0 0 0-.12-7.07 5.006 5.006 0 0 0-6.95 0l-1.72 1.71" />
            <path d="m5.17 11.75-1.71 1.71a5.004 5.004 0 0 0 .12 7.07 5.006 5.006 0 0 0 6.95 0l1.71-1.71" />
            <line x1="8" y1="2" x2="8" y2="5" />
            <line x1="2" y1="8" x2="5" y2="8" />
            <line x1="16" y1="19" x2="16" y2="22" />
            <line x1="19" y1="16" x2="22" y2="16" />
          </svg>
        ) : (
          <div
            className="w-5 h-5 rounded-md flex items-center justify-center shrink-0"
            style={{ backgroundColor: providerBranding.bg }}
          >
            <ProviderIcon provider={provider} size={12} />
          </div>
        )}
        <span className="truncate">{displayName}</span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          className="shrink-0 opacity-50"
        >
          <path
            d="M2 3.5L5 6.5L8 3.5"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      <ModelBrowserModal open={modalOpen} onOpenChange={setModalOpen} />
    </>
  );
}
