/**
 * useOAuthCallback - Handles the OpenRouter OAuth redirect on mount.
 *
 * When the user is redirected back from OpenRouter with a ?code= param,
 * this hook exchanges it for an API key, saves it, and cleans the URL.
 *
 * Returns the current OAuth processing state so the UI can show feedback.
 */

import { useEffect, useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getOAuthCodeFromUrl,
  exchangeOpenRouterCode,
  cleanOAuthCodeFromUrl,
} from "../lib/openrouter-oauth.ts";
import { api } from "../api/client.ts";
import { useModelStore } from "../stores/model.ts";

export type OAuthState =
  | { status: "idle" }
  | { status: "exchanging" }
  | { status: "success" }
  | { status: "error"; message: string };

export function useOAuthCallback() {
  const [state, setState] = useState<OAuthState>({ status: "idle" });
  const handledRef = useRef(false);
  const queryClient = useQueryClient();
  const setProvider = useModelStore((s) => s.setProvider);

  useEffect(() => {
    const code = getOAuthCodeFromUrl();
    if (!code || handledRef.current) return;
    handledRef.current = true;

    // Clean URL immediately so refresh doesn't re-trigger
    cleanOAuthCodeFromUrl();

    (async () => {
      setState({ status: "exchanging" });

      const result = await exchangeOpenRouterCode(code);

      if ("error" in result) {
        setState({ status: "error", message: result.error });
        return;
      }

      // Save the key via our connections API (which also validates it)
      try {
        await api.connections.save("openrouter", result.key);
        await queryClient.invalidateQueries({ queryKey: ["connections"] });
        setProvider("openrouter");
        setState({ status: "success" });
      } catch (err) {
        setState({
          status: "error",
          message:
            err instanceof Error ? err.message : "Failed to save connection",
        });
      }
    })();
  }, [queryClient, setProvider]);

  const dismiss = () => setState({ status: "idle" });

  return { oauthState: state, dismissOAuth: dismiss };
}
