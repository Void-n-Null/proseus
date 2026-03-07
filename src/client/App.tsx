import React, { useState, useCallback, useEffect, useMemo, type ReactNode } from "react";
import { motion } from "motion/react";
import { useChatList, useUpdateChat } from "./hooks/useChat.ts";
import { useCharacters } from "./hooks/useCharacters.ts";
import { useRoute } from "./hooks/useRoute.ts";
import { useIsMobile } from "./hooks/useMediaQuery.ts";
import { useVisualViewportHeight } from "./hooks/useVisualViewportHeight.ts";
import ChatPage from "./components/chat/ChatPage.tsx";
import ChatGallery from "./components/chat/ChatGallery.tsx";
import CharacterSidebar from "./components/characters/CharacterSidebar.tsx";
import PersonaSidebar from "./components/personas/PersonaSidebar.tsx";
import { useOAuthCallback } from "./hooks/useOAuthCallback.ts";
import { useDesignTemplateId } from "./hooks/useDesignTemplate.ts";
import {
  applyDesignTemplate,
  getStoredDesignTemplateChoice,
  setStoredDesignTemplateId,
} from "./lib/design-templates.ts";
import ModelSelector from "./components/model/ModelSelector.tsx";
import ModelDashboard from "./components/model/ModelDashboard.tsx";
import PromptTemplateModal from "./components/prompt-template/PromptTemplateModal.tsx";
import TemplatePickerModal, {
  TemplatePickerGrid,
} from "./components/design-template/TemplatePicker.tsx";
import TopDock from "./components/navigation/TopDock.tsx";
import MobileSlideUpSheet from "./components/ui/mobile-slide-up-sheet.tsx";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "./components/ui/dialog.tsx";
import { getTemplate } from "./templates/index.ts";
import DiscordFrameShell from "./templates/discord/DiscordFrameShell.tsx";
import type { SidebarView } from "./templates/types.ts";
import { type DesignTemplateId } from "../shared/design-templates.ts";
import { api } from "./api/client.ts";
import { getFilenameFromDisposition, triggerDownload } from "./lib/download.ts";
import { toast } from "sonner";

const ONBOARDING_COMPLETE_KEY = "proseus:onboarding-complete";
const LEGACY_ONBOARDING_DISMISSED_KEY = "proseus:onboarding-dismissed";

function getInitialOnboardingCompleteState(): boolean {
  if (typeof window === "undefined") return true;
  return (
    window.localStorage.getItem(ONBOARDING_COMPLETE_KEY) === "1" ||
    window.localStorage.getItem(LEGACY_ONBOARDING_DISMISSED_KEY) === "1"
  );
}

