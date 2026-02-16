import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client.ts";

export function useSpeakers() {
  return useQuery({
    queryKey: ["speakers"],
    queryFn: () => api.speakers.list(),
  });
}
