import type { ComponentType } from "react";
import type { MessageItemLayoutProps } from "../components/chat/message-item/types.ts";
import type { ComposerLayoutProps } from "../components/chat/composer/types.ts";

/**
 * Contract that every design template must satisfy.
 *
 * Each template lives in its own directory under `src/client/templates/{id}/`
 * and exports a `TemplateModule` via its barrel `index.ts`.
 *
 * Adding a new template = create the directory, implement this interface,
 * and register it in `src/client/templates/index.ts`.
 */
export interface TemplateModule {
  /** Layout component for a single message row. */
  MessageItem: ComponentType<MessageItemLayoutProps>;

  /** Layout component for the chat composer. */
  Composer: ComponentType<ComposerLayoutProps>;

  /** Tailwind className for the message list width container. */
  messageListClassName: string;

  /**
   * Returns the textarea placeholder string.
   * @param personaName — name of the active persona, if any.
   * @param state — current composer state for context-dependent placeholders.
   */
  placeholder: (
    personaName: string | undefined,
    state: { isDisconnected: boolean; isStreaming: boolean },
  ) => string;
}
