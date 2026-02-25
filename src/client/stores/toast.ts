/**
 * Zustand store for toast notifications.
 *
 * Imperative API — can be called from anywhere (React components, hooks,
 * WebSocket handlers, etc.) without needing React context.
 *
 * Usage:
 *   import { toast } from '../stores/toast.ts';
 *   toast.error("Stream failed: connection lost");
 *   toast.success("Export complete");
 *   toast.info("Reconnecting...");
 */

import { create } from "zustand";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ToastVariant = "default" | "success" | "error" | "info";

export interface Toast {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
  /** Auto-dismiss after this many ms. `0` = no auto-dismiss. Default: 5000 */
  duration: number;
  createdAt: number;
}

interface ToastStore {
  toasts: Toast[];
  add: (toast: Omit<Toast, "id" | "createdAt">) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

let nextId = 0;

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],

  add: (input) => {
    const id = `toast-${++nextId}`;
    const entry: Toast = { ...input, id, createdAt: Date.now() };
    set((s) => ({ toasts: [...s.toasts, entry] }));
    return id;
  },

  dismiss: (id) => {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },

  clear: () => set({ toasts: [] }),
}));

// ---------------------------------------------------------------------------
// Convenience functions (importable anywhere, no hooks needed)
// ---------------------------------------------------------------------------

function addToast(
  variant: ToastVariant,
  title: string,
  options?: { description?: string; duration?: number },
): string {
  return useToastStore.getState().add({
    title,
    description: options?.description,
    variant,
    duration: options?.duration ?? 5000,
  });
}

export const toast = {
  /** Default / neutral toast */
  show: (title: string, options?: { description?: string; duration?: number }) =>
    addToast("default", title, options),
  /** Success toast (green accent) */
  success: (title: string, options?: { description?: string; duration?: number }) =>
    addToast("success", title, options),
  /** Error toast (red/destructive accent) */
  error: (title: string, options?: { description?: string; duration?: number }) =>
    addToast("error", title, { duration: 8000, ...options }),
  /** Info toast (blue/violet accent) */
  info: (title: string, options?: { description?: string; duration?: number }) =>
    addToast("info", title, options),
};
