import React, { useEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "../ui/avatar.tsx";
import {
  useChatList,
  useDeleteChat,
  useDuplicateChat,
  usePinChat,
  useRenameChat,
  type ChatListSort,
} from "../../hooks/useChat.ts";

interface ChatGalleryProps {
  activeChatId: string | null;
  onSelectChat: (id: string) => void;
  isLoading: boolean;
}

const SORT_OPTIONS: Array<{ value: ChatListSort; label: string }> = [
  { value: "updated_at", label: "Recently updated" },
  { value: "created_at", label: "Recently created" },
  { value: "message_count", label: "Most messages" },
  { value: "name", label: "Name (A-Z)" },
  { value: "pinned_first", label: "Pinned first" },
];

function formatSmartTimestamp(epochMs: number): string {
  const diffMs = Date.now() - epochMs;
  const diffSeconds = Math.floor(diffMs / 1000);
  if (diffSeconds < 60) return "just now";

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const date = new Date(epochMs);
  return `${date.toLocaleString("en", { month: "short" })} ${date.getDate()}`;
}

export default function ChatGallery({
  activeChatId,
  onSelectChat,
  isLoading,
}: ChatGalleryProps) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sort, setSort] = useState<ChatListSort>("updated_at");
  const [menuChatId, setMenuChatId] = useState<string | null>(null);
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteConfirmChatId, setDeleteConfirmChatId] = useState<string | null>(null);

  const menuRef = useRef<HTMLDivElement | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);

  const { data, isFetching } = useChatList({
    q: debouncedSearch || undefined,
    sort,
  });
  const renameMutation = useRenameChat();
  const deleteMutation = useDeleteChat();
  const duplicateMutation = useDuplicateChat();
  const pinMutation = usePinChat();

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 180);
    return () => window.clearTimeout(handle);
  }, [search]);

  useEffect(() => {
    if (!editingChatId) return;
    renameInputRef.current?.focus();
    renameInputRef.current?.select();
  }, [editingChatId]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!menuChatId) return;
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuChatId(null);
      }
    };

    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMenuChatId(null);
      setDeleteConfirmChatId(null);
      setEditingChatId(null);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onEscape);
    };
  }, [menuChatId]);

  const chats = data?.chats ?? [];

  const renameChat = async (chatId: string) => {
    const nextName = renameValue.trim();
    if (!nextName) {
      setEditingChatId(null);
      return;
    }
    await renameMutation.mutateAsync({ id: chatId, name: nextName });
    setEditingChatId(null);
    setMenuChatId(null);
  };

  const busyChatId = useMemo(() => {
    if (renameMutation.isPending) return renameMutation.variables?.id ?? null;
    if (deleteMutation.isPending) return deleteMutation.variables ?? null;
    if (duplicateMutation.isPending) return duplicateMutation.variables ?? null;
    if (pinMutation.isPending) return pinMutation.variables?.id ?? null;
    return null;
  }, [deleteMutation, duplicateMutation, pinMutation, renameMutation]);

  return (
    <div className="w-[320px] min-w-[320px] h-full flex flex-col bg-surface border-r border-border">
      <div className="p-3 border-b border-border flex flex-col gap-2">
        <span className="text-xs font-normal tracking-[0.15em] text-text-muted uppercase">
          Chats
        </span>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search chats..."
          className="w-full px-2.5 py-1.5 rounded-md bg-surface-raised border border-border text-[0.8rem] text-text-body placeholder:text-text-dim outline-none focus:border-primary"
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as ChatListSort)}
          className="w-full px-2.5 py-1.5 rounded-md bg-surface-raised border border-border text-[0.78rem] text-text-muted outline-none focus:border-primary"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex-1 overflow-y-auto p-[0.35rem]">
        {isLoading || (isFetching && chats.length === 0) ? (
          <div className="flex items-center justify-center h-full text-text-dim text-[0.8rem]">
            Loading...
          </div>
        ) : chats.length === 0 ? (
          <div className="flex items-center justify-center h-full text-text-dim text-[0.82rem]">
            {debouncedSearch ? "No chats match your search" : "No chats yet"}
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {chats.map((chat) => {
              const isActive = chat.id === activeChatId;
              const showMenu = menuChatId === chat.id;
              const showDeleteConfirm = deleteConfirmChatId === chat.id;
              const isEditing = editingChatId === chat.id;
              const isBusy = busyChatId === chat.id;
              return (
                <div
                  key={chat.id}
                  className={`group relative rounded-md border-l-2 transition-colors ${
                    isActive
                      ? "bg-surface-hover border-l-primary"
                      : "bg-transparent border-l-transparent hover:bg-surface/60"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelectChat(chat.id)}
                    className="w-full text-left px-2 py-2.5 pr-10"
                  >
                    <div className="flex items-start gap-2">
                      {chat.character_avatar_url ? (
                        <Avatar
                          src={`${chat.character_avatar_url}?t=${chat.updated_at}`}
                          alt={chat.character_name ?? chat.name}
                          size={28}
                        />
                      ) : (
                        <div className="w-7 h-7 rounded-md bg-surface-raised text-text-dim text-[0.72rem] flex items-center justify-center">
                          {chat.name.slice(0, 1).toUpperCase()}
                        </div>
                      )}

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          {chat.is_pinned && (
                            <span className="text-[0.7rem] text-primary">📌</span>
                          )}
                          {isEditing ? (
                            <input
                              ref={renameInputRef}
                              value={renameValue}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => setRenameValue(e.target.value)}
                              onBlur={() => void renameChat(chat.id)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  void renameChat(chat.id);
                                } else if (e.key === "Escape") {
                                  e.preventDefault();
                                  setEditingChatId(null);
                                }
                              }}
                              className="w-full px-1.5 py-[1px] rounded border border-border bg-surface-raised text-[0.78rem] text-text-body outline-none focus:border-primary"
                            />
                          ) : (
                            <span
                              className={`text-[0.8rem] whitespace-nowrap overflow-hidden text-ellipsis ${
                                isActive ? "text-text-body" : "text-text-muted"
                              }`}
                            >
                              {chat.name}
                            </span>
                          )}
                        </div>
                        <div className="text-[0.68rem] text-text-dim mt-[1px] whitespace-nowrap overflow-hidden text-ellipsis">
                          {chat.character_name ?? "No character"}
                        </div>
                        {chat.last_message_preview && (
                          <div className="text-[0.68rem] text-text-dim mt-1 whitespace-nowrap overflow-hidden text-ellipsis">
                            {chat.last_message_preview}
                          </div>
                        )}
                        <div className="mt-1 text-[0.65rem] text-text-dim flex items-center gap-2">
                          <span>{chat.message_count} messages</span>
                          <span>·</span>
                          <span>{formatSmartTimestamp(chat.updated_at)}</span>
                        </div>
                      </div>
                    </div>
                  </button>

                  <div className="absolute right-1.5 top-1.5" ref={showMenu ? menuRef : null}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuChatId((prev) => (prev === chat.id ? null : chat.id));
                        setDeleteConfirmChatId(null);
                      }}
                      className={`px-1.5 py-[2px] rounded text-text-dim hover:text-text-body hover:bg-surface-raised transition-colors ${
                        showMenu ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                      }`}
                    >
                      ⋯
                    </button>

                    {showMenu && (
                      <div className="absolute right-0 mt-1 min-w-[150px] rounded-md border border-border bg-surface-raised shadow-lg p-1 z-20">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingChatId(chat.id);
                            setRenameValue(chat.name);
                          }}
                          className="w-full text-left px-2 py-1.5 text-[0.76rem] text-text-muted hover:text-text-body hover:bg-surface rounded"
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={async (e) => {
                            e.stopPropagation();
                            const result = await duplicateMutation.mutateAsync(chat.id);
                            onSelectChat(result.chat.id);
                            setMenuChatId(null);
                          }}
                          className="w-full text-left px-2 py-1.5 text-[0.76rem] text-text-muted hover:text-text-body hover:bg-surface rounded disabled:opacity-50"
                        >
                          Duplicate
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={async (e) => {
                            e.stopPropagation();
                            await pinMutation.mutateAsync({
                              id: chat.id,
                              is_pinned: !chat.is_pinned,
                            });
                            setMenuChatId(null);
                          }}
                          className="w-full text-left px-2 py-1.5 text-[0.76rem] text-text-muted hover:text-text-body hover:bg-surface rounded disabled:opacity-50"
                        >
                          {chat.is_pinned ? "Unpin" : "Pin"}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirmChatId((prev) =>
                              prev === chat.id ? null : chat.id,
                            );
                          }}
                          className="w-full text-left px-2 py-1.5 text-[0.76rem] text-[oklch(0.68_0.16_28)] hover:bg-surface rounded"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>

                  {showDeleteConfirm && (
                    <div className="mx-2 mb-2 p-2 rounded border border-border bg-surface-raised flex items-center justify-between gap-2">
                      <span className="text-[0.7rem] text-text-dim">Delete this chat?</span>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmChatId(null)}
                          className="px-2 py-1 text-[0.68rem] rounded border border-border text-text-dim hover:text-text-body"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={async () => {
                            await deleteMutation.mutateAsync(chat.id);
                            setDeleteConfirmChatId(null);
                            setMenuChatId(null);
                          }}
                          className="px-2 py-1 text-[0.68rem] rounded border border-[oklch(0.68_0.16_28_/_0.5)] text-[oklch(0.68_0.16_28)] hover:bg-[oklch(0.68_0.16_28_/_0.08)] disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
