import React from "react";

interface ChatHeaderProps {
  chatName: string;
  speakerNames: string[];
  messageCount: number;
}

const ChatHeader = React.memo(function ChatHeader({
  chatName,
  speakerNames,
  messageCount,
}: ChatHeaderProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0.6rem 1rem",
        background: "#111",
        borderBottom: "1px solid #222",
        flexShrink: 0,
      }}
    >
      <div>
        <div
          style={{
            fontSize: "1rem",
            fontWeight: 600,
            color: "#e0e0e0",
            marginBottom: "0.15rem",
          }}
        >
          {chatName}
        </div>
        {speakerNames.length > 0 && (
          <div style={{ fontSize: "0.75rem", color: "#777" }}>
            {speakerNames.join(", ")}
          </div>
        )}
      </div>

      <div
        style={{
          fontSize: "0.7rem",
          color: "#666",
          background: "#1a1a1a",
          padding: "0.2rem 0.5rem",
          borderRadius: "10px",
          border: "1px solid #2a2a2a",
        }}
      >
        {messageCount} message{messageCount !== 1 ? "s" : ""}
      </div>
    </div>
  );
});

export default ChatHeader;
