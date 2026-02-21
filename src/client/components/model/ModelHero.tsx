/**
 * ModelHero - Toolbar + selected model detail pane for the model browser.
 *
 * Ported from proseus-ai's ModelTabHero.
 * Contains:
 * - Provider dropdown (delegates to ModelProviderDropdown)
 * - Inline API key input when provider is disconnected (the gateway)
 * - Disconnect button when connected
 * - Search input with clear
 * - Sort dropdown + filter toggle chips
 * - Selected-model detail card OR disconnect/empty CTA
 */

import React, { useState, useRef, useEffect } from "react";
import type { RefObject } from "react";
import type { Model, ModelSortKey, ModelFilters } from "../../../shared/models.ts";
import { formatContext, formatPrice } from "../../../shared/models.ts";
import { getProviderMeta, type ProviderName } from "../../../shared/providers.ts";
import ProviderIcon from "../ui/provider-icon.tsx";
import ModelProviderDropdown from "./ModelProviderDropdown.tsx";

// ============================================
// Sort config
// ============================================

const SORT_OPTIONS: { key: ModelSortKey; label: string }[] = [
  { key: "newest", label: "Newest" },
  { key: "price-asc", label: "Price: Low \u2192 High" },
  { key: "price-desc", label: "Price: High \u2192 Low" },
  { key: "context", label: "Context: Largest" },
  { key: "name", label: "Name: A \u2192 Z" },
];

// ============================================
// Filter config
// ============================================

const FILTER_CHIPS: {
  key: keyof ModelFilters;
  label: string;
  icon: string;
}[] = [
  { key: "reasoning", label: "Reasoning", icon: "brain" },
  { key: "toolCall", label: "Tools", icon: "wrench" },
  { key: "vision", label: "Vision", icon: "eye" },
  { key: "openWeights", label: "Open", icon: "scale" },
  { key: "free", label: "Free", icon: "sparkles" },
];

/** Simple inline SVG icons to avoid lucide-react dependency weight */
function FilterIcon({ name, className }: { name: string; className?: string }) {
  const cn = className ?? "w-3.5 h-3.5";
  switch (name) {
    case "brain":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cn}>
          <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
          <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" />
          <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4" />
          <path d="M17.599 6.5a3 3 0 0 0 .399-1.375" />
          <path d="M6.003 5.125A3 3 0 0 0 6.401 6.5" />
          <path d="M3.477 10.896a4 4 0 0 1 .585-.396" />
          <path d="M19.938 10.5a4 4 0 0 1 .585.396" />
          <path d="M6 18a4 4 0 0 1-1.967-.516" />
          <path d="M19.967 17.484A4 4 0 0 1 18 18" />
        </svg>
      );
    case "wrench":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cn}>
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        </svg>
      );
    case "eye":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cn}>
          <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    case "eye-off":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cn}>
          <path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" />
          <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" />
          <path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" />
          <path d="m2 2 20 20" />
        </svg>
      );
    case "scale":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cn}>
          <path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
          <path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
          <path d="M7 21h10" />
          <path d="M12 3v18" />
          <path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2" />
        </svg>
      );
    case "sparkles":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cn}>
          <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
          <path d="M20 3v4" />
          <path d="M22 5h-4" />
          <path d="M4 17v2" />
          <path d="M5 18H3" />
        </svg>
      );
    case "unlink":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cn}>
          <path d="m18.84 12.25 1.72-1.71h-.02a5.004 5.004 0 0 0-.12-7.07 5.006 5.006 0 0 0-6.95 0l-1.72 1.71" />
          <path d="m5.17 11.75-1.71 1.71a5.004 5.004 0 0 0 .12 7.07 5.006 5.006 0 0 0 6.95 0l1.71-1.71" />
          <line x1="8" y1="2" x2="8" y2="5" />
          <line x1="2" y1="8" x2="5" y2="8" />
          <line x1="16" y1="19" x2="16" y2="22" />
          <line x1="19" y1="16" x2="22" y2="16" />
        </svg>
      );
    case "external":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cn}>
          <path d="M15 3h6v6" />
          <path d="M10 14 21 3" />
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
        </svg>
      );
    default:
      return null;
  }
}

// ============================================
// Props
// ============================================

export interface ModelHeroProps {
  // Provider
  provider: ProviderName;
  onProviderChange: (provider: ProviderName) => void;
  connectionStatus?: Partial<Record<ProviderName, boolean>>;

  // Connection status for active provider
  providerConnected: boolean;

