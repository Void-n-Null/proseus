/**
 * Zustand store for WebSocket connection status.
 *
 * Provides global, reactive access to the WS connection state so any
 * component (Composer, status indicators, etc.) can subscribe without
 * prop-drilling `wsStatus` through the tree.
 *
 * Also tracks reconnection attempts for UI feedback.
 */

import { create } from 'zustand';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

interface ConnectionStore {
  status: ConnectionStatus;
  /** Number of consecutive reconnect attempts (resets on successful connect). */
  reconnectAttempt: number;
  /** Timestamp of the last successful connection (or null if never connected). */
  lastConnectedAt: number | null;

  setStatus: (status: ConnectionStatus) => void;
  setReconnectAttempt: (attempt: number) => void;
  markConnected: () => void;
  markDisconnected: () => void;
  markReconnecting: (attempt: number) => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useConnectionStore = create<ConnectionStore>((set) => ({
  status: 'disconnected',
  reconnectAttempt: 0,
  lastConnectedAt: null,

  setStatus: (status) => set({ status }),
  setReconnectAttempt: (attempt) => set({ reconnectAttempt: attempt }),

  markConnected: () =>
    set({
      status: 'connected',
      reconnectAttempt: 0,
      lastConnectedAt: Date.now(),
    }),

  markDisconnected: () => set({ status: 'disconnected' }),

  markReconnecting: (attempt) =>
    set({
      status: 'reconnecting',
      reconnectAttempt: attempt,
    }),
}));

// ---------------------------------------------------------------------------
// Selector hooks
// ---------------------------------------------------------------------------

/** Current connection status. */
export function useConnectionStatus(): ConnectionStatus {
  return useConnectionStore((s) => s.status);
}

/** True when the WebSocket is fully connected and ready to send. */
export function useIsConnected(): boolean {
  return useConnectionStore((s) => s.status === 'connected');
}

/** True when we're actively trying to reconnect. */
export function useIsReconnecting(): boolean {
  return useConnectionStore((s) => s.status === 'reconnecting');
}

/** Current reconnect attempt number (0 when connected). */
export function useReconnectAttempt(): number {
  return useConnectionStore((s) => s.reconnectAttempt);
}
