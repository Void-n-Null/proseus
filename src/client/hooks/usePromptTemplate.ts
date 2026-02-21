import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client.ts";
import type { PromptTemplate } from "../../shared/prompt-template.ts";

const QUERY_KEY = ["prompt-template"] as const;

export function usePromptTemplate() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => api.settings.getPromptTemplate(),
    staleTime: 60_000,
    gcTime: 120_000,
  });

  const { mutate: updateTemplate, isPending: isUpdating } = useMutation({
    mutationFn: (template: PromptTemplate) =>
      api.settings.updatePromptTemplate(template),
    onMutate: async (template) => {
      await qc.cancelQueries({ queryKey: QUERY_KEY });
      const previous = qc.getQueryData<{ template: PromptTemplate }>(QUERY_KEY);
      qc.setQueryData(QUERY_KEY, { template });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        qc.setQueryData(QUERY_KEY, context.previous);
      }
    },
    onSuccess: (data) => {
      qc.setQueryData(QUERY_KEY, { template: data.template });
    },
  });

  return {
    template: data?.template ?? null,
    isLoading,
    updateTemplate,
    isUpdating,
  };
}
