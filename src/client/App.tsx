import React, { useState, useCallback, useEffect, useMemo } from "react";
import { useChatList } from "./hooks/useChat.ts";
import { api } from "./api/client.ts";
import { useRoute } from "./hooks/useRoute.ts";
import ChatPage from "./components/chat/ChatPage.tsx";
import CharacterSidebar from "./components/characters/CharacterSidebar.tsx";
import PersonaSidebar from "./components/personas/PersonaSidebar.tsx";
import ModelSelector from "./components/model/ModelSelector.tsx";
import { useOAuthCallback } from "./hooks/useOAuthCallback.ts";
import PromptTemplateModal from "./components/prompt-template/PromptTemplateModal.tsx";

export default function App() {
  const { data: chatData, isLoading, isFetching, refetch } = useChatList();
  const [seeding, setSeeding] = useState(false);
  const { route, navigateToChat, navigateHome, replaceRoute } = useRoute();
  const [sidebarView, setSidebarView] = useState<"characters" | "chats" | "personas">(
    // Default to "chats" if we loaded with a chat URL, otherwise "characters"
    route.chatId ? "chats" : "characters",
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [promptTemplateOpen, setPromptTemplateOpen] = useState(false);
  const { oauthState, dismissOAuth } = useOAuthCallback();

  const handleSeed = async () => {
    setSeeding(true);
    try {
      await api.dev.seed();
      await refetch();
    } finally {
      setSeeding(false);
    }
  };

  const handleChatCreated = useCallback(
    (chatId: string) => {
      navigateToChat(chatId);
      setSidebarView("chats");
      refetch();
    },
    [navigateToChat, refetch],
  );

  const handleSelectChat = useCallback(
    (chatId: string) => {
      navigateToChat(chatId);
    },
    [navigateToChat],
  );

  const handleCloseChat = useCallback(() => {
    navigateHome();
  }, [navigateHome]);

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

  return (
    <div className="font-body text-foreground bg-background h-screen flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-[oklch(0.06_0.01_250)] border-b border-border shrink-0 gap-3">
        <span className="text-[1.1rem] font-light tracking-[0.25em] text-text-muted font-display">
          PROSEUS
        </span>

        {/* Sidebar view toggle */}
        <div className="flex items-center gap-[0.35rem]">
          <button
            onClick={() => setSidebarCollapsed((c) => !c)}
            title={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
            className="px-[0.45rem] py-[0.3rem] bg-surface text-text-dim border-none rounded-md cursor-pointer text-[0.78rem] leading-none transition-colors"
            onMouseEnter={(e) =>
              (e.currentTarget.style.color = "var(--color-text-body)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.color = "var(--color-text-dim)")
            }
          >
            {sidebarCollapsed ? "\u25B6" : "\u25C0"}
          </button>
          <div className="flex gap-[2px] bg-surface rounded-md p-[2px]">
            <ToggleButton
              active={sidebarView === "characters"}
              onClick={() => {
                setSidebarView("characters");
                setSidebarCollapsed(false);
              }}
              label="Characters"
            />
            <ToggleButton
              active={sidebarView === "personas"}
              onClick={() => {
                setSidebarView("personas");
                setSidebarCollapsed(false);
              }}
              label="Personas"
            />
            <ToggleButton
              active={sidebarView === "chats"}
              onClick={() => {
                setSidebarView("chats");
                setSidebarCollapsed(false);
              }}
              label={`Chats${chats.length > 0 ? ` (${chats.length})` : ""}`}
            />
          </div>
        </div>

        {/* Model selector */}
        <ModelSelector />

        <div className="flex gap-2 items-center">
          <button
            onClick={() => setPromptTemplateOpen(true)}
            title="Prompt Template"
            className="px-2 py-[0.35rem] bg-surface-raised text-text-muted border border-border rounded-md cursor-pointer text-[0.85rem] leading-none transition-colors"
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-text-body)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--color-text-muted)")}
          >
            ⚙
          </button>
          {resolvedChatId && (
            <button
              onClick={handleCloseChat}
              className="px-3 py-[0.35rem] bg-surface-raised text-text-muted border border-border rounded-md cursor-pointer text-[0.78rem] transition-colors"
            >
              Close Chat
            </button>
          )}
          <button
            onClick={handleSeed}
            disabled={seeding}
            className="px-3 py-[0.35rem] bg-surface-raised text-text-muted border border-border rounded-md text-[0.78rem]"
            style={{
              cursor: seeding ? "wait" : "pointer",
              opacity: seeding ? 0.5 : 1,
            }} /* intentionally dynamic */
          >
            {seeding ? "Seeding..." : "Seed Demo"}
          </button>
        </div>
      </div>

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

      {/* Prompt Template Modal */}
      {promptTemplateOpen && (
        <div
          onClick={() => setPromptTemplateOpen(false)}
          className="fixed inset-0 bg-[oklch(0_0_0_/_0.6)] flex items-center justify-center z-50"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-surface border border-border rounded-md w-[min(920px,95vw)] h-[min(700px,88vh)] flex flex-col overflow-hidden"
          >
            <PromptTemplateModal onClose={() => setPromptTemplateOpen(false)} />
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 min-h-0 flex">
        {/* Sidebar */}
        {!sidebarCollapsed && (
          sidebarView === "characters" ? (
            <CharacterSidebar onChatCreated={handleChatCreated} />
          ) : sidebarView === "personas" ? (
            <PersonaSidebar />
          ) : (
            <ChatListSidebar
              chats={chats}
              activeChatId={resolvedChatId}
              onSelectChat={handleSelectChat}
              isLoading={isLoading}
            />
          )
        )}

        {/* Chat area */}
        <div className="flex-1 min-w-0">
          {isLoading ? (
            <CenterMessage>Loading...</CenterMessage>
          ) : resolvedChatId ? (
            <ChatPage chatId={resolvedChatId} />
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
    </div>
  );
}

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

function ChatListSidebar({
  chats,
  activeChatId,
  onSelectChat,
  isLoading,
}: {
  chats: Array<{
    id: string;
    name: string;
    message_count: number;
    last_message_preview: string;
    updated_at: number;
  }>;
  activeChatId: string | null;
  onSelectChat: (id: string) => void;
  isLoading: boolean;
}) {
  return (
    <div className="w-[280px] min-w-[280px] h-full flex flex-col bg-surface border-r border-border">
      <div className="p-3 border-b border-border">
        <span className="text-xs font-normal tracking-[0.15em] text-text-muted uppercase">
          Chats
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-[0.35rem]">
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-text-dim text-[0.8rem]">
            Loading...
          </div>
        ) : chats.length === 0 ? (
          <div className="flex items-center justify-center h-full text-text-dim text-[0.82rem]">
            No chats yet
          </div>
        ) : (
          <div className="flex flex-col gap-[2px]">
            {chats.map((chat) => (
              <ChatListItem
                key={chat.id}
                chat={chat}
                isActive={chat.id === activeChatId}
                onClick={() => onSelectChat(chat.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ChatListItem({
  chat,
  isActive,
  onClick,
}: {
  chat: {
    id: string;
    name: string;
    message_count: number;
    last_message_preview: string;
    updated_at: number;
  };
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`px-2 py-[0.6rem] rounded-md cursor-pointer transition-colors ${
        isActive
          ? "bg-surface-hover border-l-2 border-l-primary"
          : "bg-transparent border-l-2 border-l-transparent"
      }`}
    >
      <div
        className={`text-[0.8rem] font-normal whitespace-nowrap overflow-hidden text-ellipsis ${
          isActive ? "text-text-body" : "text-text-muted"
        }`}
      >
        {chat.name}
      </div>
      {chat.last_message_preview && (
        <div className="text-[0.7rem] text-text-dim whitespace-nowrap overflow-hidden text-ellipsis mt-[0.15rem]">
          {chat.last_message_preview.slice(0, 60)}
        </div>
      )}
      <div className="text-[0.65rem] text-text-dim mt-[0.2rem]">
        {chat.message_count} messages
      </div>
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
