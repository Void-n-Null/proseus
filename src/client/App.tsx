import React, { useState, useCallback } from "react";
import { useChatList } from "./hooks/useChat.ts";
import { api } from "./api/client.ts";
import ChatPage from "./components/chat/ChatPage.tsx";
import CharacterSidebar from "./components/characters/CharacterSidebar.tsx";

export default function App() {
  const { data: chatData, isLoading, refetch } = useChatList();
  const [seeding, setSeeding] = useState(false);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [sidebarView, setSidebarView] = useState<"characters" | "chats">(
    "characters",
  );

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
      setActiveChatId(chatId);
      refetch();
    },
    [refetch],
  );

  const chats = chatData?.chats ?? [];

  // If we have an active chat, verify it still exists
  const resolvedChatId =
    activeChatId && chats.some((c) => c.id === activeChatId)
      ? activeChatId
      : null;

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
            onClick={() => setSidebarView("characters")}
            label="Characters"
          />
          <ToggleButton
            active={sidebarView === "chats"}
            onClick={() => setSidebarView("chats")}
            label={`Chats${chats.length > 0 ? ` (${chats.length})` : ""}`}
          />
        </div>

        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          {resolvedChatId && (
            <button
              onClick={() => setActiveChatId(null)}
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

      {/* Main content */}
      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
        {/* Sidebar */}
        {sidebarView === "characters" ? (
          <CharacterSidebar onChatCreated={handleChatCreated} />
        ) : (
          <ChatListSidebar
            chats={chats}
            activeChatId={resolvedChatId}
            onSelectChat={setActiveChatId}
            isLoading={isLoading}
          />
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
