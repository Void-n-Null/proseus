import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client.ts";

export function useCharacters() {
  return useQuery({
    queryKey: ["characters"],
    queryFn: () => api.characters.list(),
  });
}

export function useCharacter(id: string | null) {
  return useQuery({
    queryKey: ["character", id],
    queryFn: () => api.characters.get(id!),
    enabled: !!id,
  });
}

export function useImportCharacter() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ file, force }: { file: File; force?: boolean }) =>
      api.characters.import(file, { force }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["characters"] });
    },
  });
}

export function useImportCharacterUrl() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (url: string) => api.characters.importUrl(url),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["characters"] });
    },
  });
}

export function useDeleteCharacter() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.characters.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["characters"] });
    },
  });
}

export function useCreateChatFromCharacter() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (characterId: string) => api.characters.createChat(characterId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chats"] });
    },
  });
}
