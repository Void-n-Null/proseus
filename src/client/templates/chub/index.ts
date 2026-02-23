import type { TemplateModule } from "../types.ts";
import ForgeMessageItem from "../forge/MessageItem.tsx";
import ChubComposer from "./Composer.tsx";
import ChubHeader from "./ChubHeader.tsx";

/**
 * Chub template — shares Forge's layout structure.
 *
 * Chub's visual identity comes entirely from token overrides (warm dark +
 * amber/gold accents) defined in `src/shared/design-templates.ts`, not from
 * layout divergence. MessageItem and MessageContent are reused from forge;
 * the CSS variables drive the visual differences. If Chub later needs a
 * fundamentally different message layout, swap in local components here —
 * nothing else changes.
 */
export const chubTemplate: TemplateModule = {
  MessageItem: ForgeMessageItem,
  Composer: ChubComposer,
  ChatHeader: ChubHeader,
  messageListClassName: "w-full sm:w-[60vw]",
  placeholder: (_personaName, { isDisconnected, isStreaming }) => {
    if (isDisconnected) return "Reconnecting to server...";
    if (isStreaming) return "Generating...";
    return "Send a message...";
  },
};
