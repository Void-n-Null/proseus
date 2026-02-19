/**
 * useConnections - TanStack Query hook for fetching connection status.
 *
 * Returns a map of provider -> connected boolean for easy lookup.
 */

import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client.ts";
import type { ProviderName } from "../../shared/providers.ts";

export function useConnections() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["connections"],
    queryFn: () => api.connections.list(),
    staleTime: 30_000,
    gcTime: 60_000,
  });

  const connectionStatus: Partial<Record<ProviderName, boolean>> = {};
  if (data?.connections) {
    for (const c of data.connections) {
      connectionStatus[c.provider] = c.connected;
    }
  }

  return {
    connections: data?.connections ?? [],
    connectionStatus,
    isLoading,
    refetch,
  };
}