export default function App() {
  const { data: chatData, isLoading, isFetching, refetch } = useChatList();
  const {
    data: characterData,
    isLoading: isLoadingCharacters,
    isFetching: isFetchingCharacters,
  } = useCharacters();
  const { route, navigateToChat, navigateHome, replaceRoute } = useRoute();
  const [activeLibraryPanel, setActiveLibraryPanel] = useState<SidebarView | null>(
    null,
  );
  const [topBarCollapsed, setTopBarCollapsed] = useState(false);
  const [modelDashboardOpen, setModelDashboardOpen] = useState(false);
  const [promptTemplateOpen, setPromptTemplateOpen] = useState(false);
  const [themePickerOpen, setThemePickerOpen] = useState(false);
  const [isExportingChat, setIsExportingChat] = useState(false);
  const designTemplateId = useDesignTemplateId();
  const template = getTemplate(designTemplateId);
  const { oauthState, dismissOAuth } = useOAuthCallback();
  const isMobile = useIsMobile();
  const [onboardingComplete, setOnboardingComplete] = useState(
    getInitialOnboardingCompleteState,
  );
  const [pendingTemplateSelection, setPendingTemplateSelection] =
    useState<DesignTemplateId | null>(() => {
      if (typeof window === "undefined") return null;
      return getStoredDesignTemplateChoice();
    });
  const updateChatMutation = useUpdateChat();
  useVisualViewportHeight(isMobile);

  const appViewportStyle = isMobile
    ? {
        height: "var(--app-visual-viewport-height, 100dvh)",
        transform: "translateZ(0)",
      }
    : undefined;

  const handleChatCreated = useCallback(
    (chatId: string) => {
      navigateToChat(chatId);
      setActiveLibraryPanel(null);
      refetch();
    },
    [navigateToChat, refetch],
  );

  const handleSelectChat = useCallback(
    (chatId: string) => {
      navigateToChat(chatId);
      setActiveLibraryPanel(null);
    },
    [navigateToChat],
  );

  const handleToggleTopBarCollapsed = useCallback(() => {
    setTopBarCollapsed((collapsed) => {
      const next = !collapsed;
      if (next) {
        setActiveLibraryPanel(null);
      }
      return next;
    });
  }, []);

  const handleToggleLibraryPanel = useCallback((view: SidebarView) => {
    setTopBarCollapsed(false);
    setActiveLibraryPanel((current) => (current === view ? null : view));
  }, []);

  const handleOpenChatLibrary = useCallback(() => {
    setTopBarCollapsed(false);
    setActiveLibraryPanel("chats");
  }, []);
  const handleMobileBackToChatList = useCallback(() => {
    navigateHome();
    setTopBarCollapsed(false);
    setActiveLibraryPanel("chats");
  }, [navigateHome]);
  const handleShowTopDock = useCallback(() => {
    setTopBarCollapsed(false);
  }, []);

  const chats = chatData?.chats ?? [];
  const characters = characterData?.characters ?? [];
  const shouldShowOnboarding =
    !isLoading &&
    !isFetching &&
    !isLoadingCharacters &&
    !isFetchingCharacters &&
    !onboardingComplete &&
    chats.length === 0 &&
    characters.length === 0;

  const handleSelectDesignTemplate = useCallback((id: DesignTemplateId) => {
    setStoredDesignTemplateId(id);
    applyDesignTemplate(id);
    setPendingTemplateSelection(id);
  }, []);

  const handleCompleteOnboarding = useCallback(() => {
    if (!pendingTemplateSelection) return;
    window.localStorage.setItem(ONBOARDING_COMPLETE_KEY, "1");
    window.localStorage.setItem(LEGACY_ONBOARDING_DISMISSED_KEY, "1");
    setOnboardingComplete(true);
  }, [pendingTemplateSelection]);

  // Validate the chat ID from the URL against the actual chat list.
  // If the URL points to a chat that doesn't exist, silently redirect home.
  const activeChatId = route.chatId;
  const resolvedChatId = useMemo(() => {
    if (!activeChatId) return null;
    if (chats.some((c) => c.id === activeChatId)) return activeChatId;
    return null;
  }, [activeChatId, chats]);
  const activeChat = useMemo(
    () => chats.find((chat) => chat.id === resolvedChatId) ?? null,
    [chats, resolvedChatId],
  );
  const promptEnabled = resolvedChatId !== null;
  const chatManagementEnabled = resolvedChatId !== null;

  const handleOpenModelDashboard = useCallback(() => {
    setModelDashboardOpen(true);
  }, []);

  const handleOpenThemePicker = useCallback(() => {
    setThemePickerOpen(true);
  }, []);

  const handleOpenPromptTemplate = useCallback(() => {
    if (!resolvedChatId) return;
    setPromptTemplateOpen(true);
  }, [resolvedChatId]);

  const handleRenameActiveChat = useCallback(
    async (name: string) => {
      if (!resolvedChatId) return;
      const nextName = name.trim();
      if (!nextName || nextName === (activeChat?.name ?? "").trim()) return;

      try {
        await updateChatMutation.mutateAsync({ id: resolvedChatId, name: nextName });
        toast.success("Chat renamed");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        toast.error("Rename failed", { description: message });
        throw err;
      }
    },
    [activeChat?.name, resolvedChatId, updateChatMutation],
  );

  const handleExportActiveChat = useCallback(
    async (format: "chat" | "jsonl" | "txt") => {
      if (!resolvedChatId) return;

      const fallbackBase = (activeChat?.name || "chat")
        .trim()
        .replace(/[^a-zA-Z0-9._-]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "") || "chat";
      const extension = format === "chat" ? "chat" : format;
      const fallbackName = `${fallbackBase}-${new Date().toISOString().slice(0, 10)}.${extension}`;

      setIsExportingChat(true);
      try {
        const result =
          format === "chat"
            ? await api.chats.exportChat(resolvedChatId)
            : format === "jsonl"
              ? await api.chats.exportJsonl(resolvedChatId)
              : await api.chats.exportTxt(resolvedChatId);
        const filename = getFilenameFromDisposition(
          result.contentDisposition,
          fallbackName,
        );
        triggerDownload(result.blob, filename);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        toast.error("Export failed", { description: message });
      } finally {
        setIsExportingChat(false);
      }
    },
    [activeChat?.name, resolvedChatId],
  );

  // If the URL had an invalid chat ID and data has loaded, fix the URL.
  useEffect(() => {
    if (!isLoading && !isFetching && activeChatId && !resolvedChatId) {
      replaceRoute({ page: "home", chatId: null });
    }
  }, [isLoading, isFetching, activeChatId, resolvedChatId, replaceRoute]);

  // ── Render-prop factories for the three sidebar panels ──
  // These let the template's Sidebar component compose the actual panel
  // content without knowing anything about CharacterSidebar / PersonaSidebar /
  // ChatGallery internals.
  const renderCharacters = useCallback(
    (tabs?: ReactNode) => <CharacterSidebar onChatCreated={handleChatCreated} tabs={tabs} />,
    [handleChatCreated],
  );
  const renderPersonas = useCallback(
    (tabs?: ReactNode) => <PersonaSidebar tabs={tabs} />,
    [],
  );
  const renderChats = useCallback(
    (tabs?: ReactNode) => (
      <ChatGallery
        activeChatId={resolvedChatId}
        onSelectChat={handleSelectChat}
        isLoading={isLoading}
        tabs={tabs}
      />
    ),
    [resolvedChatId, handleSelectChat, isLoading],
  );

  const SidebarComponent = template.Sidebar;
  const DesktopTopBarComponent = template.DesktopTopBar;

  const isDiscord = designTemplateId === "discord";
  const hasDiscordDesktopSidebar = isDiscord && !isMobile;
  const canHideTopDock = !hasDiscordDesktopSidebar && resolvedChatId !== null;
  const topDockHidden = canHideTopDock && topBarCollapsed;
  const modalPanelView =
    hasDiscordDesktopSidebar && activeLibraryPanel === "chats"
      ? null
      : activeLibraryPanel;
  useEffect(() => {
    if (!canHideTopDock && topBarCollapsed) {
      setTopBarCollapsed(false);
    }
  }, [canHideTopDock, topBarCollapsed]);

  const desktopTopBar = !isMobile && !topDockHidden && DesktopTopBarComponent ? (
    <DesktopTopBarComponent
      activePanel={modalPanelView}
      onTogglePanel={handleToggleLibraryPanel}
      chatCount={chats.length}
      activeChatName={activeChat?.name ?? null}
      collapsed={topBarCollapsed}
      allowCollapse={canHideTopDock}
      showChatsButton={!hasDiscordDesktopSidebar}
      promptEnabled={promptEnabled}
      chatManagementEnabled={chatManagementEnabled}
      onOpenThemePicker={handleOpenThemePicker}
      isExportingChat={isExportingChat}
      isRenamingChat={updateChatMutation.isPending}
      onOpenModelDashboard={handleOpenModelDashboard}
      onOpenPromptTemplate={handleOpenPromptTemplate}
      onRenameChat={handleRenameActiveChat}
      onExportChat={handleExportActiveChat}
      onToggleCollapsed={
        hasDiscordDesktopSidebar ? undefined : handleToggleTopBarCollapsed
      }
    />
  ) : null;
  const mobileTopBar = !topDockHidden ? (
    <div className="shrink-0 border-b border-border bg-[linear-gradient(180deg,color-mix(in_oklab,var(--color-surface)_78%,transparent),color-mix(in_oklab,var(--color-background)_96%,black))] px-3 py-2.5">
      <TopDock
        variant={isDiscord ? "discord" : "default"}
        density="regular"
        collapsed={topBarCollapsed}
        allowCollapse={canHideTopDock}
        showChatsButton
        activePanel={activeLibraryPanel}
        chatCount={chats.length}
        activeChatName={activeChat?.name ?? null}
        promptEnabled={promptEnabled}
        chatManagementEnabled={chatManagementEnabled}
        onOpenThemePicker={handleOpenThemePicker}
        isExportingChat={isExportingChat}
        isRenamingChat={updateChatMutation.isPending}
        onOpenModelDashboard={handleOpenModelDashboard}
        onOpenPromptTemplate={handleOpenPromptTemplate}
        onRenameChat={handleRenameActiveChat}
        onExportChat={handleExportActiveChat}
        onTogglePanel={handleToggleLibraryPanel}
        onToggleCollapsed={handleToggleTopBarCollapsed}
      />
    </div>
  ) : null;

  /** Picks the outer shell: DiscordFrameShell on desktop-discord, plain div otherwise. */
  const Shell = isDiscord && !isMobile ? DiscordFrameShell : PassthroughShell;
  const libraryPanelContent = modalPanelView ? (
    <SidebarComponent
      view={modalPanelView}
      setView={handleToggleLibraryPanel}
      chatCount={chats.length}
      activeChatId={resolvedChatId}
      isLoading={isLoading}
      onChatCreated={handleChatCreated}
      onSelectChat={handleSelectChat}
      renderCharacters={renderCharacters}
      renderPersonas={renderPersonas}
      renderChats={renderChats}
    />
  ) : null;

  return (
    <Shell style={appViewportStyle} topBar={desktopTopBar}>
      {/* OAuth callback feedback */}
      {oauthState.status === "exchanging" && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-surface border-b border-border text-sm text-text-body shrink-0">
          <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin shrink-0" />
          Connecting to OpenRouter...
        </div>
      )}
      {oauthState.status === "success" && (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b shrink-0 bg-[oklch(0.70_0.15_155_/_0.06)] border-[oklch(0.70_0.15_155_/_0.15)]">
          <div className="flex items-center gap-2 text-sm text-[oklch(0.72_0.15_155)]">
            <svg viewBox="0 0 12 12" fill="none" className="w-4 h-4">
              <path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            OpenRouter connected successfully
          </div>
          <button type="button" onClick={dismissOAuth} className="text-text-dim hover:text-text-muted transition-colors text-xs">
            Dismiss
          </button>
        </div>
      )}
      {oauthState.status === "error" && (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b shrink-0 bg-[oklch(0.55_0.15_40_/_0.06)] border-[oklch(0.55_0.15_40_/_0.15)]">
          <div className="flex items-center gap-2 text-sm text-[oklch(0.70_0.15_40)]">
            <svg viewBox="0 0 12 12" fill="none" className="w-4 h-4">
              <path d="M3 3L9 9M9 3L3 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            OAuth failed: {oauthState.message}
          </div>
          <button type="button" onClick={dismissOAuth} className="text-text-dim hover:text-text-muted transition-colors text-xs">
            Dismiss
          </button>
        </div>
      )}

      {isMobile && mobileTopBar}

      <div className="flex-1 min-h-0 flex">
        {hasDiscordDesktopSidebar && (
          <SidebarComponent
            view="chats"
            setView={handleToggleLibraryPanel}
            chatCount={chats.length}
            activeChatId={resolvedChatId}
            isLoading={isLoading}
            onChatCreated={handleChatCreated}
            onSelectChat={handleSelectChat}
            renderCharacters={renderCharacters}
            renderPersonas={renderPersonas}
            renderChats={renderChats}
          />
        )}

        <div className="flex-1 min-w-0">
          {isLoading ? (
            <CenterMessage>Loading...</CenterMessage>
          ) : resolvedChatId ? (
            <ChatPage
              chatId={resolvedChatId}
              onBack={
                isMobile
                  ? handleMobileBackToChatList
                  : hasDiscordDesktopSidebar
                    ? undefined
                    : handleOpenChatLibrary
              }
              topDockHidden={topDockHidden}
              onShowTopDock={topDockHidden ? handleShowTopDock : undefined}
            />
          ) : (
            <CenterMessage>
              <HomeEmptyState
                chatCount={chats.length}
                characterCount={characters.length}
              />
            </CenterMessage>
          )}
        </div>
      </div>

      {isMobile ? (
        <MobileSlideUpSheet
          open={activeLibraryPanel !== null}
          onClose={() => setActiveLibraryPanel(null)}
        >
          <div className="h-full">{libraryPanelContent}</div>
        </MobileSlideUpSheet>
      ) : (
        <Dialog
          open={modalPanelView !== null}
          onOpenChange={(open) => {
            if (!open) {
              setActiveLibraryPanel(null);
            }
          }}
        >
          <DialogContent className="max-w-[min(96vw,44rem)] border-none bg-transparent p-0 shadow-none">
            <DialogHeader className="sr-only">
              <DialogTitle>
                {modalPanelView === "characters"
                  ? "Characters"
                  : modalPanelView === "personas"
                    ? "Personas"
                    : "Chats"}
              </DialogTitle>
            </DialogHeader>
            <div className="h-[min(85vh,48rem)] min-h-[24rem] overflow-hidden rounded-[1.5rem] border border-border bg-background shadow-[0_24px_80px_oklch(0_0_0_/_0.32)]">
              {libraryPanelContent}
            </div>
          </DialogContent>
        </Dialog>
      )}
      <ModelDashboard
        open={modelDashboardOpen}
        onOpenChange={setModelDashboardOpen}
      />
      <TemplatePickerModal
        open={themePickerOpen}
        onOpenChange={setThemePickerOpen}
        activeId={designTemplateId}
        onSelect={handleSelectDesignTemplate}
      />
      {resolvedChatId && (
        <PromptTemplateModal
          open={promptTemplateOpen}
          onOpenChange={setPromptTemplateOpen}
          chatId={resolvedChatId}
        />
      )}
      {shouldShowOnboarding && (
        <FirstLaunchOverlay
          selectedTemplateId={pendingTemplateSelection}
          activeTemplateId={designTemplateId}
          onSelectDesignTemplate={handleSelectDesignTemplate}
          onContinue={handleCompleteOnboarding}
        />
      )}
    </Shell>
  );
}

