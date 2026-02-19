import React, { useState, useCallback, useRef } from "react";
import type { CharacterListItem } from "../../../shared/types.ts";
import { Avatar } from "../ui/avatar.tsx";
import {
  useCharacters,
  useImportCharacter,
  useImportCharacterUrl,
  useCreateChatFromCharacter,
  useDeleteCharacter,
} from "../../hooks/useCharacters.ts";

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
    <div
      style={{
        width: 280,
        minWidth: 280,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "var(--color-surface)",
        borderRight: "1px solid var(--color-border)",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "0.75rem",
          borderBottom: "1px solid var(--color-border)",
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span
            style={{
              fontSize: "0.75rem",
              fontWeight: 400,
              letterSpacing: "0.15em",
              color: "var(--color-text-muted)",
              textTransform: "uppercase",
            }}
          >
            Characters
          </span>
          <span
            style={{
              fontSize: "0.7rem",
              color: "var(--color-text-dim)",
            }}
          >
            {characters.length}
          </span>
        </div>

        {/* Import buttons */}
        <div style={{ display: "flex", gap: "0.35rem" }}>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
            style={{
              flex: 1,
              padding: "0.4rem 0.5rem",
              background: "var(--color-surface-raised)",
              color: "var(--color-text-body)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              cursor: isImporting ? "wait" : "pointer",
              fontSize: "0.75rem",
              opacity: isImporting ? 0.5 : 1,
              transition: "background 0.15s",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background =
                "var(--color-surface-hover)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background =
                "var(--color-surface-raised)")
            }
          >
            {isImporting ? "Importing..." : "Import File"}
          </button>
          <button
            onClick={() => setShowUrlInput(!showUrlInput)}
            style={{
              padding: "0.4rem 0.5rem",
              background: "var(--color-surface-raised)",
              color: "var(--color-text-muted)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              cursor: "pointer",
              fontSize: "0.75rem",
              transition: "background 0.15s",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background =
                "var(--color-surface-hover)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background =
                "var(--color-surface-raised)")
            }
            title="Import from Chub URL"
          >
            URL
          </button>
        </div>

        {/* URL input */}
        {showUrlInput && (
          <div style={{ display: "flex", gap: "0.25rem" }}>
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
              style={{
                flex: 1,
                padding: "0.35rem 0.5rem",
                background: "var(--color-background)",
                color: "var(--color-text-body)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-md)",
                fontSize: "0.72rem",
                outline: "none",
              }}
              autoFocus
            />
            <button
              onClick={handleUrlImport}
              disabled={importUrlMutation.isPending}
              style={{
                padding: "0.35rem 0.5rem",
                background: "var(--color-primary)",
                color: "#fff",
                border: "none",
                borderRadius: "var(--radius-md)",
                cursor: "pointer",
                fontSize: "0.72rem",
              }}
            >
              Go
            </button>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".png,.json"
          style={{ display: "none" }}
          onChange={(e) => {
            handleFileImport(e.target.files);
            e.target.value = "";
          }}
        />

        {/* Status message */}
        {statusMessage && (
          <div
            style={{
              padding: "0.35rem 0.5rem",
              borderRadius: "var(--radius-md)",
              fontSize: "0.72rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "0.35rem",
              background:
                statusMessage.type === "success"
                  ? "oklch(0.30 0.08 155)"
                  : statusMessage.type === "warn"
                    ? "oklch(0.28 0.08 65)"
                    : "oklch(0.25 0.08 25)",
              color:
                statusMessage.type === "success"
                  ? "oklch(0.80 0.10 155)"
                  : statusMessage.type === "warn"
                    ? "oklch(0.85 0.10 65)"
                    : "oklch(0.80 0.10 25)",
            }}
          >
            <span>{statusMessage.text}</span>
            {statusMessage.action && (
              <button
                onClick={statusMessage.action.onClick}
                style={{
                  padding: "0.2rem 0.4rem",
                  background: "oklch(0.35 0.06 65)",
                  color: "oklch(0.90 0.08 65)",
                  border: "none",
                  borderRadius: "var(--radius-sm)",
                  cursor: "pointer",
                  fontSize: "0.68rem",
                  fontWeight: 400,
                  whiteSpace: "nowrap",
                }}
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
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "0.35rem",
          position: "relative",
        }}
      >
        {/* Drag overlay */}
        {dragOver && (
          <div
            style={{
              position: "absolute",
              inset: "0.35rem",
              border: "2px dashed var(--color-primary)",
              borderRadius: "var(--radius-lg)",
              background: "oklch(0.15 0.04 280 / 0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 10,
              pointerEvents: "none",
            }}
          >
            <span
              style={{
                color: "var(--color-primary)",
                fontSize: "0.85rem",
                fontWeight: 400,
              }}
            >
              Drop character card
            </span>
          </div>
        )}

        {isLoading ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              color: "var(--color-text-dim)",
              fontSize: "0.8rem",
            }}
          >
            Loading...
          </div>
        ) : characters.length === 0 ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              gap: "0.5rem",
              color: "var(--color-text-dim)",
              textAlign: "center",
              padding: "1rem",
            }}
          >
            <p style={{ fontSize: "0.85rem" }}>No characters yet</p>
            <p style={{ fontSize: "0.72rem", lineHeight: 1.4 }}>
              Import a PNG character card or JSON file to get started.
              Drag and drop works too.
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            {characters.map((char) => (
              <CharacterCard
                key={char.id}
                character={char}
                onStartChat={() => handleStartChat(char.id)}
                onDelete={() => handleDelete(char.id, char.name)}
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
  onDelete,
  isCreatingChat,
}: {
  character: CharacterListItem;
  onStartChat: () => void;
  onDelete: () => void;
  isCreatingChat: boolean;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",
        padding: "0.5rem",
        borderRadius: "var(--radius-md)",
        cursor: "pointer",
        transition: "background 0.15s",
        background: hovered ? "var(--color-surface-hover)" : "transparent",
        position: "relative",
      }}
      onClick={onStartChat}
    >
      {/* Avatar */}
      {character.avatar_url ? (
        <Avatar
          src={character.avatar_url}
          alt={character.name}
          size={36}
        />
      ) : (
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: "var(--radius-md)",
            background: "var(--color-surface-raised)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "0.85rem",
            fontWeight: 500,
            color: "var(--color-text-muted)",
            flexShrink: 0,
          }}
        >
          {character.name.charAt(0).toUpperCase()}
        </div>
      )}

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: "0.8rem",
            fontWeight: 400,
            color: "var(--color-text-body)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {character.name}
        </div>
        {character.creator && (
          <div
            style={{
              fontSize: "0.68rem",
              color: "var(--color-text-dim)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            by {character.creator}
          </div>
        )}
      </div>

      {/* Actions on hover */}
      {hovered && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          style={{
            position: "absolute",
            top: "0.35rem",
            right: "0.35rem",
            width: 18,
            height: 18,
            padding: 0,
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--color-text-dim)",
            fontSize: "0.7rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "var(--radius-sm)",
            transition: "color 0.15s",
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.color = "var(--color-destructive)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.color = "var(--color-text-dim)")
          }
          title="Delete character"
        >
          &times;
        </button>
      )}
    </div>
  );
}
