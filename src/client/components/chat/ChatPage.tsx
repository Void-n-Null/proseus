import React, { useMemo, useRef, useCallback } from "react";
import { useChat } from "../../hooks/useChat.ts";
import { useChatTree } from "../../hooks/useChatTree.ts";
import { useSpeakers } from "../../hooks/useSpeakers.ts";
import { useActivePath } from "../../hooks/useActivePath.ts";
import { useStreamSocket } from "../../hooks/useStreamSocket.ts";
import type { Speaker } from "../../../shared/types.ts";
import ChatHeader from "./ChatHeader.tsx";
import MessageList from "./MessageList.tsx";
import Composer from "./Composer.tsx";
import StreamDebug from "../debug/StreamDebug.tsx";

interface ChatPageProps {
  chatId: string;
}

export default function ChatPage({ chatId }: ChatPageProps) {
  const { data: chatData } = useChat(chatId);
  const { data: treeData } = useChatTree(chatId);
  const { data: speakerData } = useSpeakers();

  const activePath = useActivePath(treeData?.nodes, treeData?.rootNodeId);

  // WebSocket connection for server-side streaming
  const { status: wsStatus, sendTestStream, sendAIStream, setApiKey, cancelStream } =
    useStreamSocket(chatId);

  const speakerMap = useMemo(() => {
    const map = new Map<string, Speaker>();
    if (speakerData?.speakers) {
      for (const s of speakerData.speakers) {
        map.set(s.id, s);
      }
    }
    return map;
  }, [speakerData]);

  const speakerNames = useMemo(() => {
    if (!chatData?.speakers) return [];
    return chatData.speakers.map((s) => s.name);
  }, [chatData]);

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

  // Find the bot speaker for test streams
  const botSpeakerId = useMemo(() => {
    for (const speaker of speakerMap.values()) {
      if (!speaker.is_user) return speaker.id;
    }
    return null;
  }, [speakerMap]);

  const handleTestStream = useCallback(() => {
    const parentId = lastNodeIdRef.current;
    if (!parentId || !botSpeakerId) return;
    sendTestStream(parentId, botSpeakerId);
  }, [sendTestStream, botSpeakerId]);

  const handleAIStream = useCallback(
    (model: string) => {
      const parentId = lastNodeIdRef.current;
      if (!parentId || !botSpeakerId) return;
      sendAIStream(parentId, botSpeakerId, model);
    },
    [sendAIStream, botSpeakerId],
  );

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
      <ChatHeader
        chatName={chatData.chat.name}
        speakerNames={speakerNames}
        messageCount={activePath?.node_ids.length ?? 0}
      />

      <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        <MessageList
          activePath={activePath}
          speakerMap={speakerMap}
          nodeMap={treeData.nodes}
          chatId={chatId}
        />
      </div>

      <Composer
        chatId={chatId}
        lastNodeIdRef={lastNodeIdRef}
        userSpeakerId={userSpeakerId}
      />

      <StreamDebug
        wsStatus={wsStatus}
        onTestStream={handleTestStream}
        onAIStream={handleAIStream}
        onCancel={cancelStream}
        onApiKeyChange={setApiKey}
      />
    </div>
  );
}
