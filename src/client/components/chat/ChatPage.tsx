import React, { useMemo, useRef, useCallback, useState } from "react";
import { useChat } from "../../hooks/useChat.ts";
import { useChatTree } from "../../hooks/useChatTree.ts";
import { useActivePath } from "../../hooks/useActivePath.ts";
import { useStreamSocket } from "../../hooks/useStreamSocket.ts";
import { useModelStore } from "../../stores/model.ts";
import { usePersona } from "../../hooks/usePersonas.ts";
import type { Speaker } from "../../../shared/types.ts";
import MessageList from "./MessageList.tsx";
import Composer from "./Composer.tsx";
import StreamDebug from "../debug/StreamDebug.tsx";
import ModelBrowserModal from "../model/ModelBrowserModal.tsx";

interface ChatPageProps {
  chatId: string;
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

  const { modelId, provider } = useModelStore();
  const [modelBrowserOpen, setModelBrowserOpen] = useState(false);

  const handleMessageSent = useCallback(() => {
    if (!modelId) {
      setModelBrowserOpen(true);
      return;
    }
    sendGenerate(modelId, provider);
  }, [sendGenerate, modelId, provider]);

  if (!chatData || !treeData) {
    return (
      <div className="flex items-center justify-center h-full text-[#666]">
        Loading chat...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 min-h-0 overflow-hidden">
        <MessageList
          activePath={activePath}
          speakerMap={speakerMap}
          nodeMap={treeData.nodes}
          chatId={chatId}
          userName={userName}
        />
      </div>

      <Composer
        chatId={chatId}
        lastNodeIdRef={lastNodeIdRef}
        userSpeakerId={userSpeakerId}
        personaId={chatData.chat.persona_id ?? null}
        onMessageSent={handleMessageSent}
        onCancel={cancelStream}
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
