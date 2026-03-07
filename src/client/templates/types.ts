import type { ComponentType, ReactNode } from "react";
import type { MessageItemLayoutProps, RegenerateButtonProps, MessageActionsProps } from "../components/chat/message-item/types.ts";
import type { ComposerLayoutProps, VisualizerDrawFn } from "../components/chat/composer/types.ts";
import type { ChatHeaderLayoutProps } from "../components/chat/chat-header/types.ts";

// ─── Sidebar types ──────────────────────────────────────────────────────────

export type SidebarView = "characters" | "chats" | "personas";

/**
 * Props passed to a template's `Sidebar` component.
 *
 * The template controls the top-level sidebar layout — tab bar style,
 * ordering, chrome around the panels, etc. It renders the actual panel
 * content via the sub-component props below, so existing CharacterSidebar /
 * PersonaSidebar / ChatGallery can be reused without reimplementation.
 */
export interface SidebarLayoutProps {
  /** Which panel is currently active. */
  view: SidebarView;
  /** Switch to a different panel. */
  setView: (view: SidebarView) => void;

  /** Number of chats — useful for badge counts on the tab bar. */
  chatCount: number;
  /** The currently-open chat ID, if any. */
  activeChatId: string | null;
  /** Whether chat data is still loading. */
  isLoading: boolean;

  // ── Callbacks the sidebar panels need ────────────────────────────
  onChatCreated: (chatId: string) => void;
  onSelectChat: (chatId: string) => void;

  // ── Sub-components the template can compose ──────────────────────
  /**
   * Render prop for the Characters panel.
   * Pass an optional `tabs` ReactNode that the sub-component will render
   * in its header slot.
   */
  renderCharacters: (tabs?: ReactNode) => ReactNode;
  /** Render prop for the Personas panel. */
  renderPersonas: (tabs?: ReactNode) => ReactNode;
  /** Render prop for the Chats panel. */
  renderChats: (tabs?: ReactNode) => ReactNode;
}

export interface DesktopTopBarProps {
  activePanel: SidebarView | null;
  onTogglePanel: (view: SidebarView) => void;
  chatCount: number;
  activeChatName: string | null;
  collapsed: boolean;
  allowCollapse: boolean;
  showChatsButton: boolean;
  promptEnabled?: boolean;
  chatManagementEnabled?: boolean;
  onOpenThemePicker?: () => void;
  isExportingChat?: boolean;
  isRenamingChat?: boolean;
  onOpenModelDashboard?: () => void;
  onOpenPromptTemplate?: () => void;
  onRenameChat?: (name: string) => void | Promise<void>;
  onExportChat?: (format: "chat" | "jsonl" | "txt") => void;
  onToggleCollapsed?: () => void;
}

// ─── Template module ────────────────────────────────────────────────────────

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

  /** Layout component for the chat header bar. */
  ChatHeader: ComponentType<ChatHeaderLayoutProps>;

  /**
   * Visual variant of the regenerate button.
   *
   * The shared MessageItem wrapper decides *when* to render the button
   * (all non-user messages while not streaming). The template decides
   * *how* it looks — inline text button, chevron overlay, etc.
   */
  RegenerateButton: ComponentType<RegenerateButtonProps>;

  /**
   * Visual variant of the message actions toolbar (edit, copy, delete).
   *
   * The shared MessageItem wrapper owns the behavior (clipboard, confirm
   * dialog, mutation calls). The template decides *how* the buttons look
   * — text labels, icons, positioning, etc.
   */
  MessageActions: ComponentType<MessageActionsProps>;

  /**
   * Top-level sidebar layout component.
   *
   * Controls the tab bar, panel switching chrome, and overall sidebar
   * structure. Uses `renderCharacters` / `renderPersonas` / `renderChats`
   * render props to compose the actual panel content — so templates can
   * restyle the shell without reimplementing every panel.
   */
  Sidebar: ComponentType<SidebarLayoutProps>;

  /** Optional desktop-only top bar used for global navigation. */
  DesktopTopBar?: ComponentType<DesktopTopBarProps>;

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

  /**
   * Optional custom draw function for the audio visualizer canvas.
   * When omitted the default bar-chart equalizer is used.
   */
  drawVisualizer?: VisualizerDrawFn;

}
