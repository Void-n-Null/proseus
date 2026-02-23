import type { TemplateModule } from "../types.ts";
import ChubComposer from "./Composer.tsx";
import ChubHeader from "./ChubHeader.tsx";
import ChubMessageItem from "./MessageItem.tsx";

/**
 * Chub template — shares Forge's layout structure.
 *
 * Chub's visual identity comes from token overrides (warm dark + amber/gold
 * accents) defined in `src/shared/design-templates.ts`, not from layout
 * divergence. If Chub later needs bubble-styled messages or a different
 * composer, swap in local components here — nothing else changes.
 */
export const chubTemplate: TemplateModule = {
  MessageItem: ChubMessageItem,
  Composer: ChubComposer,
  ChatHeader: ChubHeader,
  messageListClassName: "w-full sm:w-[60vw]",
  placeholder: (_personaName, { isDisconnected, isStreaming }) => {
    if (isDisconnected) return "Reconnecting to server...";
    if (isStreaming) return "Generating...";
    return "Send a message...";
  },
};
