import React, { useMemo, useRef, useCallback, useState, useEffect } from "react";
import { useChat } from "../../hooks/useChat.ts";
import { useChatTree } from "../../hooks/useChatTree.ts";
import { useActivePath } from "../../hooks/useActivePath.ts";
import { useStreamSocket } from "../../hooks/useStreamSocket.ts";
import { useModelStore } from "../../stores/model.ts";
import { usePersona } from "../../hooks/usePersonas.ts";
import { api } from "../../api/client.ts";
import type { Speaker } from "../../../shared/types.ts";
import MessageList from "./MessageList.tsx";
import Composer from "./Composer.tsx";
import StreamDebug from "../debug/StreamDebug.tsx";
import ModelBrowserModal from "../model/ModelBrowserModal.tsx";

interface ChatPageProps {
  chatId: string;
}

function getFilenameFromDisposition(
  contentDisposition: string | null,
  fallback: string,
): string {
  if (!contentDisposition) return fallback;

  const match = contentDisposition.match(/filename="?([^";]+)"?/i);
  if (!match || !match[1]) return fallback;
  return match[1];
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export default function ChatPage({ chatId }: ChatPageProps) {
  const { data: chatData } = useChat(chatId);
  const { data: treeData } = useChatTree(chatId);

  const activePath = useActivePath(treeData?.nodes, treeData?.rootNodeId);

  const { status: wsStatus, sendGenerate, cancelStream } =
    useStreamSocket(chatId);

  const personaId = chatData?.chat.persona_id ?? null;
  const { data: personaData } = usePersona(personaId);
  const activePersona = personaData?.persona ?? null;

  const speakerMap = useMemo(() => {
    const map = new Map<string, Speaker>();
    if (chatData?.speakers) {
      for (const s of chatData.speakers) {
        if (s.is_user && activePersona) {
          map.set(s.id, {
            ...s,
            name: activePersona.name,
            avatar_url: activePersona.avatar_url,
          });
        } else {
          map.set(s.id, s);
        }
      }
    }
    return map;
  }, [chatData?.speakers, activePersona]);

  const lastNodeIdRef = useRef<string | null>(null);
  lastNodeIdRef.current =
    activePath && activePath.node_ids.length > 0
      ? activePath.node_ids[activePath.node_ids.length - 1] ?? null
      : null;

  const userSpeakerId = useMemo(() => {
    for (const speaker of speakerMap.values()) {
      if (speaker.is_user) return speaker.id;
    }
    return null;
  }, [speakerMap]);

  const userName = useMemo(() => {
    if (!userSpeakerId) return "User";
    return speakerMap.get(userSpeakerId)?.name ?? "User";
  }, [userSpeakerId, speakerMap]);

  const lastMessageIsUser = useMemo(() => {
    if (!activePath || activePath.node_ids.length === 0) return false;
    const lastNodeId = activePath.node_ids[activePath.node_ids.length - 1];
    if (!lastNodeId || !treeData) return false;
    const lastNode = treeData.nodes.get(lastNodeId);
    if (!lastNode) return false;
    const speaker = speakerMap.get(lastNode.speaker_id);
    return speaker?.is_user === true;
  }, [activePath, treeData, speakerMap]);

  const { modelId, provider } = useModelStore();
  const [modelBrowserOpen, setModelBrowserOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!exportMenuOpen) return;

    const onDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!exportMenuRef.current?.contains(target)) {
        setExportMenuOpen(false);
      }
    };

    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [exportMenuOpen]);

  const handleGenerate = useCallback(() => {
    if (!modelId) {
      setModelBrowserOpen(true);
      return;
    }
    sendGenerate(modelId, provider);
  }, [sendGenerate, modelId, provider]);

  const handleRegenerate = useCallback(() => {
    if (!modelId) {
      setModelBrowserOpen(true);
      return;
    }
    sendGenerate(modelId, provider, true);
  }, [sendGenerate, modelId, provider]);

  const handleExport = useCallback(
    async (format: "chat" | "jsonl" | "txt") => {
      const fallbackBase = (chatData?.chat.name || "chat")
        .trim()
        .replace(/[^a-zA-Z0-9._-]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "") || "chat";
      const date = new Date().toISOString().slice(0, 10);
      const fallbackName = `${fallbackBase}-${date}.${format}`;

      setExportMenuOpen(false);
      setIsExporting(true);
      try {
        const result =
          format === "chat"
            ? await api.chats.exportChat(chatId)
            : format === "jsonl"
              ? await api.chats.exportJsonl(chatId)
              : await api.chats.exportTxt(chatId);
        const filename = getFilenameFromDisposition(
          result.contentDisposition,
          fallbackName,
        );
        triggerDownload(result.blob, filename);
      } finally {
        setIsExporting(false);
      }
    },
    [chatData?.chat.name, chatId],
  );

  if (!chatData || !treeData) {
    return (
      <div className="flex items-center justify-center h-full text-[#666]">
        Loading chat...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 border-b border-border bg-surface/40 px-3 py-2 flex items-center justify-between gap-3">
        <div className="text-sm text-text-muted truncate" title={chatData.chat.name}>
          {chatData.chat.name}
        </div>

        <div className="relative" ref={exportMenuRef}>
          <button
            type="button"
            disabled={isExporting}
            onClick={() => setExportMenuOpen((open) => !open)}
            className="px-3 py-1.5 text-xs bg-surface-raised text-text-muted border border-border rounded-md hover:text-text-body transition-colors disabled:opacity-50 disabled:cursor-wait"
          >
            {isExporting ? "Exporting..." : "Export"}
          </button>

          {exportMenuOpen && (
            <div className="absolute right-0 top-[calc(100%+0.35rem)] min-w-[12.5rem] bg-surface border border-border rounded-md shadow-lg z-20 p-1">
              <button
                type="button"
                onClick={() => void handleExport("chat")}
                className="w-full text-left px-2 py-1.5 text-xs text-text-muted hover:text-text-body hover:bg-surface-raised rounded"
              >
                Proseus archive (.chat)
              </button>
              <button
                type="button"
                onClick={() => void handleExport("jsonl")}
                className="w-full text-left px-2 py-1.5 text-xs text-text-muted hover:text-text-body hover:bg-surface-raised rounded"
              >
                JSONL (SillyTavern)
              </button>
              <button
                type="button"
                onClick={() => void handleExport("txt")}
                className="w-full text-left px-2 py-1.5 text-xs text-text-muted hover:text-text-body hover:bg-surface-raised rounded"
              >
                Text transcript (.txt)
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        <MessageList
          activePath={activePath}
          speakerMap={speakerMap}
          nodeMap={treeData.nodes}
          chatId={chatId}
          userName={userName}
          onRegenerate={handleRegenerate}
        />
      </div>

      <Composer
        chatId={chatId}
        lastNodeIdRef={lastNodeIdRef}
        userSpeakerId={userSpeakerId}
        personaId={chatData.chat.persona_id ?? null}
        onMessageSent={handleGenerate}
        onCancel={cancelStream}
        onGenerate={handleGenerate}
        lastMessageIsUser={lastMessageIsUser}
      />

      <StreamDebug
        wsStatus={wsStatus}
        onCancel={cancelStream}
      />

      {/* Model browser — opened when user tries to send without a model */}
      <ModelBrowserModal
        open={modelBrowserOpen}
        onOpenChange={setModelBrowserOpen}
      />
    </div>
  );
}
