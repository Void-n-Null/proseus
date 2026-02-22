import type { TemplateModule } from "../types.ts";
import ForgeMessageItem from "../forge/MessageItem.tsx";
import ForgeComposer from "../forge/Composer.tsx";
import ForgeChatHeader from "../forge/ChatHeader.tsx";

/**
 * Chub template — shares Forge's layout structure.
 *
 * Chub's visual identity comes from token overrides (warm dark + amber/gold
 * accents) defined in `src/shared/design-templates.ts`, not from layout
 * divergence. If Chub later needs bubble-styled messages or a different
 * composer, swap in local components here — nothing else changes.
 */
export const chubTemplate: TemplateModule = {
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
