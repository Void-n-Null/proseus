import type { TemplateModule } from "../types.ts";
import ForgeMessageItem from "../forge/MessageItem.tsx";
import ChubComposer from "./Composer.tsx";
import ChubHeader from "./ChubHeader.tsx";
import ChubRegenerateButton from "./RegenerateButton.tsx";
import ChubMessageActions from "./MessageActions.tsx";
import ChubSidebar from "./ChubSidebar.tsx";

/**
 * Chub template — shares Forge's layout structure with a custom sidebar.
 *
 * The sidebar uses a Chub.ai-inspired card layout for the character list
 * (large image + metadata tags), while MessageItem and MessageContent are
 * reused from forge with CSS variable overrides for the warm-dark palette.
 */
export const chubTemplate: TemplateModule = {
  MessageItem: ForgeMessageItem,
  Composer: ChubComposer,
  ChatHeader: ChubHeader,
  RegenerateButton: ChubRegenerateButton,
  MessageActions: ChubMessageActions,
  Sidebar: ChubSidebar,
  messageListClassName: "w-full sm:w-[60vw]",
  placeholder: (_personaName, { isDisconnected, isStreaming }) => {
    if (isDisconnected) return "Reconnecting to server...";
    if (isStreaming) return "Generating...";
    return "Send a message...";
  },
  sidebarMode: "toggle",
};
