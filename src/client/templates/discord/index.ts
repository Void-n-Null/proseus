import type { TemplateModule } from "../types.ts";
import DiscordMessageItem from "./MessageItem.tsx";
import DiscordComposer from "./Composer.tsx";

export const discordTemplate: TemplateModule = {
  MessageItem: DiscordMessageItem,
  Composer: DiscordComposer,
  messageListClassName: "w-full",
  placeholder: (personaName, { isDisconnected }) => {
    if (isDisconnected) return "Reconnecting to server...";
    return personaName ? `Message @${personaName}` : "Message ...";
  },
};
