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

  // WebSocket connection for server-side streaming
  const { status: wsStatus, sendGenerate, cancelStream } =
    useStreamSocket(chatId);

  // Subscribe to the active persona so we can override the user speaker display.
  const personaId = chatData?.chat.persona_id ?? null;
  const { data: personaData } = usePersona(personaId);
  const activePersona = personaData?.persona ?? null;

  // Build speakerMap from the per-chat speakers returned alongside the chat
  // data. This is always fresh (fetched with the chat) and avoids the race
  // condition where a global speakers cache hasn't been invalidated yet.
  // If a persona is active, override the user speaker's name and avatar so
  // messages display the persona identity instead of the generic "User".
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

  // Ref for the leaf node ID — Composer and test stream read this
  // without subscribing to active path changes.
  const lastNodeIdRef = useRef<string | null>(null);
  lastNodeIdRef.current =
    activePath && activePath.node_ids.length > 0
      ? activePath.node_ids[activePath.node_ids.length - 1] ?? null
      : null;

  // Pre-compute user speaker ID so Composer receives a stable string.
  const userSpeakerId = useMemo(() => {
    for (const speaker of speakerMap.values()) {
      if (speaker.is_user) return speaker.id;
    }
    return null;
  }, [speakerMap]);

  // The display name for {{user}} substitution. Uses the persona-overridden
  // name when a persona is active, otherwise the raw speaker name.
  const userName = useMemo(() => {
    if (!userSpeakerId) return "User";
    return speakerMap.get(userSpeakerId)?.name ?? "User";
  }, [userSpeakerId, speakerMap]);

  // Auto-generate: when user sends a message, trigger AI generation.
  // The server resolves parentId (leaf of active path) and speakerId
  // (bot speaker) from DB — the client just provides the model.
  // NO default model — if none is selected, open the model browser instead.
  const { modelId, provider } = useModelStore();
  const [modelBrowserOpen, setModelBrowserOpen] = useState(false);

  const handleMessageSent = useCallback(() => {
    if (!modelId) {
      // No model selected — open the model browser so the user picks one.
      setModelBrowserOpen(true);
      return;
    }
    sendGenerate(modelId, provider);
  }, [sendGenerate, modelId, provider]);

  if (!chatData || !treeData) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          color: "#666",
        }}
      >
        Loading chat...
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
      }}
    >
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
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
