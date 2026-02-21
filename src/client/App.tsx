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
  const { data: chatData, isLoading, refetch } = useChatList();
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
    if (!isLoading && activeChatId && !resolvedChatId) {
      replaceRoute({ page: "home", chatId: null });
    }
  }, [isLoading, activeChatId, resolvedChatId, replaceRoute]);

  return (
    <div
      style={{
        fontFamily: "var(--font-body)",
        color: "var(--color-foreground)",
        background: "var(--color-background)",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Top bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0.5rem 1rem",
          background: "oklch(0.06 0.01 250)",
          borderBottom: "1px solid var(--color-border)",
          flexShrink: 0,
          gap: "0.75rem",
        }}
      >
        <span
          style={{
            fontSize: "1.1rem",
            fontWeight: 300,
            letterSpacing: "0.25em",
            color: "var(--color-text-muted)",
            fontFamily: "var(--font-display)",
          }}
        >
          PROSEUS
        </span>

        {/* Sidebar view toggle */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
          <button
            onClick={() => setSidebarCollapsed((c) => !c)}
            title={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
            style={{
              padding: "0.3rem 0.45rem",
              background: "var(--color-surface)",
              color: "var(--color-text-dim)",
              border: "none",
              borderRadius: "var(--radius-md)",
              cursor: "pointer",
              fontSize: "0.78rem",
              lineHeight: 1,
              transition: "color 0.15s",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.color = "var(--color-text-body)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.color = "var(--color-text-dim)")
            }
          >
            {sidebarCollapsed ? "\u25B6" : "\u25C0"}
          </button>
          <div
            style={{
              display: "flex",
              gap: "2px",
              background: "var(--color-surface)",
              borderRadius: "var(--radius-md)",
              padding: "2px",
            }}
          >
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

        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <button
            onClick={() => setPromptTemplateOpen(true)}
            title="Prompt Template"
            style={{
              padding: "0.35rem 0.5rem",
              background: "var(--color-surface-raised)",
              color: "var(--color-text-muted)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              cursor: "pointer",
              fontSize: "0.85rem",
              lineHeight: 1,
              transition: "color 0.15s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-text-body)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--color-text-muted)")}
          >
            ⚙
          </button>
          {resolvedChatId && (
            <button
              onClick={handleCloseChat}
              style={{
                padding: "0.35rem 0.75rem",
                background: "var(--color-surface-raised)",
                color: "var(--color-text-muted)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-md)",
                cursor: "pointer",
                fontSize: "0.78rem",
                transition: "background 0.15s",
              }}
            >
              Close Chat
            </button>
          )}
          <button
            onClick={handleSeed}
            disabled={seeding}
            style={{
              padding: "0.35rem 0.75rem",
              background: "var(--color-surface-raised)",
              color: "var(--color-text-muted)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              cursor: seeding ? "wait" : "pointer",
              fontSize: "0.78rem",
              opacity: seeding ? 0.5 : 1,
            }}
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
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b shrink-0" style={{ background: "oklch(0.70 0.15 155 / 0.06)", borderColor: "oklch(0.70 0.15 155 / 0.15)" }}>
          <div className="flex items-center gap-2 text-sm" style={{ color: "oklch(0.72 0.15 155)" }}>
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
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b shrink-0" style={{ background: "oklch(0.55 0.15 40 / 0.06)", borderColor: "oklch(0.55 0.15 40 / 0.15)" }}>
          <div className="flex items-center gap-2 text-sm" style={{ color: "oklch(0.70 0.15 40)" }}>
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
          style={{
            position: "fixed",
            inset: 0,
            background: "oklch(0 0 0 / 0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              width: "min(920px, 95vw)",
              height: "min(700px, 88vh)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <PromptTemplateModal onClose={() => setPromptTemplateOpen(false)} />
          </div>
        </div>
      )}

      {/* Main content */}
      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
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
        <div style={{ flex: 1, minWidth: 0 }}>
          {isLoading ? (
            <CenterMessage>Loading...</CenterMessage>
          ) : resolvedChatId ? (
            <ChatPage chatId={resolvedChatId} />
          ) : (
            <CenterMessage>
              <p style={{ fontSize: "1rem" }}>
                {chats.length > 0
                  ? "Select a chat or start one from a character"
                  : "Import a character to get started"}
              </p>
              <p
                style={{
                  fontSize: "0.82rem",
                  color: "var(--color-text-dim)",
                  marginTop: "0.5rem",
                }}
              >
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
      style={{
        padding: "0.3rem 0.6rem",
        background: active ? "var(--color-surface-raised)" : "transparent",
        color: active ? "var(--color-text-body)" : "var(--color-text-dim)",
        border: "none",
        borderRadius: "var(--radius-sm)",
        cursor: "pointer",
        fontSize: "0.72rem",
        fontWeight: active ? 400 : 300,
        transition: "all 0.15s",
      }}
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
    <div
      style={{
        width: 280,
        minWidth: 280,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "var(--color-surface)",
        borderRight: "1px solid var(--color-border)",
      }}
    >
      <div
        style={{
          padding: "0.75rem",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <span
          style={{
            fontSize: "0.75rem",
            fontWeight: 400,
            letterSpacing: "0.15em",
            color: "var(--color-text-muted)",
            textTransform: "uppercase",
          }}
        >
          Chats
        </span>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "0.35rem" }}>
        {isLoading ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              color: "var(--color-text-dim)",
              fontSize: "0.8rem",
            }}
          >
            Loading...
          </div>
        ) : chats.length === 0 ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              color: "var(--color-text-dim)",
              fontSize: "0.82rem",
            }}
          >
            No chats yet
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "2px",
            }}
          >
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
      style={{
        padding: "0.6rem 0.5rem",
        borderRadius: "var(--radius-md)",
        cursor: "pointer",
        transition: "background 0.15s",
        background: isActive
          ? "var(--color-surface-hover)"
          : "transparent",
        borderLeft: isActive
          ? "2px solid var(--color-primary)"
          : "2px solid transparent",
      }}
    >
      <div
        style={{
          fontSize: "0.8rem",
          fontWeight: 400,
          color: isActive
            ? "var(--color-text-body)"
            : "var(--color-text-muted)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {chat.name}
      </div>
      {chat.last_message_preview && (
        <div
          style={{
            fontSize: "0.7rem",
            color: "var(--color-text-dim)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            marginTop: "0.15rem",
          }}
        >
          {chat.last_message_preview.slice(0, 60)}
        </div>
      )}
      <div
        style={{
          fontSize: "0.65rem",
          color: "var(--color-text-dim)",
          marginTop: "0.2rem",
        }}
      >
        {chat.message_count} messages
      </div>
    </div>
  );
}

function CenterMessage({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        color: "var(--color-text-muted)",
        textAlign: "center",
        padding: "2rem",
      }}
    >
      {children}
    </div>
  );
}
