import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client.ts";
import type { CreateCharacterRequest, UpdateCharacterRequest } from "../../shared/api-types.ts";

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

export function useRecentChatForCharacter(characterId: string | null) {
  return useQuery({
    queryKey: ["character-recent-chat", characterId],
    queryFn: () => api.characters.getRecentChat(characterId!),
    enabled: !!characterId,
  });
}

export function useCreateChatFromCharacter() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (characterId: string) => api.characters.createChat(characterId),
    onSuccess: (_, characterId) => {
      queryClient.invalidateQueries({ queryKey: ["chats"] });
      queryClient.invalidateQueries({ queryKey: ["speakers"] });
      queryClient.invalidateQueries({ queryKey: ["character-recent-chat", characterId] });
    },
  });
}

export function useCreateCharacter() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: CreateCharacterRequest) => api.characters.create(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["characters"] });
    },
  });
}

export function useUpdateCharacter() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & UpdateCharacterRequest) =>
      api.characters.update(id, body),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["characters"] });
      queryClient.invalidateQueries({ queryKey: ["character", id] });
    },
  });
}

export function useUploadCharacterAvatar() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) =>
      api.characters.uploadAvatar(id, file),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["characters"] });
      queryClient.invalidateQueries({ queryKey: ["character", id] });
    },
  });
}
