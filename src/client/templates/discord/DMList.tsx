import React, { useState } from "react";
import { Avatar } from "../../components/ui/avatar.tsx";
import { useChatList, useDeleteChat } from "../../hooks/useChat.ts";

/**
 * Discord-style Direct Messages list.
 *
 * Renders the "Direct Messages" header and a flat list of avatar + name rows
 * with online indicator dots. Designed to be embedded inside DiscordSidebar's
 * outer container — does NOT render its own width/height shell.
 *
 * - Hover: half-opacity light gray bg + X close button
 * - Selected: full light gray bg
 */
export default function DiscordDMList({
  activeChatId,
  onSelectChat,
  onChatCreated,
}: {
  activeChatId: string | null;
  onSelectChat: (id: string) => void;
  onChatCreated: (chatId: string) => void;
}) {
  const { data } = useChatList();
  const deleteMutation = useDeleteChat();
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const chats = data?.chats ?? [];

  return (
    <>
      {/* ── Direct Messages header ── */}
      <div className="flex items-center justify-between px-4 pt-2 pb-1">
        <span className="text-[0.7rem] font-semibold tracking-[0.02em] uppercase" style={{ color: "#949ba4" }}>
          Direct Messages
        </span>
        <button
          type="button"
          onClick={() => {
            /* The + button could switch to characters to start a new chat.
               For now it's a visual affordance — wiring deferred. */
          }}
          className="flex items-center justify-center w-4 h-4 text-[#949ba4] hover:text-[#dbdee1] transition-colors"
          title="New DM"
        >
          <svg width="14" height="14" viewBox="0 0 18 18" fill="none">
            <path d="M9 3v12M3 9h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* ── Chat rows ── */}
      <div className="px-2 pt-1 pb-2">
        {chats.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-[0.75rem]" style={{ color: "#949ba4" }}>
            No conversations yet
          </div>
        ) : (
          chats.map((chat) => {
            const isActive = chat.id === activeChatId;
            const isHovered = hoveredId === chat.id;
            const displayName = chat.character_name ?? chat.name;

            return (
              <div
                key={chat.id}
                onMouseEnter={() => setHoveredId(chat.id)}
                onMouseLeave={() => setHoveredId(null)}
                className="relative rounded-[4px] transition-colors cursor-pointer"
                style={{
                  background: isActive
                    ? "rgba(255, 255, 255, 0.06)"
                    : isHovered
                      ? "rgba(255, 255, 255, 0.03)"
                      : "transparent",
                  marginBottom: 2,
                }}
              >
                <button
                  type="button"
                  onClick={() => onSelectChat(chat.id)}
                  className="w-full flex items-center gap-3 px-2 py-[6px] text-left"
                >
                  {/* Avatar with online dot */}
                  <div className="relative shrink-0">
                    {chat.character_avatar_url ? (
                      <Avatar
                        src={`${chat.character_avatar_url}?t=${chat.updated_at}`}
                        alt={displayName}
                        size={32}
                        borderRadius="50%"
                      />
                    ) : (
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-[0.7rem] font-semibold text-white"
                        style={{ background: "#5865F2" }}
                      >
                        {displayName.charAt(0).toUpperCase()}
                      </div>
                    )}
                    {/* Online indicator */}
                    <span
                      className="absolute -bottom-[1px] -right-[1px] w-[10px] h-[10px] rounded-full border-[2.5px]"
                      style={{
                        background: "#23a559",
                        borderColor: "#2b2d31",
                      }}
                    />
                  </div>

                  {/* Name */}
                  <span
                    className="text-[0.9rem] font-medium truncate"
                    style={{
                      color: isActive ? "#f2f3f5" : isHovered ? "#dbdee1" : "#949ba4",
                    }}
                  >
                    {displayName}
                  </span>
                </button>

                {/* X close button — only on hover */}
                {isHovered && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteMutation.mutate(chat.id);
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center justify-center w-5 h-5 rounded text-[#949ba4] hover:text-[#dbdee1] transition-colors"
                    title="Close DM"
                  >
                    <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                      <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
