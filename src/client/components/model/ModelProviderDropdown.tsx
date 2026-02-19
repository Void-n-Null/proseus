/**
 * ModelProviderDropdown - Provider selector with connection status dots.
 *
 * Ported from proseus-ai's ModelTabProviderDropdown.
 * Full keyboard navigation (up/down/enter/esc) with ARIA listbox semantics.
 * Uses our OKLCH design tokens with brand colors from the provider registry.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  PROVIDERS,
  getProviderMeta,
  type ProviderName,
} from "../../../shared/providers.ts";
import ProviderIcon from "../ui/provider-icon.tsx";

export interface ProviderDropdownProps {
  value: ProviderName;
  onChange: (provider: ProviderName) => void;
  /** Map of provider -> connected boolean. Undefined = assume connected. */
  connectionStatus?: Partial<Record<ProviderName, boolean>>;
}

export default function ModelProviderDropdown({
  value,
  onChange,
  connectionStatus,
}: ProviderDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const meta = getProviderMeta(value);
  const isConnected = connectionStatus?.[value] ?? true;

  const activeIndex = PROVIDERS.findIndex((p) => p.id === value);

  const open = useCallback(() => {
    setIsOpen(true);
    setFocusedIndex(activeIndex >= 0 ? activeIndex : 0);
  }, [activeIndex]);

  const close = useCallback(() => {
    setIsOpen(false);
    setFocusedIndex(-1);
    triggerRef.current?.focus();
  }, []);

  const select = useCallback(
    (index: number) => {
      const provider = PROVIDERS[index];
      if (provider) {
        onChange(provider.id);
        close();
      }
    },
    [onChange, close],
  );

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen, close]);

  // Scroll focused item into view
  useEffect(() => {
    if (!isOpen || focusedIndex < 0) return;
    const item = listRef.current?.querySelector(
      `[data-index="${focusedIndex}"]`,
    ) as HTMLElement | null;
    item?.scrollIntoView({ block: "nearest" });
  }, [isOpen, focusedIndex]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen) {
        if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
        return;
      }

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setFocusedIndex((i) => (i + 1) % PROVIDERS.length);
          break;
        case "ArrowUp":
          e.preventDefault();
          setFocusedIndex(
            (i) => (i - 1 + PROVIDERS.length) % PROVIDERS.length,
          );
          break;
        case "Home":
          e.preventDefault();
          setFocusedIndex(0);
          break;
        case "End":
          e.preventDefault();
          setFocusedIndex(PROVIDERS.length - 1);
          break;
        case "Enter":
        case " ":
          e.preventDefault();
          if (focusedIndex >= 0) select(focusedIndex);
          break;
        case "Escape":
          e.preventDefault();
          close();
          break;
        case "Tab":
          close();
          break;
      }
    },
    [isOpen, focusedIndex, open, close, select],
  );

  const focusedProvider = focusedIndex >= 0 ? PROVIDERS[focusedIndex] : undefined;
  const focusedId = focusedProvider
    ? `provider-option-${focusedProvider.id}`
    : undefined;

  return (
    <div ref={ref} className="relative" onKeyDown={handleKeyDown}>
      {/* Trigger */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (isOpen ? close() : open())}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-activedescendant={isOpen ? focusedId : undefined}
        className={[
          "relative group flex items-center gap-2.5 w-full md:w-80 h-10 px-3.5 text-sm",
          "transition-all duration-150",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50",
          isOpen
            ? "z-[51] rounded-t-lg border border-b-0 border-border"
            : "rounded-lg border border-border hover:border-border-subtle",
        ].join(" ")}
        style={{
          background: "var(--color-surface)",
          backdropFilter: "blur(20px)",
        }}
      >
        <span className="text-text-dim whitespace-nowrap text-sm">
          Provider
        </span>
        <span className="w-px h-4 bg-border mx-1" />
        <ProviderIcon provider={value} size={14} />
        <span className="text-foreground font-medium whitespace-nowrap">
          {meta.label}
        </span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          className={[
            "w-3.5 h-3.5 text-text-dim transition-transform duration-200 ml-auto",
            "group-hover:text-text-muted",
            isOpen ? "rotate-180" : "",
          ].join(" ")}
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

      {/* Popover */}
      {isOpen && (
        <div
          className="absolute z-50 left-0 top-full -mt-px w-full md:w-80 rounded-b-lg overflow-hidden border border-t-0 border-border shadow-[0_20px_40px_-8px_rgba(0,0,0,0.7)]"
          style={{
            background: "var(--color-surface)",
            backdropFilter: "blur(20px)",
          }}
        >
          {/* List */}
          <div
            ref={listRef}
            role="listbox"
            aria-label="Select provider"
            className="p-1.5"
          >
            {PROVIDERS.map((p, index) => {
              const pMeta = getProviderMeta(p.id);
              const pConnected = connectionStatus?.[p.id] ?? false;
              const isActive = p.id === value;
              const isFocused = index === focusedIndex;

              return (
                <div
                  key={p.id}
                  id={`provider-option-${p.id}`}
                  role="option"
                  aria-selected={isActive}
                  data-index={index}
                  onClick={() => select(index)}
                  onMouseEnter={() => setFocusedIndex(index)}
                  className="relative rounded-md cursor-pointer transition-colors duration-75"
                >
                  {/* Active item: warm left edge */}
                  {isActive && (
                    <div
                      className="absolute inset-0 rounded-md pointer-events-none"
                      style={{
                        background:
                          "linear-gradient(90deg, oklch(0.60 0.15 60 / 0.12) 0%, transparent 60%)",
                        borderLeft:
                          "2px solid oklch(0.60 0.15 60 / 0.6)",
                      }}
                    />
                  )}

                  {/* Focus highlight */}
                  {isFocused && !isActive && (
                    <div
                      className="absolute inset-0 rounded-md pointer-events-none"
                      style={{
                        background:
                          "linear-gradient(90deg, oklch(0.50 0 0 / 0.10) 0%, transparent 60%)",
                        borderLeft:
                          "2px solid oklch(0.50 0 0 / 0.35)",
                      }}
                    />
                  )}

                  <div className="relative flex items-center gap-3 px-3 py-2.5">
                    {/* Provider icon */}
                    <div
                      className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
                      style={{
                        background: isActive
                          ? `color-mix(in oklch, ${pMeta.color} 12%, transparent)`
                          : pConnected
                            ? `color-mix(in oklch, ${pMeta.color} 6%, transparent)`
                            : "oklch(1 0 0 / 0.03)",
                      }}
                    >
                      <ProviderIcon
                        provider={p.id}
                        size={15}
                        color={pConnected ? undefined : "var(--color-text-dim)"}
                      />
                    </div>

                    {/* Name */}
                    <span
                      className={[
                        "flex-1 truncate text-sm",
                        isActive
                          ? "text-foreground font-medium"
                          : pConnected
                            ? "text-text-body"
                            : "text-text-dim",
                      ].join(" ")}
                    >
                      {p.label}
                    </span>

                    {/* Connection status */}
                    <span
                      className={[
                        "text-[11px] shrink-0",
                        pConnected ? "text-primary" : "text-text-dim",
                      ].join(" ")}
                    >
                      {pConnected ? "Ready" : "No key"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Keyboard hint footer */}
          <div className="flex items-center justify-center gap-2.5 px-3 py-1.5 border-t border-border">
            <span className="flex items-center gap-1 text-[10px] text-text-dim/80">
              <kbd className="inline-flex items-center justify-center w-[18px] h-[16px] rounded-sm border border-border bg-[oklch(1_0_0/0.03)] text-[9px] font-mono leading-none">
                &uarr;
              </kbd>
              <kbd className="inline-flex items-center justify-center w-[18px] h-[16px] rounded-sm border border-border bg-[oklch(1_0_0/0.03)] text-[9px] font-mono leading-none">
                &darr;
              </kbd>
            </span>
            <span className="flex items-center gap-1 text-[10px] text-text-dim/80">
              <kbd className="inline-flex items-center justify-center h-[16px] px-1 rounded-sm border border-border bg-[oklch(1_0_0/0.03)] text-[9px] font-mono leading-none">
                &crarr;
              </kbd>
              select
            </span>
            <span className="flex items-center gap-1 text-[10px] text-text-dim/80">
              <kbd className="inline-flex items-center justify-center h-[16px] px-1 rounded-sm border border-border bg-[oklch(1_0_0/0.03)] text-[9px] font-mono leading-none">
                esc
              </kbd>
              close
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
