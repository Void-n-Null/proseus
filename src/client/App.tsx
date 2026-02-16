import React, { useState } from "react";
import { useChatList } from "./hooks/useChat.ts";
import { api } from "./api/client.ts";
import ChatPage from "./components/chat/ChatPage.tsx";

export default function App() {
  const { data: chatData, isLoading, refetch } = useChatList();
  const [seeding, setSeeding] = useState(false);

  const handleSeed = async () => {
    setSeeding(true);
    try {
      await api.dev.seed();
      await refetch();
    } finally {
      setSeeding(false);
    }
  };

  const firstChatId = chatData?.chats[0]?.id ?? null;
  const hasChats = (chatData?.chats.length ?? 0) > 0;

  return (
    <div
      style={{
        fontFamily:
          'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        color: "#e0e0e0",
        background: "#0a0a0a",
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
          background: "#0d0d0d",
          borderBottom: "1px solid #1a1a1a",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: "1.1rem",
            fontWeight: 300,
            letterSpacing: "0.25em",
            color: "#888",
          }}
        >
          PROSEUS
        </span>
        <button
          onClick={handleSeed}
          disabled={seeding}
          style={{
            padding: "0.35rem 0.75rem",
            background: "#1a1a1a",
            color: "#aaa",
            border: "1px solid #333",
            borderRadius: "4px",
            cursor: seeding ? "wait" : "pointer",
            fontSize: "0.8rem",
            opacity: seeding ? 0.5 : 1,
          }}
        >
          {seeding ? "Seeding..." : "Seed Database"}
        </button>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, minHeight: 0 }}>
        {isLoading ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              color: "#666",
            }}
          >
            Loading...
          </div>
        ) : hasChats && firstChatId ? (
          <ChatPage chatId={firstChatId} />
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              gap: "1rem",
              color: "#555",
            }}
          >
            <p style={{ fontSize: "1.1rem" }}>No chats yet.</p>
            <p style={{ fontSize: "0.85rem" }}>
              Click "Seed Database" above to create sample data.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
