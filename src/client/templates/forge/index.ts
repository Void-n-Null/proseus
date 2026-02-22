import type { TemplateModule } from "../types.ts";
import ForgeMessageItem from "./MessageItem.tsx";
import ForgeComposer from "./Composer.tsx";
import ForgeChatHeader from "./ChatHeader.tsx";

export const forgeTemplate: TemplateModule = {
  MessageItem: ForgeMessageItem,
  Composer: ForgeComposer,
  ChatHeader: ForgeChatHeader,
  messageListClassName: "w-full sm:w-[60vw]",
  placeholder: (_personaName, { isDisconnected, isStreaming }) => {
    if (isDisconnected) return "Reconnecting to server...";
    if (isStreaming) return "Generating...";
    return "Send a message...";
  },
};