/** Default app shell — plain div with bg-background, no frame gutters. */
function PassthroughShell({
  children,
  style,
  topBar,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  topBar?: React.ReactNode;
}) {
  return (
    <div className="font-body text-foreground bg-background h-dvh flex flex-col" style={style}>
      {topBar}
      {children}
    </div>
  );
}

function CenterMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-text-muted text-center p-8">
      {children}
    </div>
  );
}

function HomeEmptyState({
  chatCount,
  characterCount,
}: {
  chatCount: number;
  characterCount: number;
}) {
  const hasChats = chatCount > 0;
  const hasCharacters = characterCount > 0;

  return (
    <div className="flex max-w-xl flex-col items-center">
      <p className="text-base text-text-body">
        {hasChats
          ? "Select a chat or start one from a character"
          : hasCharacters
          ? "Select a character to start your first chat"
          : "Import a character to get started"}
      </p>
      <p className="mt-2 text-[0.82rem] leading-6 text-text-dim">
        {hasChats
          ? "Open Chats from the top dock to resume a conversation, or open Characters to start a fresh thread."
          : hasCharacters
          ? "Use the top dock to open Characters, then begin a new conversation or continue an existing thread."
          : "Open the model dashboard, connect a provider, then use Characters in the top dock to import a PNG or JSON character card."}
      </p>
      {!hasChats && !hasCharacters && (
        <div className="mt-5">
          <ModelSelector className="h-10 px-4 text-sm" />
        </div>
      )}
    </div>
  );
}

