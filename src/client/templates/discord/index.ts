import type { TemplateModule } from "../types.ts";
import DiscordMessageItem from "./MessageItem.tsx";
import DiscordComposer from "./Composer.tsx";
import ForgeChatHeader from "../forge/ChatHeader.tsx";

export const discordTemplate: TemplateModule = {
  MessageItem: DiscordMessageItem,
  Composer: DiscordComposer,
  ChatHeader: ForgeChatHeader,
  messageListClassName: "w-full",
  placeholder: (personaName, { isDisconnected }) => {
    if (isDisconnected) return "Reconnecting to server...";
    return personaName ? `Message @${personaName}` : "Message ...";
  },
};
