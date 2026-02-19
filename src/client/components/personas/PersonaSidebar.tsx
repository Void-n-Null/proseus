import React, { useState, useRef, useCallback } from "react";
import type { Persona } from "../../../shared/types.ts";
import { Avatar } from "../ui/avatar.tsx";
import {
  usePersonas,
  usePersona,
  useCreatePersona,
  useUpdatePersona,
  useUploadPersonaAvatar,
  useDeletePersona,
} from "../../hooks/usePersonas.ts";

export default function PersonaSidebar() {
  const { data, isLoading } = usePersonas();
  const createMutation = useCreatePersona();
  const personas = data?.personas ?? [];

  const [editing, setEditing] = useState<Persona | null>(null);
  const [creating, setCreating] = useState(false);

  if (editing) {
    return (
      <PersonaEditor
        persona={editing}
        onClose={() => setEditing(null)}
      />
    );
  }

  if (creating) {
    return (
      <PersonaCreator
        onClose={() => setCreating(false)}
        onCreate={(p) => {
          setCreating(false);
          setEditing(p);
        }}
      />
    );
  }

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
          Personas
        </span>
        <button
          onClick={() => setCreating(true)}
          disabled={createMutation.isPending}
          style={{
            padding: "0.3rem 0.6rem",
            background: "var(--color-primary)",
            color: "#fff",
            border: "none",
            borderRadius: "var(--radius-md)",
            cursor: "pointer",
            fontSize: "0.72rem",
            opacity: createMutation.isPending ? 0.5 : 1,
          }}
        >
          + New
        </button>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0.35rem" }}>
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
        ) : personas.length === 0 ? (
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
            <p style={{ fontSize: "0.85rem" }}>No personas yet</p>
            <p style={{ fontSize: "0.72rem", lineHeight: 1.4 }}>
              Create a persona to represent yourself in chats.
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            {personas.map((p) => (
              <PersonaRow
                key={p.id}
                persona={p}
                onEdit={() => setEditing(p)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PersonaRow({
  persona,
  onEdit,
}: {
  persona: Persona;
  onEdit: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const deleteMutation = useDeletePersona();

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
        background: hovered ? "var(--color-surface-hover)" : "transparent",
        transition: "background 0.15s",
        position: "relative",
      }}
      onClick={onEdit}
    >
      {/* Avatar */}
      <PersonaAvatar persona={persona} size={36} />

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
          {persona.name}
        </div>
        <div
          style={{
            fontSize: "0.68rem",
            color: "var(--color-text-dim)",
            display: "flex",
            gap: "0.35rem",
            alignItems: "center",
          }}
        >
          {persona.is_global && (
            <span
              style={{
                padding: "0 0.3rem",
                background: "oklch(0.20 0.04 280)",
                color: "oklch(0.65 0.12 280)",
                borderRadius: "var(--radius-sm)",
                fontSize: "0.62rem",
              }}
            >
              global
            </span>
          )}
          {persona.prompt ? (
            <span
              style={{
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {persona.prompt.slice(0, 32)}
              {persona.prompt.length > 32 ? "…" : ""}
            </span>
          ) : (
            <span style={{ fontStyle: "italic" }}>no prompt</span>
          )}
        </div>
      </div>

      {/* Delete on hover */}
      {hovered && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            deleteMutation.mutate(persona.id);
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
          title="Delete persona"
        >
          &times;
        </button>
      )}
    </div>
  );
}

function PersonaCreator({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (p: Persona) => void;
}) {
  const [name, setName] = useState("");
  const createMutation = useCreatePersona();

  const handleCreate = useCallback(async () => {
    if (!name.trim()) return;
    const result = await createMutation.mutateAsync({ name: name.trim() });
    onCreate(result.persona);
  }, [name, createMutation, onCreate]);

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
      <div
        style={{
          padding: "0.75rem",
          borderBottom: "1px solid var(--color-border)",
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
        }}
      >
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            color: "var(--color-text-dim)",
            cursor: "pointer",
            fontSize: "0.8rem",
            padding: "0.1rem",
          }}
        >
          ←
        </button>
        <span
          style={{
            fontSize: "0.75rem",
            fontWeight: 400,
            letterSpacing: "0.15em",
            color: "var(--color-text-muted)",
            textTransform: "uppercase",
          }}
        >
          New Persona
        </span>
      </div>

      <div style={{ padding: "0.75rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          <span style={{ fontSize: "0.72rem", color: "var(--color-text-muted)" }}>
            Name
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
              if (e.key === "Escape") onClose();
            }}
            placeholder="Your name"
            autoFocus
            style={{
              padding: "0.4rem 0.5rem",
              background: "var(--color-background)",
              color: "var(--color-text-body)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              fontSize: "0.82rem",
              outline: "none",
            }}
          />
        </label>

        <button
          onClick={handleCreate}
          disabled={!name.trim() || createMutation.isPending}
          style={{
            padding: "0.45rem",
            background: !name.trim() ? "var(--color-surface-raised)" : "var(--color-primary)",
            color: !name.trim() ? "var(--color-text-dim)" : "#fff",
            border: "none",
            borderRadius: "var(--radius-md)",
            cursor: !name.trim() ? "not-allowed" : "pointer",
            fontSize: "0.78rem",
            transition: "all 0.15s",
          }}
        >
          {createMutation.isPending ? "Creating..." : "Create & Edit"}
        </button>
      </div>
    </div>
  );
}

function PersonaEditor({ persona, onClose }: { persona: Persona; onClose: () => void }) {
  const [name, setName] = useState(persona.name);
  const [prompt, setPrompt] = useState(persona.prompt);
  const [isGlobal, setIsGlobal] = useState(persona.is_global);
  const [saved, setSaved] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const updateMutation = useUpdatePersona();
  const avatarMutation = useUploadPersonaAvatar();

  // Subscribe to the live query so the avatar reflects the upload immediately.
  const { data: liveData } = usePersona(persona.id);
  const livePersona = liveData?.persona ?? persona;

  const handleSave = useCallback(async () => {
    if (!name.trim()) return;
    await updateMutation.mutateAsync({
      id: persona.id,
      name: name.trim(),
      prompt,
      is_global: isGlobal,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }, [persona.id, name, prompt, isGlobal, updateMutation]);

  const handleAvatarChange = useCallback(
    async (files: FileList | null) => {
      if (!files?.length) return;
      const file = files[0];
      if (!file) return;
      await avatarMutation.mutateAsync({ id: persona.id, file });
    },
    [persona.id, avatarMutation],
  );

  // Use live data so the avatar updates as soon as the upload query settles.
  const avatarUrl = livePersona.avatar_url
    ? `${livePersona.avatar_url}?t=${livePersona.updated_at}`
    : null;

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
          alignItems: "center",
          gap: "0.5rem",
        }}
      >
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            color: "var(--color-text-dim)",
            cursor: "pointer",
            fontSize: "0.8rem",
            padding: "0.1rem",
          }}
        >
          ←
        </button>
        <span
          style={{
            fontSize: "0.75rem",
            fontWeight: 400,
            letterSpacing: "0.15em",
            color: "var(--color-text-muted)",
            textTransform: "uppercase",
            flex: 1,
          }}
        >
          Edit Persona
        </span>
      </div>

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "0.75rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.85rem",
        }}
      >
        {/* Avatar */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem" }}>
          <div
            onClick={() => fileInputRef.current?.click()}
            style={{
              width: 72,
              height: 72,
              borderRadius: "var(--radius-lg)",
              cursor: "pointer",
              overflow: "hidden",
              background: "var(--color-surface-raised)",
              border: "2px solid var(--color-border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
              transition: "border-color 0.15s",
            }}
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLDivElement).style.borderColor =
                "var(--color-primary)")
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLDivElement).style.borderColor =
                "var(--color-border)")
            }
            title="Click to upload avatar"
          >
            {avatarUrl ? (
              <Avatar
                src={avatarUrl}
                alt={persona.name}
                size="100%"
              />
            ) : (
              <span
                style={{
                  fontSize: "1.5rem",
                  fontWeight: 500,
                  color: "var(--color-text-muted)",
                  fontFamily: "var(--font-display)",
                }}
              >
                {name.charAt(0).toUpperCase() || "?"}
              </span>
            )}
            {avatarMutation.isPending && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "rgba(0,0,0,0.5)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "0.65rem",
                  color: "#fff",
                }}
              >
                Uploading
              </div>
            )}
          </div>
          <span style={{ fontSize: "0.65rem", color: "var(--color-text-dim)" }}>
            Click to change avatar
          </span>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            style={{ display: "none" }}
            onChange={(e) => {
              handleAvatarChange(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {/* Name */}
        <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          <span style={{ fontSize: "0.72rem", color: "var(--color-text-muted)" }}>
            Name
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            style={{
              padding: "0.4rem 0.5rem",
              background: "var(--color-background)",
              color: "var(--color-text-body)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              fontSize: "0.82rem",
              outline: "none",
            }}
          />
        </label>

        {/* Prompt */}
        <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          <span style={{ fontSize: "0.72rem", color: "var(--color-text-muted)" }}>
            Persona Prompt
          </span>
          <span style={{ fontSize: "0.67rem", color: "var(--color-text-dim)", lineHeight: 1.4 }}>
            Injected into the system prompt. Describe yourself, your role, or any context the AI should know.
          </span>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="I am a science fiction writer exploring..."
            rows={5}
            style={{
              padding: "0.4rem 0.5rem",
              background: "var(--color-background)",
              color: "var(--color-text-body)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              fontSize: "0.78rem",
              outline: "none",
              resize: "vertical",
              fontFamily: "var(--font-body)",
              lineHeight: 1.5,
            }}
          />
        </label>

        {/* Global toggle */}
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            cursor: "pointer",
          }}
        >
          <div
            onClick={() => setIsGlobal(!isGlobal)}
            style={{
              width: 32,
              height: 18,
              borderRadius: "999px",
              background: isGlobal ? "var(--color-primary)" : "var(--color-surface-raised)",
              border: "1px solid var(--color-border)",
              position: "relative",
              cursor: "pointer",
              transition: "background 0.2s",
              flexShrink: 0,
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 2,
                left: isGlobal ? 14 : 2,
                width: 12,
                height: 12,
                borderRadius: "50%",
                background: "#fff",
                transition: "left 0.2s",
              }}
            />
          </div>
          <div>
            <div style={{ fontSize: "0.78rem", color: "var(--color-text-body)" }}>
              Global persona
            </div>
            <div style={{ fontSize: "0.67rem", color: "var(--color-text-dim)" }}>
              Use this persona across all chats by default
            </div>
          </div>
        </label>

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={!name.trim() || updateMutation.isPending}
          style={{
            padding: "0.45rem",
            background: saved
              ? "oklch(0.35 0.10 155)"
              : !name.trim()
                ? "var(--color-surface-raised)"
                : "var(--color-primary)",
            color: saved ? "oklch(0.80 0.12 155)" : !name.trim() ? "var(--color-text-dim)" : "#fff",
            border: "none",
            borderRadius: "var(--radius-md)",
            cursor: !name.trim() ? "not-allowed" : "pointer",
            fontSize: "0.78rem",
            transition: "all 0.15s",
          }}
        >
          {updateMutation.isPending ? "Saving..." : saved ? "Saved" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}

/** Reusable avatar display for a persona. */
export function PersonaAvatar({
  persona,
  size = 28,
}: {
  persona: Persona;
  size?: number;
}) {
  const avatarUrl = persona.avatar_url
    ? `${persona.avatar_url}?t=${persona.updated_at}`
    : null;

  if (avatarUrl) {
    return (
      <Avatar
        src={avatarUrl}
        alt={persona.name}
        size={size}
      />
    );
  }

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "var(--radius-md)",
        background: "oklch(0.20 0.04 280)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.38,
        fontWeight: 500,
        color: "oklch(0.65 0.12 280)",
        flexShrink: 0,
        fontFamily: "var(--font-display)",
      }}
    >
      {persona.name.charAt(0).toUpperCase()}
    </div>
  );
}
