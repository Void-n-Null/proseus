import React, { useMemo, useRef, useCallback, useState } from "react";
import { useChat } from "../../hooks/useChat.ts";
import { useChatTree } from "../../hooks/useChatTree.ts";
import { useActivePath } from "../../hooks/useActivePath.ts";
import { useStreamSocket } from "../../hooks/useStreamSocket.ts";
import { useModelStore } from "../../stores/model.ts";
import { usePersona } from "../../hooks/usePersonas.ts";
import { useIsMobile } from "../../hooks/useMediaQuery.ts";
import { useDesignTemplateId } from "../../hooks/useDesignTemplate.ts";
import { getTemplate } from "../../templates/index.ts";
import { setStoredDesignTemplateId, applyDesignTemplate } from "../../lib/design-templates.ts";
import type { DesignTemplateId } from "../../../shared/design-templates.ts";
import { api } from "../../api/client.ts";
import type { Speaker } from "../../../shared/types.ts";
import { getFilenameFromDisposition, triggerDownload } from "../../lib/download.ts";
import { toast } from "../../stores/toast.ts";
import MessageList from "./MessageList.tsx";
import Composer from "./Composer.tsx";
import StreamDebug from "../debug/StreamDebug.tsx";
import ModelDashboard from "../model/ModelDashboard.tsx";
import PromptTemplateModal from "../prompt-template/PromptTemplateModal.tsx";
import { Avatar } from "../ui/avatar.tsx";

interface ChatPageProps {
  chatId: string;
  /** Called when the mobile back button is tapped to dismiss the chat overlay. */
  onBack?: () => void;
}

export default function ChatPage({
  chatId,
  onBack,
}: ChatPageProps) {
  const { data: chatData } = useChat(chatId);
  const { data: treeData } = useChatTree(chatId);
  const isMobile = useIsMobile();
  const designTemplateId = useDesignTemplateId();
  const template = getTemplate(designTemplateId);

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

  const characterSpeaker = useMemo(() => {
    for (const speaker of speakerMap.values()) {
      if (!speaker.is_user) return speaker;
    }
    return null;
  }, [speakerMap]);

  const isEmptyChat = !activePath || activePath.node_ids.length === 0;

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
  const [promptTemplateOpen, setPromptTemplateOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const handleSelectDesignTemplate = useCallback((templateId: DesignTemplateId) => {
    setStoredDesignTemplateId(templateId);
    applyDesignTemplate(templateId);
  }, []);

  const handleGenerate = useCallback(() => {
    if (!modelId) {
      setModelBrowserOpen(true);
      return;
    }
    sendGenerate(modelId, provider);
  }, [sendGenerate, modelId, provider]);

  const handleRegenerate = useCallback((targetNodeId: string) => {
    if (!modelId) {
      setModelBrowserOpen(true);
      return;
    }
    sendGenerate(modelId, provider, true, targetNodeId);
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
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unknown error";
        toast.error("Export failed", { description: message });
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
    <div className="flex flex-col h-full" style={{ background: "var(--color-background)" }}>
      <template.ChatHeader
        chatName={chatData.chat.name}
        isMobile={isMobile}
        onBack={onBack}
        characterName={characterSpeaker?.name ?? null}
        characterAvatarUrl={characterSpeaker?.avatar_url ?? null}
        characterColor={characterSpeaker?.color ?? null}
        isExporting={isExporting}
        onExport={(format) => void handleExport(format)}
        onOpenModelDashboard={() => setModelBrowserOpen(true)}
        onOpenPromptTemplate={() => setPromptTemplateOpen(true)}
        designTemplateId={designTemplateId}
        onSelectDesignTemplate={handleSelectDesignTemplate}
      />

      <div className="flex-1 min-h-0 overflow-hidden">
        {isEmptyChat ? (
          <div className="h-full flex items-center justify-center px-6">
            <div className="w-full max-w-md rounded-xl border border-border bg-surface/60 px-6 py-7 text-center shadow-[0_16px_40px_oklch(0_0_0_/_0.14)]">
              <div className="flex items-center justify-center">
                {characterSpeaker?.avatar_url ? (
                  <Avatar
                    src={characterSpeaker.avatar_url}
                    alt={characterSpeaker.name}
                    size={72}
                    className="ring-1 ring-border"
                    borderRadius="0.75rem"
                  />
                ) : (
                  <div className="w-[72px] h-[72px] rounded-xl bg-surface-raised border border-border text-2xl text-text-muted flex items-center justify-center">
                    {(characterSpeaker?.name ?? chatData.chat.name)
                      .trim()
                      .charAt(0)
                      .toUpperCase() || "?"}
                  </div>
                )}
              </div>

              <div className="mt-4 text-base text-text-body">
                {characterSpeaker?.name ?? chatData.chat.name}
              </div>
              <div className="mt-1 text-sm text-text-muted">
                No messages yet.
              </div>
              <div className="mt-4 text-[0.82rem] text-text-dim leading-relaxed">
                Start the conversation in the composer below.
              </div>
            </div>
          </div>
        ) : (
          <MessageList
            activePath={activePath}
            speakerMap={speakerMap}
            nodeMap={treeData.nodes}
            chatId={chatId}
            userName={userName}
            onRegenerate={handleRegenerate}
            characterName={characterSpeaker?.name ?? null}
            characterAvatarUrl={characterSpeaker?.avatar_url ?? null}
          />
        )}
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

      {/* Model dashboard — opened when user tries to send without a model */}
      <ModelDashboard
        open={modelBrowserOpen}
        onOpenChange={setModelBrowserOpen}
      />

      {/* Prompt template editor */}
      <PromptTemplateModal
        open={promptTemplateOpen}
        onOpenChange={setPromptTemplateOpen}
        chatId={chatId}
      />
    </div>
  );
}
