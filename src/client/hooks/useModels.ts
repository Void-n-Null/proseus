/**
 * useModels — fetches the models.dev catalog via TanStack Query.
 *
 * The catalog is fetched once and cached for 10 minutes.
 * Provides filtered model lists per provider.
 */

import { useQuery } from "@tanstack/react-query";
import {
  fetchModelCatalog,
  getModelsForProvider,
  type Model,
  type ModelsDevResponse,
} from "../../shared/models.ts";
import type { ProviderName } from "../../shared/providers.ts";

/** Fetch the full models.dev catalog. Cached for 10 min. */
export function useModelCatalog() {
  return useQuery<ModelsDevResponse>({
    queryKey: ["models-dev-catalog"],
    queryFn: ({ signal }) => fetchModelCatalog(signal),
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    retry: 2,
  });
}

/** Get models for a specific provider from the cached catalog. */
export function useProviderModels(provider: ProviderName): {
  models: Model[];
  isLoading: boolean;
} {
  const { data: catalog, isLoading } = useModelCatalog();

  if (!catalog) return { models: [], isLoading };

  return {
    models: getModelsForProvider(catalog, provider),
    isLoading: false,
  };
}
