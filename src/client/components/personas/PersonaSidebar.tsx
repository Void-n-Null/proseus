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
    <div className="w-[280px] min-w-[280px] h-full flex flex-col bg-surface border-r border-border">
      {/* Header */}
      <div className="p-3 border-b border-border flex items-center justify-between">
        <span className="text-xs font-normal tracking-[0.15em] text-text-muted uppercase">
          Personas
        </span>
        <button
          onClick={() => setCreating(true)}
          disabled={createMutation.isPending}
          className="px-[0.6rem] py-[0.3rem] bg-primary text-white border-none rounded-md cursor-pointer text-[0.72rem]"
          style={{
            /* intentionally dynamic */
            opacity: createMutation.isPending ? 0.5 : 1,
          }}
        >
          + New
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-[0.35rem]">
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-text-dim text-[0.8rem]">
            Loading...
          </div>
        ) : personas.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-text-dim text-center p-4">
            <p className="text-[0.85rem]">No personas yet</p>
            <p className="text-[0.72rem] leading-[1.4]">
              Create a persona to represent yourself in chats.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-[2px]">
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
      className="flex items-center gap-2 p-2 rounded-md cursor-pointer transition-[background] duration-150 relative"
      style={{
        /* intentionally dynamic */
        background: hovered ? "var(--color-surface-hover)" : "transparent",
      }}
      onClick={onEdit}
    >
      {/* Avatar */}
      <PersonaAvatar persona={persona} size={36} />

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="text-[0.8rem] font-normal text-text-body whitespace-nowrap overflow-hidden text-ellipsis">
          {persona.name}
        </div>
        <div className="text-[0.68rem] text-text-dim flex gap-[0.35rem] items-center">
          {persona.is_global && (
            <span className="px-[0.3rem] py-0 bg-[oklch(0.20_0.04_280)] text-[oklch(0.65_0.12_280)] rounded-sm text-[0.62rem]">
              global
            </span>
          )}
          {persona.prompt ? (
            <span className="whitespace-nowrap overflow-hidden text-ellipsis">
              {persona.prompt.slice(0, 32)}
              {persona.prompt.length > 32 ? "…" : ""}
            </span>
          ) : (
            <span className="italic">no prompt</span>
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
          className="absolute top-[0.35rem] right-[0.35rem] w-[18px] h-[18px] p-0 bg-none border-none cursor-pointer text-text-dim text-[0.7rem] flex items-center justify-center rounded-sm transition-[color] duration-150"
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
    <div className="w-[280px] min-w-[280px] h-full flex flex-col bg-surface border-r border-border">
      <div className="p-3 border-b border-border flex items-center gap-2">
        <button
          onClick={onClose}
          className="bg-none border-none text-text-dim cursor-pointer text-[0.8rem] p-[0.1rem]"
        >
          ←
        </button>
        <span className="text-xs font-normal tracking-[0.15em] text-text-muted uppercase">
          New Persona
        </span>
      </div>

      <div className="p-3 flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[0.72rem] text-text-muted">
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
            className="px-2 py-[0.4rem] bg-background text-text-body border border-border rounded-md text-[0.82rem] outline-none"
          />
        </label>

        <button
          onClick={handleCreate}
          disabled={!name.trim() || createMutation.isPending}
          className="py-[0.45rem] border-none rounded-md text-[0.78rem] transition-all duration-150"
          style={{
            /* intentionally dynamic */
            background: !name.trim() ? "var(--color-surface-raised)" : "var(--color-primary)",
            color: !name.trim() ? "var(--color-text-dim)" : "#fff",
            cursor: !name.trim() ? "not-allowed" : "pointer",
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
    <div className="w-[280px] min-w-[280px] h-full flex flex-col bg-surface border-r border-border">
      {/* Header */}
      <div className="p-3 border-b border-border flex items-center gap-2">
        <button
          onClick={onClose}
          className="bg-none border-none text-text-dim cursor-pointer text-[0.8rem] p-[0.1rem]"
        >
          ←
        </button>
        <span className="text-xs font-normal tracking-[0.15em] text-text-muted uppercase flex-1">
          Edit Persona
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-[0.85rem]">
        {/* Avatar */}
        <div className="flex flex-col items-center gap-2">
          <div
            onClick={() => fileInputRef.current?.click()}
            className="w-[72px] h-[72px] rounded-lg cursor-pointer overflow-hidden bg-surface-raised border-2 border-border flex items-center justify-center relative transition-[border-color] duration-150"
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
              <span className="text-2xl font-medium text-text-muted font-[var(--font-display)]">
                {name.charAt(0).toUpperCase() || "?"}
              </span>
            )}
            {avatarMutation.isPending && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-[0.65rem] text-white">
                Uploading
              </div>
            )}
          </div>
          <span className="text-[0.65rem] text-text-dim">
            Click to change avatar
          </span>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              handleAvatarChange(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {/* Name */}
        <label className="flex flex-col gap-1">
          <span className="text-[0.72rem] text-text-muted">
            Name
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className="px-2 py-[0.4rem] bg-background text-text-body border border-border rounded-md text-[0.82rem] outline-none"
          />
        </label>

        {/* Prompt */}
        <label className="flex flex-col gap-1">
          <span className="text-[0.72rem] text-text-muted">
            Persona Prompt
          </span>
          <span className="text-[0.67rem] text-text-dim leading-[1.4]">
            Injected into the system prompt. Describe yourself, your role, or any context the AI should know.
          </span>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="I am a science fiction writer exploring..."
            rows={5}
            className="px-2 py-[0.4rem] bg-background text-text-body border border-border rounded-md text-[0.78rem] outline-none resize-y font-[var(--font-body)] leading-[1.5]"
          />
        </label>

        {/* Global toggle */}
        <label className="flex items-center gap-2 cursor-pointer">
          <div
            onClick={() => setIsGlobal(!isGlobal)}
            className="w-8 h-[18px] rounded-full border border-border relative cursor-pointer transition-[background] duration-200 shrink-0"
            style={{
              /* intentionally dynamic */
              background: isGlobal ? "var(--color-primary)" : "var(--color-surface-raised)",
            }}
          >
            <div
              className="absolute top-[2px] w-3 h-3 rounded-full bg-white transition-[left] duration-200"
              style={{
                /* intentionally dynamic */
                left: isGlobal ? 14 : 2,
              }}
            />
          </div>
          <div>
            <div className="text-[0.78rem] text-text-body">
              Global persona
            </div>
            <div className="text-[0.67rem] text-text-dim">
              Use this persona across all chats by default
            </div>
          </div>
        </label>

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={!name.trim() || updateMutation.isPending}
          className="py-[0.45rem] border-none rounded-md text-[0.78rem] transition-all duration-150"
          style={{
            /* intentionally dynamic */
            background: saved
              ? "oklch(0.35 0.10 155)"
              : !name.trim()
                ? "var(--color-surface-raised)"
                : "var(--color-primary)",
            color: saved ? "oklch(0.80 0.12 155)" : !name.trim() ? "var(--color-text-dim)" : "#fff",
            cursor: !name.trim() ? "not-allowed" : "pointer",
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
      className="rounded-md bg-[oklch(0.20_0.04_280)] flex items-center justify-center font-medium text-[oklch(0.65_0.12_280)] shrink-0 font-[var(--font-display)]"
      style={{
        /* intentionally dynamic — size comes from prop */
        width: size,
        height: size,
        fontSize: size * 0.38,
      }}
    >
      {persona.name.charAt(0).toUpperCase()}
    </div>
  );
}
