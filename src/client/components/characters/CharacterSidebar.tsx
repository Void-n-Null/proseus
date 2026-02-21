import React, { useState, useCallback, useRef, useEffect } from "react";
import type { CharacterListItem } from "../../../shared/types.ts";
import { Avatar } from "../ui/avatar.tsx";
import {
  useCharacters,
  useCharacter,
  useImportCharacter,
  useImportCharacterUrl,
  useCreateChatFromCharacter,
  useDeleteCharacter,
  useRecentChatForCharacter,
} from "../../hooks/useCharacters.ts";
import CharacterEditor from "./CharacterEditor.tsx";

interface CharacterSidebarProps {
  onChatCreated: (chatId: string) => void;
}

export default function CharacterSidebar({
  onChatCreated,
}: CharacterSidebarProps) {
  const { data, isLoading } = useCharacters();
  const importMutation = useImportCharacter();
  const importUrlMutation = useImportCharacterUrl();
  const createChatMutation = useCreateChatFromCharacter();
  const deleteMutation = useDeleteCharacter();

  const [dragOver, setDragOver] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [editingCharacterId, setEditingCharacterId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    text: string;
    type: "success" | "error" | "warn";
    action?: { label: string; onClick: () => void };
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showStatus = useCallback(
    (
      text: string,
      type: "success" | "error" | "warn",
      action?: { label: string; onClick: () => void },
    ) => {
      setStatusMessage({ text, type, action });
      if (!action) {
        setTimeout(() => setStatusMessage(null), 4000);
      }
    },
    [],
  );

  const handleFileImport = useCallback(
    async (files: FileList | null, force?: boolean) => {
      if (!files?.length) return;
      const file = files[0];
      if (!file) return;

      try {
        const result = await importMutation.mutateAsync({ file, force });
        if (result.duplicate) {
          // Offer to force-import
          showStatus(
            `"${result.character.name}" already exists.`,
            "warn",
            {
              label: "Import Anyway",
              onClick: () => {
                setStatusMessage(null);
                handleFileImport(files, true);
              },
            },
          );
        } else {
          showStatus(`Imported "${result.character.name}"`, "success");
        }
      } catch (err) {
        showStatus(
          err instanceof Error ? err.message : "Import failed",
          "error",
        );
      }
    },
    [importMutation, showStatus],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      handleFileImport(e.dataTransfer.files);
    },
    [handleFileImport],
  );

  const handleUrlImport = useCallback(async () => {
    if (!urlInput.trim()) return;
    try {
      const result = await importUrlMutation.mutateAsync(urlInput.trim());
      if (result.duplicate) {
        showStatus(
          `"${result.character.name}" already exists`,
          "error",
        );
      } else {
        showStatus(`Imported "${result.character.name}"`, "success");
      }
      setUrlInput("");
      setShowUrlInput(false);
    } catch (err) {
      showStatus(
        err instanceof Error ? err.message : "URL import failed",
        "error",
      );
    }
  }, [urlInput, importUrlMutation, showStatus]);

  const handleStartChat = useCallback(
    async (characterId: string) => {
      try {
        const result = await createChatMutation.mutateAsync(characterId);
        onChatCreated(result.chat.id);
      } catch (err) {
        showStatus(
          err instanceof Error ? err.message : "Failed to create chat",
          "error",
        );
      }
    },
    [createChatMutation, onChatCreated, showStatus],
  );

  const handleContinueChat = useCallback(
    (chatId: string) => {
      onChatCreated(chatId);
    },
    [onChatCreated],
  );

  const handleDelete = useCallback(
    async (id: string, name: string) => {
      try {
        await deleteMutation.mutateAsync(id);
        showStatus(`Deleted "${name}"`, "success");
      } catch (err) {
        showStatus(
          err instanceof Error ? err.message : "Delete failed",
          "error",
        );
      }
    },
    [deleteMutation, showStatus],
  );

  const characters = data?.characters ?? [];
  const isImporting = importMutation.isPending || importUrlMutation.isPending;

  return (
    <div className="w-[280px] min-w-[280px] h-full flex flex-col bg-surface border-r border-border">
      {creating && (
        <CharacterEditor
          character={null}
          onClose={() => setCreating(false)}
          onCreate={() => setCreating(false)}
        />
      )}
      {editingCharacterId && (
        <CharacterEditorLoader
          id={editingCharacterId}
          onClose={() => setEditingCharacterId(null)}
        />
      )}

      {/* Header */}
      <div className="p-3 border-b border-border flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-[0.75rem] font-normal tracking-[0.15em] text-text-muted uppercase">
            Characters
          </span>
          <div className="flex items-center gap-[0.35rem]">
            <span className="text-[0.7rem] text-text-dim">
              {characters.length}
            </span>
            <button
              onClick={() => setCreating(true)}
              className="px-[0.45rem] py-[0.15rem] bg-primary text-white border-none rounded-sm cursor-pointer text-[0.72rem] leading-[1.4]"
              title="Create new character"
            >
              + New
            </button>
          </div>
        </div>

        {/* Import buttons */}
        <div className="flex gap-[0.35rem]">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
            className={`flex-1 px-[0.5rem] py-[0.4rem] bg-surface-raised text-text-body border border-border rounded-md text-[0.75rem] transition-[background] duration-150 hover:bg-surface-hover ${isImporting ? "cursor-wait opacity-50" : "cursor-pointer opacity-100"}`}
          >
            {isImporting ? "Importing..." : "Import File"}
          </button>
          <button
            onClick={() => setShowUrlInput(!showUrlInput)}
            className="px-[0.5rem] py-[0.4rem] bg-surface-raised text-text-muted border border-border rounded-md cursor-pointer text-[0.75rem] transition-[background] duration-150 hover:bg-surface-hover"
            title="Import from Chub URL"
          >
            URL
          </button>
        </div>

        {/* URL input */}
        {showUrlInput && (
          <div className="flex gap-1">
            <input
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleUrlImport();
                if (e.key === "Escape") {
                  setShowUrlInput(false);
                  setUrlInput("");
                }
              }}
              placeholder="chub.ai/characters/..."
              className="flex-1 px-[0.5rem] py-[0.35rem] bg-background text-text-body border border-border rounded-md text-[0.72rem] outline-none"
              autoFocus
            />
            <button
              onClick={handleUrlImport}
              disabled={importUrlMutation.isPending}
              className="px-[0.5rem] py-[0.35rem] bg-primary text-white border-none rounded-md cursor-pointer text-[0.72rem]"
            >
              Go
            </button>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".png,.json"
          className="hidden"
          onChange={(e) => {
            handleFileImport(e.target.files);
            e.target.value = "";
          }}
        />

        {/* Status message */}
        {statusMessage && (
          <div
            className={`px-[0.5rem] py-[0.35rem] rounded-md text-[0.72rem] flex items-center justify-between gap-[0.35rem] ${
              statusMessage.type === "success"
                ? "bg-[oklch(0.30_0.08_155)] text-[oklch(0.80_0.10_155)]"
                : statusMessage.type === "warn"
                  ? "bg-[oklch(0.28_0.08_65)] text-[oklch(0.85_0.10_65)]"
                  : "bg-[oklch(0.25_0.08_25)] text-[oklch(0.80_0.10_25)]"
            }`}
          >
            <span>{statusMessage.text}</span>
            {statusMessage.action && (
              <button
                onClick={statusMessage.action.onClick}
                className="px-[0.4rem] py-[0.2rem] bg-[oklch(0.35_0.06_65)] text-[oklch(0.90_0.08_65)] border-none rounded-sm cursor-pointer text-[0.68rem] font-normal whitespace-nowrap"
              >
                {statusMessage.action.label}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Drop zone + character list */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className="flex-1 overflow-y-auto p-[0.35rem] relative"
      >
        {/* Drag overlay */}
        {dragOver && (
          <div className="absolute inset-[0.35rem] border-2 border-dashed border-primary rounded-lg bg-[oklch(0.15_0.04_280/0.5)] flex items-center justify-center z-10 pointer-events-none">
            <span className="text-primary text-[0.85rem] font-normal">
              Drop character card
            </span>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center h-full text-text-dim text-[0.8rem]">
            Loading...
          </div>
        ) : characters.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-text-dim text-center p-4">
            <p className="text-[0.85rem]">No characters yet</p>
            <p className="text-[0.72rem] leading-[1.4]">
              Import a PNG character card or JSON file to get started.
              Drag and drop works too.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {characters.map((char) => (
              <CharacterCard
                key={char.id}
                character={char}
                onStartChat={() => handleStartChat(char.id)}
                onContinueChat={handleContinueChat}
                onDelete={() => handleDelete(char.id, char.name)}
                onEdit={() => setEditingCharacterId(char.id)}
                isCreatingChat={createChatMutation.isPending}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CharacterCard({
  character,
  onStartChat,
  onContinueChat,
  onDelete,
  onEdit,
  isCreatingChat,
}: {
  character: CharacterListItem;
  onStartChat: () => void;
  onContinueChat: (chatId: string) => void;
  onDelete: () => void;
  onEdit: () => void;
  isCreatingChat: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const [showPopover, setShowPopover] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const { data: recentChatData } = useRecentChatForCharacter(character.id);
  const recentChat = recentChatData?.chat ?? null;

  useEffect(() => {
    if (!showPopover) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        setShowPopover(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowPopover(false);
    };
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [showPopover]);

  const handleClick = () => {
    if (showPopover) return;
    if (recentChat) {
      setShowPopover(true);
    } else {
      onStartChat();
    }
  };

  return (
    <div
      ref={cardRef}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`rounded-md transition-[background] duration-150 ${showPopover ? "cursor-default bg-surface-hover" : "cursor-pointer"} ${hovered && !showPopover ? "bg-surface-hover" : ""} ${!hovered && !showPopover ? "bg-transparent" : ""}`}
      onClick={handleClick}
    >
      {showPopover && recentChat ? (
        <div
          onClick={(e) => e.stopPropagation()}
          className="p-[0.35rem] flex flex-row gap-1"
        >
          <button
            onClick={() => {
              setShowPopover(false);
              onContinueChat(recentChat.id);
            }}
            className="flex-1 min-w-0 px-[0.6rem] py-[0.5rem] bg-primary text-white border-none rounded-sm cursor-pointer text-[0.72rem] text-center whitespace-nowrap"
            title={`Continue "${recentChat.name}"`}
          >
            ↩ Continue
          </button>
          <button
            onClick={() => {
              setShowPopover(false);
              onStartChat();
            }}
            className="flex-1 px-[0.6rem] py-[0.5rem] bg-transparent text-text-muted border border-border rounded-sm cursor-pointer text-[0.72rem] text-center whitespace-nowrap"
          >
            + New
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 p-2 relative">
          {character.avatar_url ? (
            <Avatar src={character.avatar_url} alt={character.name} size={36} />
          ) : (
            <div className="w-9 h-9 rounded-md bg-surface-raised flex items-center justify-center text-[0.85rem] font-medium text-text-muted shrink-0">
              {character.name.charAt(0).toUpperCase()}
            </div>
          )}

          <div className="flex-1 min-w-0">
            <div className="text-[0.8rem] font-normal text-text-body whitespace-nowrap overflow-hidden text-ellipsis">
              {character.name}
            </div>
            {character.creator && (
              <div className="text-[0.68rem] text-text-dim whitespace-nowrap overflow-hidden text-ellipsis">
                by {character.creator}
              </div>
            )}
          </div>

          {hovered && (
            <div className="absolute top-[0.35rem] right-[0.35rem] flex gap-[0.2rem]">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
                className="w-5 h-5 p-0 bg-none border-none cursor-pointer text-text-dim text-[0.65rem] flex items-center justify-center rounded-sm transition-[color] duration-150 hover:text-primary"
                title="Edit character"
              >
                ✎
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="w-5 h-5 p-0 bg-none border-none cursor-pointer text-text-dim text-[0.75rem] flex items-center justify-center rounded-sm transition-[color] duration-150 hover:text-destructive"
                title="Delete character"
              >
                &times;
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CharacterEditorLoader({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}) {
  const { data, isLoading } = useCharacter(id);
  if (isLoading || !data) return null;
  return <CharacterEditor character={data.character} onClose={onClose} />;
}
