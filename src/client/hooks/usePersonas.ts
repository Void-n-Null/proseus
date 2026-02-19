import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client.ts";

export function usePersonas() {
  return useQuery({
    queryKey: ["personas"],
    queryFn: () => api.personas.list(),
  });
}

export function usePersona(id: string | null) {
  return useQuery({
    queryKey: ["persona", id],
    queryFn: () => api.personas.get(id!),
    enabled: !!id,
  });
}

export function useCreatePersona() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; prompt?: string; is_global?: boolean }) =>
      api.personas.create(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["personas"] });
    },
  });
}

export function useUpdatePersona() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      name?: string;
      prompt?: string;
      is_global?: boolean;
    }) => api.personas.update(id, body),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["personas"] });
      queryClient.invalidateQueries({ queryKey: ["persona", vars.id] });
    },
  });
}

export function useUploadPersonaAvatar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) =>
      api.personas.uploadAvatar(id, file),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["personas"] });
      queryClient.invalidateQueries({ queryKey: ["persona", vars.id] });
    },
  });
}

export function useDeletePersona() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.personas.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["personas"] });
    },
  });
}

export function useSetChatPersona() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ chatId, personaId }: { chatId: string; personaId: string | null }) =>
      api.personas.setChatPersona(chatId, personaId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["chats"] });
      queryClient.invalidateQueries({ queryKey: ["chat", data.chat.id] });
    },
  });
}
