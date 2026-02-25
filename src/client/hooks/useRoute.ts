/**
 * Lightweight client-side routing — no dependencies.
 *
 * URL structure:
 *   /            → home (no chat open)
 *   /chat/:id    → chat view
 *
 * The hook reads the initial route from `window.location.pathname` on mount,
 * and subscribes to `popstate` (back/forward) to stay in sync. It exposes
 * `navigate()` which calls `pushState` and updates React state atomically.
 *
 * This replaces the ephemeral `useState<string | null>` for `activeChatId`
 * that was lost on every page refresh.
 */

import { useState, useCallback, useEffect, useSyncExternalStore } from "react";

// ---------------------------------------------------------------------------
// Route types
// ---------------------------------------------------------------------------

export interface RouteHome {
  page: "home";
  chatId: null;
}

export interface RouteChat {
  page: "chat";
  chatId: string;
}

export type Route = RouteHome | RouteChat;

// ---------------------------------------------------------------------------
// URL ↔ Route parsing
// ---------------------------------------------------------------------------

/** Parse a pathname into a Route. */
function parseRoute(pathname: string): Route {
  // Match /chat/:id
  const chatMatch = pathname.match(/^\/chat\/([^/]+)\/?$/);
  if (chatMatch && chatMatch[1]) {
    return { page: "chat", chatId: chatMatch[1] };
  }

  // Everything else is home
  return { page: "home", chatId: null };
}

/** Convert a Route to a URL pathname. */
function routeToPath(route: Route): string {
  if (route.page === "chat") {
    return `/chat/${route.chatId}`;
  }
  return "/";
}

// ---------------------------------------------------------------------------
// External store for route state
// ---------------------------------------------------------------------------
// Using useSyncExternalStore ensures we're in sync with browser navigation
// (popstate) without useState timing issues.

type RouteListener = () => void;
let currentRoute: Route = parseRoute(window.location.pathname);
const listeners = new Set<RouteListener>();

function subscribeToRoute(listener: RouteListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getRouteSnapshot(): Route {
  return currentRoute;
}

function setRoute(route: Route): void {
  currentRoute = route;
  for (const listener of listeners) {
    listener();
  }
}

// Listen for browser back/forward
if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    setRoute(parseRoute(window.location.pathname));
  });
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseRouteReturn {
  route: Route;
  /** Navigate to a chat. Pushes to browser history. */
  navigateToChat: (chatId: string) => void;
  /** Navigate home (close chat). Pushes to browser history. */
  navigateHome: () => void;
  /**
   * Replace the current history entry (no new back-stack entry).
   * Useful for redirects or correcting invalid chat IDs.
   */
  replaceRoute: (route: Route) => void;
}

export function useRoute(): UseRouteReturn {
  const route = useSyncExternalStore(subscribeToRoute, getRouteSnapshot);

  const navigateToChat = useCallback((chatId: string) => {
    const next: RouteChat = { page: "chat", chatId };
    const path = routeToPath(next);
    window.history.pushState(null, "", path);
    setRoute(next);
  }, []);

  const navigateHome = useCallback(() => {
    const next: RouteHome = { page: "home", chatId: null };
    window.history.pushState(null, "", "/");
    setRoute(next);
  }, []);

  const replaceRoute = useCallback((next: Route) => {
    const path = routeToPath(next);
    window.history.replaceState(null, "", path);
    setRoute(next);
  }, []);

  return { route, navigateToChat, navigateHome, replaceRoute };
}
