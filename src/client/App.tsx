import React, { useState, useCallback, useEffect, useMemo, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useChatList } from "./hooks/useChat.ts";
import { useRoute } from "./hooks/useRoute.ts";
import { useIsMobile } from "./hooks/useMediaQuery.ts";
import { useVisualViewportHeight } from "./hooks/useVisualViewportHeight.ts";
import ChatPage from "./components/chat/ChatPage.tsx";
import ChatGallery from "./components/chat/ChatGallery.tsx";
import CharacterSidebar from "./components/characters/CharacterSidebar.tsx";
import PersonaSidebar from "./components/personas/PersonaSidebar.tsx";
import { useOAuthCallback } from "./hooks/useOAuthCallback.ts";
import { useDesignTemplateId } from "./hooks/useDesignTemplate.ts";
import { getTemplate } from "./templates/index.ts";
import DiscordFrameShell from "./templates/discord/DiscordFrameShell.tsx";
import type { SidebarView } from "./templates/types.ts";

export default function App() {
  const { data: chatData, isLoading, isFetching, refetch } = useChatList();
  const { route, navigateToChat, navigateHome, replaceRoute } = useRoute();
  const [sidebarView, setSidebarView] = useState<SidebarView>(
    // Default to "chats" if we loaded with a chat URL, otherwise "characters"
    route.chatId ? "chats" : "characters",
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const designTemplateId = useDesignTemplateId();
  const template = getTemplate(designTemplateId);
  const { oauthState, dismissOAuth } = useOAuthCallback();
  const isMobile = useIsMobile();
  useVisualViewportHeight(isMobile);

  const appViewportStyle = isMobile
    ? {
        height: "var(--app-visual-viewport-height, 100dvh)",
        transform: "translateZ(0)",
      }
    : undefined;

  const handleChatCreated = useCallback(
    (chatId: string) => {
      navigateToChat(chatId);
      setSidebarView("chats");
      if (template.sidebarMode === "toggle") {
        setSidebarCollapsed(true);
      }
      refetch();
    },
    [navigateToChat, refetch, template.sidebarMode],
  );

  const handleSelectChat = useCallback(
    (chatId: string) => {
      navigateToChat(chatId);
      // In toggle-mode templates, auto-collapse sidebar when a chat is opened
      if (template.sidebarMode === "toggle") {
        setSidebarCollapsed(true);
      }
    },
    [navigateToChat, template.sidebarMode],
  );

  const handleCloseChat = useCallback(() => {
    navigateHome();
  }, [navigateHome]);

  /** Desktop toggle-mode: show/hide the sidebar without closing the chat. */
  const handleDesktopToggleSidebar = useCallback(() => {
    setSidebarCollapsed((c) => !c);
  }, []);

  const chats = chatData?.chats ?? [];

  // Validate the chat ID from the URL against the actual chat list.
  // If the URL points to a chat that doesn't exist, silently redirect home.
  const activeChatId = route.chatId;
  const resolvedChatId = useMemo(() => {
    if (!activeChatId) return null;
    if (chats.some((c) => c.id === activeChatId)) return activeChatId;
    return null;
  }, [activeChatId, chats]);

  // If the URL had an invalid chat ID and data has loaded, fix the URL.
  useEffect(() => {
    if (!isLoading && !isFetching && activeChatId && !resolvedChatId) {
      replaceRoute({ page: "home", chatId: null });
    }
  }, [isLoading, isFetching, activeChatId, resolvedChatId, replaceRoute]);

  // ── Sidebar view-switching (also un-collapses in toggle mode) ──
  const handleSetView = useCallback((view: SidebarView) => {
    setSidebarView(view);
    setSidebarCollapsed(false);
  }, []);

  // ── Render-prop factories for the three sidebar panels ──
  // These let the template's Sidebar component compose the actual panel
  // content without knowing anything about CharacterSidebar / PersonaSidebar /
  // ChatGallery internals.
  const renderCharacters = useCallback(
    (tabs?: ReactNode) => <CharacterSidebar onChatCreated={handleChatCreated} tabs={tabs} />,
    [handleChatCreated],
  );
  const renderPersonas = useCallback(
    (tabs?: ReactNode) => <PersonaSidebar tabs={tabs} />,
    [],
  );
  const renderChats = useCallback(
    (tabs?: ReactNode) => (
      <ChatGallery
        activeChatId={resolvedChatId}
        onSelectChat={handleSelectChat}
        isLoading={isLoading}
        tabs={tabs}
      />
    ),
    [resolvedChatId, handleSelectChat, isLoading],
  );

  const SidebarComponent = template.Sidebar;

  const isDiscord = designTemplateId === "discord";

  /** Picks the outer shell: DiscordFrameShell on desktop-discord, plain div otherwise. */
  const Shell = isDiscord && !isMobile ? DiscordFrameShell : PassthroughShell;

  return (
    <Shell style={appViewportStyle}>
      {/* OAuth callback feedback */}
      {oauthState.status === "exchanging" && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-surface border-b border-border text-sm text-text-body shrink-0">
          <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin shrink-0" />
          Connecting to OpenRouter...
        </div>
      )}
      {oauthState.status === "success" && (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b shrink-0 bg-[oklch(0.70_0.15_155_/_0.06)] border-[oklch(0.70_0.15_155_/_0.15)]">
          <div className="flex items-center gap-2 text-sm text-[oklch(0.72_0.15_155)]">
            <svg viewBox="0 0 12 12" fill="none" className="w-4 h-4">
              <path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            OpenRouter connected successfully
          </div>
          <button type="button" onClick={dismissOAuth} className="text-text-dim hover:text-text-muted transition-colors text-xs">
            Dismiss
          </button>
        </div>
      )}
      {oauthState.status === "error" && (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b shrink-0 bg-[oklch(0.55_0.15_40_/_0.06)] border-[oklch(0.55_0.15_40_/_0.15)]">
          <div className="flex items-center gap-2 text-sm text-[oklch(0.70_0.15_40)]">
            <svg viewBox="0 0 12 12" fill="none" className="w-4 h-4">
              <path d="M3 3L9 9M9 3L3 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            OAuth failed: {oauthState.message}
          </div>
          <button type="button" onClick={dismissOAuth} className="text-text-dim hover:text-text-muted transition-colors text-xs">
            Dismiss
          </button>
        </div>
      )}

      {/* Main content */}
      {isMobile ? (
        /* ── Mobile: stacked navigation ──
           Sidebar is the base layer (always rendered, full width).
           Chat slides over it as a full-screen overlay from the right.
           Mobile uses its own header + tabs — the template Sidebar is
           desktop-only so we render sub-components directly here. */
        <div className="flex-1 min-h-0 relative overflow-hidden">
          {/* Base layer — sidebar plus local mobile nav header */}
          <div className="absolute inset-0 flex flex-col">
            <MobileHeader
              view={sidebarView}
              setView={setSidebarView}
              chatCount={chats.length}
            />

            <div className="flex-1 min-h-0">
              {sidebarView === "characters"
                ? renderCharacters()
                : sidebarView === "personas"
                  ? renderPersonas()
                  : renderChats()}
            </div>
          </div>

          {/* Chat overlay — slides in from right */}
          <AnimatePresence>
            {resolvedChatId && (
              <motion.div
                key="chat-overlay"
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={{ type: "tween", duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
                className="absolute inset-0 bg-background z-10"
              >
                {isLoading ? (
                  <CenterMessage>Loading...</CenterMessage>
                ) : (
                  <ChatPage
                    chatId={resolvedChatId}
                    onBack={handleCloseChat}
                  />
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ) : (
        /* ── Desktop: side-by-side panels ── */
        <div className="flex-1 min-h-0 flex">
          {/* Sidebar — delegated to the template's Sidebar component */}
          {(template.sidebarMode === "always" || !resolvedChatId || !sidebarCollapsed) && (
            <SidebarComponent
              view={sidebarView}
              setView={handleSetView}
              chatCount={chats.length}
              activeChatId={resolvedChatId}
              isLoading={isLoading}
              onChatCreated={handleChatCreated}
              onSelectChat={handleSelectChat}
              renderCharacters={renderCharacters}
              renderPersonas={renderPersonas}
              renderChats={renderChats}
            />
          )}

          {/* Chat area */}
          <div className="flex-1 min-w-0">
            {isLoading ? (
              <CenterMessage>Loading...</CenterMessage>
            ) : resolvedChatId ? (
              <ChatPage
                chatId={resolvedChatId}
                onBack={template.sidebarMode === "toggle" ? handleDesktopToggleSidebar : undefined}
              />
            ) : (
              <CenterMessage>
                <p className="text-base">
                  {chats.length > 0
                    ? "Select a chat or start one from a character"
                    : "Import a character to get started"}
                </p>
                <p className="text-[0.82rem] text-text-dim mt-2">
                  Drag and drop a PNG character card into the sidebar, or use the
                  Import button.
                </p>
              </CenterMessage>
            )}
          </div>
        </div>
      )}
    </Shell>
  );
}

// ─── Mobile header with inline tab buttons ──────────────────────────────────

function MobileHeader({
  view,
  setView,
  chatCount,
}: {
  view: SidebarView;
  setView: (view: SidebarView) => void;
  chatCount: number;
}) {
  return (
    <div className="flex items-center justify-between px-3 min-h-[44px] bg-[oklch(0.06_0.01_250)] border-b border-border shrink-0">
      <span className="text-[1rem] font-light tracking-[0.25em] text-text-muted font-display">
        PROSEUS
      </span>
      <div className="flex gap-[2px] bg-surface rounded-md p-[2px]">
        <ToggleButton active={view === "characters"} onClick={() => setView("characters")} label="Characters" />
        <ToggleButton active={view === "personas"} onClick={() => setView("personas")} label="Personas" />
        <ToggleButton
          active={view === "chats"}
          onClick={() => setView("chats")}
          label={`Chats${chatCount > 0 ? ` (${chatCount})` : ""}`}
        />
      </div>
    </div>
  );
}

// ─── Shared small components ────────────────────────────────────────────────

function ToggleButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-[0.6rem] py-[0.3rem] border-none rounded-sm cursor-pointer text-[0.72rem] transition-all ${
        active
          ? "bg-surface-raised text-text-body font-normal"
          : "bg-transparent text-text-dim font-light"
      }`}
    >
      {label}
    </button>
  );
}

/** Default app shell — plain div with bg-background, no frame gutters. */
function PassthroughShell({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div className="font-body text-foreground bg-background h-dvh flex flex-col" style={style}>
      {children}
    </div>
  );
}

function CenterMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-text-muted text-center p-8">
      {children}
    </div>
  );
}