  // Connection actions
  onSaveKey: (apiKey: string) => void;
  onDisconnect: () => void;
  onOAuth: () => void;
  connectState: "idle" | "validating" | "failed";
  connectError: string | null;
  onDismissError: () => void;

  // Search
  search: string;
  onSearchChange: (value: string) => void;
  searchRef: RefObject<HTMLInputElement | null>;

  // Models meta
  totalCount: number;
  loading: boolean;

  // Selected model
  selectedModel: Model | null;

  // Sort & Filter
  sort: ModelSortKey;
  onSortChange: (sort: ModelSortKey) => void;
  filters: ModelFilters;
  onToggleFilter: (key: keyof ModelFilters) => void;
}

// ============================================
// Sort Dropdown (internal)
// ============================================

function SortDropdown({
  value,
  onChange,
  className,
}: {
  value: ModelSortKey;
  onChange: (v: ModelSortKey) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const current = SORT_OPTIONS.find((o) => o.key === value);

  return (
    <div ref={ref} className={`relative ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className={[
          "w-full h-8 px-3 rounded-md flex items-center gap-1.5",
          "text-xs font-medium transition-colors",
          open
            ? "bg-surface-hover text-text-body border border-border"
            : "bg-[oklch(1_0_0/0.03)] text-text-muted border border-border-subtle hover:bg-surface-hover hover:text-text-body",
        ].join(" ")}
      >
        <span className="whitespace-nowrap">
          {current?.label ?? "Sort"}
        </span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          className={`w-3.5 h-3.5 ml-auto transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path
            d="M3 5.5L7 9.5L11 5.5"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-1.5 z-50 min-w-[180px] rounded-lg border border-border bg-surface shadow-xl shadow-black/40 p-1">
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => {
                onChange(opt.key);
                setOpen(false);
              }}
              className={[
                "w-full text-left px-3 py-2 text-sm rounded-md transition-colors",
                opt.key === value
                  ? "text-primary bg-primary/[0.06]"
                  : "text-text-muted hover:text-text-body hover:bg-surface-hover",
              ].join(" ")}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================
// Disconnected Pane — replaces SelectedModelPane when no key
// ============================================

function DisconnectedPane({ provider }: { provider: ProviderName }) {
  const meta = getProviderMeta(provider);

  return (
    <div
      className="relative rounded-xl px-5 py-4 overflow-hidden border border-dashed border-border bg-surface"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center bg-[oklch(0.50_0_0/0.06)] border border-[oklch(0.50_0_0/0.1)]"
          >
            <ProviderIcon provider={provider} size={16} />
          </div>
          <div className="min-w-0">
            <p className="text-[15px] font-semibold text-text-muted leading-snug">
              Connect to {meta.label}
            </p>
            <p className="text-xs text-text-dim mt-0.5">
              Paste your API key to browse models.
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border">
        <span className="text-xs text-text-dim">
          Your key is stored locally and never shared.
        </span>
      </div>
    </div>
  );
}

// ============================================
// No Model Selected — Empty State
// ============================================

function NoModelSelectedPane({
  onBrowse,
}: {
  onBrowse: () => void;
}) {
  return (
    <div
      className="relative rounded-xl px-5 py-4 overflow-hidden border border-dashed border-border bg-surface"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center bg-[oklch(0.50_0_0/0.06)] border border-[oklch(0.50_0_0/0.1)]"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="w-4 h-4 text-text-dim"
            >
              <path d="M12.2 2h-.4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h.4a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2Z" />
              <path d="M4.7 10H5a2 2 0 0 1 2 2v.4a2 2 0 0 1-2 2h-.3a2 2 0 0 1-2-2V12a2 2 0 0 1 2-2Z" />
              <path d="M19 10h.3a2 2 0 0 1 2 2v.4a2 2 0 0 1-2 2H19a2 2 0 0 1-2-2V12a2 2 0 0 1 2-2Z" />
              <path d="M12.2 14h-.4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h.4a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2Z" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-[15px] font-semibold text-text-muted leading-snug">
              No model selected
            </p>
            <p className="text-xs text-text-dim mt-0.5">
              Pick one below to power your generations.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onBrowse}
          className="shrink-0 group flex items-center gap-1.5 h-8 px-3 rounded-lg text-sm font-medium transition-all duration-150 bg-primary/[0.08] text-primary border border-primary/[0.15] hover:bg-primary/[0.14] hover:border-primary/[0.25]"
        >
          Browse
          <svg
            viewBox="0 0 14 14"
            fill="none"
            className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100 group-hover:translate-y-0.5 transition-all duration-150"
          >
            <path
              d="M7 3V11M7 11L4 8M7 11L10 8"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border">
        <span className="text-xs text-text-dim">
          No capabilities to display
        </span>
      </div>
    </div>
  );
}

// ============================================
// Selected Model Detail Pane
// ============================================

const CAPABILITIES = [
  { key: "reasoning", label: "Reasoning", icon: "brain" },
  { key: "toolCall", label: "Tools", icon: "wrench" },
  { key: "vision", label: "Vision", icon: "eye" },
  { key: "openWeights", label: "Open Weights", icon: "scale" },
] as const;

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function SelectedModelPane({ model }: { model: Model }) {
  const isFree = model.inputPrice === 0 && model.outputPrice === 0;
  const hasVision = model.inputModalities?.includes("image") ?? false;
  const { color } = getProviderMeta(model.provider);

  const capabilityMap: Record<string, boolean> = {
    reasoning: !!model.reasoning,
    toolCall: !!model.toolCall,
    vision: hasVision,
    openWeights: !!model.openWeights,
  };

  const stats: string[] = [];
  if (model.contextLength) stats.push(`${formatContext(model.contextLength)} ctx`);
  if (model.maxOutputTokens)
    stats.push(`${formatContext(model.maxOutputTokens)} out`);
  if (model.inputPrice !== undefined && model.outputPrice !== undefined) {
    stats.push(
      isFree
        ? "Free"
        : `${formatPrice(model.inputPrice)} / ${formatPrice(model.outputPrice)} per M`,
    );
  }

  return (
    <div
      className="relative rounded-2xl px-5 py-4 overflow-hidden bg-surface border border-border/80"
      style={{
        boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
      }}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-4 min-w-0">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center"
            // intentionally dynamic: provider brand color
            style={{
              backgroundColor: hexToRgba(color, 0.18),
            }}
          >
            <ProviderIcon provider={model.provider} size={16} />
          </div>
          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold text-foreground truncate leading-snug">
              {model.name}
            </h3>
            <p className="text-xs font-mono text-text-dim truncate mt-0.5">
              {model.id}
            </p>
          </div>
        </div>

        {stats.length > 0 && (
          <p
            className={`text-xs font-mono shrink-0 text-right leading-relaxed ${isFree ? "text-primary" : "text-text-muted"}`}
          >
            {stats.join(" \u00B7 ")}
          </p>
        )}
      </div>

      {/* Capabilities row */}
      <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border">
        {CAPABILITIES.map(({ key, label, icon }) => {
          const supported = capabilityMap[key];
          return (
            <div
              key={key}
              className={[
                "flex items-center gap-1.5 transition-opacity",
                supported ? "opacity-100" : "opacity-30",
              ].join(" ")}
            >
              {supported ? (
                <svg
                  viewBox="0 0 12 12"
                  fill="none"
                  className="w-3 h-3 text-primary"
                >
                  <path
                    d="M2 6L5 9L10 3"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                <svg
                  viewBox="0 0 12 12"
                  fill="none"
                  className="w-3 h-3 text-text-dim"
                >
                  <path
                    d="M3 3L9 9M9 3L3 9"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
              <FilterIcon
                name={icon}
                className={`w-3 h-3 ${supported ? "text-text-body" : "text-text-dim"}`}
              />
              <span
                className={`text-xs ${supported ? "text-text-body" : "text-text-dim"}`}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================
// Validating Pane — shown while checking API key
// ============================================

function ValidatingPane({ provider }: { provider: ProviderName }) {
  const meta = getProviderMeta(provider);

  return (
    <div
      className="relative rounded-xl px-5 py-4 overflow-hidden border border-[oklch(0.70_0.15_280/0.15)] bg-surface"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div
          className="connection-icon-pulse shrink-0 w-9 h-9 rounded-lg flex items-center justify-center bg-[oklch(0.70_0.15_280/0.10)] border border-[oklch(0.70_0.15_280/0.15)]"
        >
          <ProviderIcon provider={provider} size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-text-body leading-snug">
            Connecting to {meta.label}
          </p>
          <p className="text-xs text-text-dim mt-0.5">
            Validating your API key...
          </p>
        </div>
        <div className="shrink-0 w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>

      {/* Shimmer bar */}
      <div className="mt-3 pt-3 border-t border-border">
        <div
          className="connection-shimmer-bar h-1 rounded-full bg-[oklch(0.70_0.15_280/0.08)]"
        />
      </div>
    </div>
  );
}

// ============================================
// Connection Error Banner — replaces plain red text
// ============================================

function ConnectionErrorBanner({
  provider,
  error,
  onDismiss,
}: {
  provider: ProviderName;
  error: string;
  onDismiss: () => void;
}) {
  const meta = getProviderMeta(provider);

  return (
    <div
      className="relative rounded-xl px-5 py-4 overflow-hidden border border-[oklch(0.55_0.15_40/0.25)] bg-[oklch(0.55_0.15_40/0.04)]"
    >
      <div className="flex items-start gap-3 min-w-0">
        {/* Warning icon */}
        <div
          className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center mt-0.5 bg-[oklch(0.55_0.15_40/0.12)] border border-[oklch(0.55_0.15_40/0.15)]"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-4 h-4 text-[oklch(0.70_0.15_40)]"
          >
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
            <path d="M12 9v4" />
            <path d="M12 17h.01" />
          </svg>
        </div>

        <div className="min-w-0 flex-1">
          <p
            className="text-[15px] font-semibold leading-snug text-[oklch(0.75_0.12_40)]"
          >
            Connection to {meta.label} failed
          </p>
          <p className="text-sm text-text-muted mt-1 leading-relaxed">
            {error}
          </p>
          <p className="text-xs text-text-dim mt-2">
            Double-check your key and try again. If the problem persists, the
            provider may be experiencing issues.
          </p>
        </div>

        {/* Dismiss */}
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 mt-0.5 p-1.5 rounded-md text-text-dim hover:text-text-muted hover:bg-surface-hover transition-colors"
          aria-label="Dismiss"
        >
          <svg
            viewBox="0 0 14 14"
            fill="none"
            className="w-3.5 h-3.5"
          >
            <path
              d="M3 3L11 11M11 3L3 11"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ============================================
// ModelHero
// ============================================

export default function ModelHero({
  provider,
  onProviderChange,
  connectionStatus,
  providerConnected,
  onSaveKey,
  onDisconnect,
  onOAuth,
  connectState,
  connectError,
  onDismissError,
  search,
  onSearchChange,
  searchRef,
  totalCount,
  loading,
  selectedModel,
  sort,
  onSortChange,
  filters,
  onToggleFilter,
}: ModelHeroProps) {
  const hasActiveFilters = Object.values(filters).some(Boolean);
  const providerMeta = getProviderMeta(provider);

  const isValidating = connectState === "validating";
  const isFailed = connectState === "failed";

  // Inline API key state (for disconnected providers)
  const [inlineKey, setInlineKey] = useState("");
  const [showKey, setShowKey] = useState(false);

  const handleInlineSubmit = () => {
    if (inlineKey.trim() && !isValidating) {
      onSaveKey(inlineKey.trim());
      setInlineKey("");
    }
  };

  const handleInlineKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleInlineSubmit();
    }
  };

  return (
    <>
      {/* Detail Pane — context-sensitive */}
      {isValidating && !providerConnected ? (
        <ValidatingPane provider={provider} />
      ) : isFailed && !providerConnected && connectError ? (
        <ConnectionErrorBanner
          provider={provider}
          error={connectError}
          onDismiss={onDismissError}
        />
      ) : !providerConnected ? (
        <DisconnectedPane provider={provider} />
      ) : selectedModel ? (
        <SelectedModelPane model={selectedModel} />
      ) : !loading && totalCount > 0 ? (
        <NoModelSelectedPane onBrowse={() => searchRef.current?.focus()} />
      ) : null}

      {/* Provider dropdown row */}
      <div className="flex items-center gap-3">
        <ModelProviderDropdown
          value={provider}
          onChange={onProviderChange}
          connectionStatus={connectionStatus}
        />

        {providerConnected && (
          <button
            type="button"
            onClick={onDisconnect}
            disabled={isValidating}
            className="group flex items-center gap-1.5 text-xs text-text-dim hover:text-destructive transition-colors disabled:opacity-40 disabled:pointer-events-none"
          >
            <FilterIcon name="unlink" className="w-3 h-3" />
            {isValidating ? "Disconnecting..." : "Disconnect"}
          </button>
        )}
      </div>

      {/* Connection gateway — shown when provider is disconnected */}
      {!providerConnected && (
        <div className="flex flex-col gap-3">
          {/* OAuth button — primary option for OpenRouter */}
          {provider === "openrouter" && (
            <>
              <button
                type="button"
                onClick={onOAuth}
                disabled={isValidating}
                className="w-full h-10 rounded-lg flex items-center justify-center gap-2.5 text-sm font-semibold transition-all duration-150 bg-primary text-background hover:brightness-110 active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ProviderIcon provider="openrouter" size={16} />
                Connect to OpenRouter
              </button>
              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-text-dim uppercase tracking-widest select-none">
                  or paste a key
                </span>
                <div className="flex-1 h-px bg-border" />
              </div>
            </>
          )}

          {/* Inline API key input */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1 group">
              <input
                type={showKey ? "text" : "password"}
                value={inlineKey}
                onChange={(e) => setInlineKey(e.target.value)}
                onKeyDown={handleInlineKeyDown}
                placeholder={providerMeta.keyPlaceholder ?? "Paste API key\u2026"}
                autoComplete="off"
                spellCheck={false}
                disabled={isValidating}
                className="relative w-full h-10 pl-3.5 pr-10 rounded-lg border border-border text-sm text-foreground placeholder-text-dim font-mono focus:outline-none focus:border-primary/25 focus:shadow-[0_0_0_1px_oklch(0.70_0.15_280/0.08)] transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed bg-surface"
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-dim hover:text-text-muted transition-colors"
                aria-label={showKey ? "Hide key" : "Show key"}
              >
                <FilterIcon
                  name={showKey ? "eye-off" : "eye"}
                  className="w-4 h-4"
                />
              </button>
            </div>
            <button
              type="button"
              onClick={handleInlineSubmit}
              disabled={!inlineKey.trim() || isValidating}
              className="h-10 px-5 rounded-lg flex items-center gap-2 shrink-0 text-sm font-semibold transition-all duration-150 bg-primary text-background hover:brightness-110 active:scale-[0.97] disabled:opacity-25 disabled:cursor-not-allowed"
            >
              {isValidating ? (
                <div className="w-4 h-4 border-2 border-background/30 border-t-background rounded-full animate-spin" />
              ) : (
                "Connect"
              )}
            </button>
          </div>
        </div>
      )}

      {/* Inline key helper links — hidden during validating/error (error banner handles it) */}
      {!providerConnected && !isValidating && !isFailed && (
        <div className="flex items-center gap-4">
          {providerMeta.docsUrl && (
            <a
              href={providerMeta.docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-text-dim hover:text-text-muted transition-colors"
            >
              Get a key from {providerMeta.label}
              <FilterIcon name="external" className="w-3 h-3" />
            </a>
          )}
        </div>
      )}

      {/* Search — hidden when disconnected */}
      {providerConnected && (
        <div className="group/search relative">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-dim transition-colors group-focus-within/search:text-primary/70"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search models..."
            className="w-full h-10 pl-10 pr-9 rounded-2xl border border-border text-sm text-foreground placeholder-text-dim focus:outline-none focus:border-primary/25 focus:shadow-[0_0_0_1px_oklch(0.70_0.15_280/0.08)] transition-all duration-150 bg-surface"
          />
          {search && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-dim hover:text-text-muted transition-colors"
            >
              <svg
                viewBox="0 0 14 14"
                fill="none"
                className="w-3.5 h-3.5"
              >
                <path
                  d="M3 3L11 11M11 3L3 11"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          )}
        </div>
      )}

      {/* Filter chips + Sort — hidden when disconnected */}
      {providerConnected && !loading && totalCount > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {FILTER_CHIPS.map((chip) => {
            const active = !!filters[chip.key];
            return (
              <button
                key={chip.key}
                type="button"
                onClick={() => onToggleFilter(chip.key)}
                className={[
                  "h-7 px-2.5 rounded-full flex items-center gap-1.5",
                  "text-xs font-medium transition-all duration-100",
                  active
                    ? "bg-surface-hover text-foreground border border-border"
                    : "bg-[oklch(1_0_0/0.03)] text-text-muted border border-border-subtle hover:bg-surface-hover hover:text-text-body",
                ].join(" ")}
              >
                <FilterIcon name={chip.icon} />
                <span>{chip.label}</span>
              </button>
            );
          })}

          {/* Clear filters */}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => {
                for (const chip of FILTER_CHIPS) {
                  if (filters[chip.key]) onToggleFilter(chip.key);
                }
              }}
              className="h-7 px-1.5 rounded-lg text-text-dim hover:text-text-muted transition-colors"
            >
              <svg
                viewBox="0 0 14 14"
                fill="none"
                className="w-3.5 h-3.5"
              >
                <path
                  d="M3 3L11 11M11 3L3 11"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          <SortDropdown value={sort} onChange={onSortChange} />
        </div>
      )}
    </>
  );
}