function FirstLaunchOverlay({
  selectedTemplateId,
  activeTemplateId,
  onSelectDesignTemplate,
  onContinue,
}: {
  selectedTemplateId: DesignTemplateId | null;
  activeTemplateId: DesignTemplateId;
  onSelectDesignTemplate: (id: DesignTemplateId) => void;
  onContinue: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-40 flex items-center justify-center bg-[radial-gradient(circle_at_top,oklch(0.26_0.08_285_/_0.42),transparent_40%),oklch(0_0_0_/_0.76)] px-4 py-6 backdrop-blur-md"
    >
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-6xl rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,oklch(0.14_0.02_280),oklch(0.1_0.015_275))] shadow-[0_40px_120px_oklch(0_0_0_/_0.55)]"
      >
        <div className="border-b border-white/8 px-6 py-6 sm:px-8">
          <div className="max-w-3xl">
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.32em] text-white/55">
              First Launch
            </p>
            <h2 className="mt-3 text-3xl font-semibold text-white sm:text-4xl">
              What should Proseus look like?
            </h2>
            <p className="mt-3 text-sm leading-7 text-white/72 sm:text-[0.95rem]">
              Pick the interface that feels most familiar, then connect your
              model provider and import a character. The app will preview your
              selection live behind this overlay before you step inside.
            </p>
          </div>
        </div>

        <div className="px-6 py-6 sm:px-8">
          <TemplatePickerGrid
            activeId={activeTemplateId}
            onSelect={onSelectDesignTemplate}
            embedded
          />

          <div className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-[1.5rem] border border-white/8 bg-white/[0.03] p-5 text-left">
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.24em] text-white/55">
                Step 1
              </p>
              <h3 className="mt-2 text-lg font-semibold text-white">
                Connect a provider in the model dashboard
              </h3>
              <p className="mt-2 text-sm leading-6 text-white/68">
                This is the same control you will use later in the app. Hook up a
                provider now so your first conversation is one click away.
              </p>
              <div className="mt-4">
                <ModelSelector className="h-10 px-4 text-sm" />
              </div>
            </div>

            <div className="rounded-[1.5rem] border border-white/8 bg-white/[0.03] p-5 text-left">
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.24em] text-white/55">
                Step 2
              </p>
              <h3 className="mt-2 text-lg font-semibold text-white">
                Lock in your visual vibe
              </h3>
              <p className="mt-2 text-sm leading-6 text-white/68">
                Choose one of the templates above. You can change it later from
                the chat header or theme controls at any time.
              </p>
              <button
                type="button"
                disabled={!selectedTemplateId}
                onClick={onContinue}
                className="mt-6 inline-flex h-11 items-center justify-center rounded-xl bg-white px-5 text-sm font-semibold text-black transition-all hover:scale-[1.01] disabled:cursor-not-allowed disabled:bg-white/12 disabled:text-white/45"
              >
                {selectedTemplateId ? "Get Started" : "Select a template to continue"}
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

