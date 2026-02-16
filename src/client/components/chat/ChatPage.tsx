import React, { useMemo } from "react";
import { useChat } from "../../hooks/useChat.ts";
import { useChatTree } from "../../hooks/useChatTree.ts";
import { useSpeakers } from "../../hooks/useSpeakers.ts";
import { useActivePath } from "../../hooks/useActivePath.ts";
import type { Speaker } from "../../../shared/types.ts";
import ChatHeader from "./ChatHeader.tsx";
import MessageList from "./MessageList.tsx";
import Composer from "./Composer.tsx";

interface ChatPageProps {
  chatId: string;
}

export default function ChatPage({ chatId }: ChatPageProps) {
  const { data: chatData } = useChat(chatId);
  const { data: treeData } = useChatTree(chatId);
  const { data: speakerData } = useSpeakers();

  const activePath = useActivePath(treeData?.nodes, treeData?.rootNodeId);

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
        activePath={activePath}
        speakerMap={speakerMap}
      />
    </div>
  );
}
