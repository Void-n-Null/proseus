import React, {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
} from "react";
import type { Character } from "../../../shared/types.ts";
import {
  useCreateCharacter,
  useUpdateCharacter,
  useUploadCharacterAvatar,
  useCharacter,
} from "../../hooks/useCharacters.ts";

interface CharacterEditorProps {
  character: Character | null;
  onClose: () => void;
  onCreate?: (character: Character) => void;
}

function tok(text: string): number {
  return Math.ceil(text.length / 4);
}

interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

async function applyCrop(file: File, crop: CropRect): Promise<File> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(crop.w);
      canvas.height = Math.round(crop.h);
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas not supported"));
      ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error("Canvas export failed"));
          resolve(new File([blob], "avatar.png", { type: "image/png" }));
        },
        "image/png",
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Failed to load image")); };
    img.src = url;
  });
}

export default function CharacterEditor({
  character,
  onClose,
  onCreate,
}: CharacterEditorProps) {
  const isNew = character === null;
  const { data: liveData } = useCharacter(character?.id ?? null);
  const live = liveData?.character ?? character;

  const [name, setName] = useState(live?.name ?? "");
  const [description, setDescription] = useState(live?.description ?? "");
  const [personality, setPersonality] = useState(live?.personality ?? "");
  const [scenario, setScenario] = useState(live?.scenario ?? "");
  const [firstMes, setFirstMes] = useState(live?.first_mes ?? "");
  const [mesExample, setMesExample] = useState(live?.mes_example ?? "");
  const [alternateGreetings, setAlternateGreetings] = useState<string[]>(
    live?.alternate_greetings ?? [],
  );
  const [systemPrompt, setSystemPrompt] = useState(live?.system_prompt ?? "");
  const [postHistory, setPostHistory] = useState(
    live?.post_history_instructions ?? "",
  );
  const [creatorNotes, setCreatorNotes] = useState(live?.creator_notes ?? "");
  const [tags, setTags] = useState((live?.tags ?? []).join(", "));
  const [creator, setCreator] = useState(live?.creator ?? "");
  const [characterVersion, setCharacterVersion] = useState(
    live?.character_version ?? "",
  );

  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [metadataOpen, setMetadataOpen] = useState(false);

  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [pendingCropFile, setPendingCropFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createMutation = useCreateCharacter();
  const updateMutation = useUpdateCharacter();
  const avatarMutation = useUploadCharacterAvatar();

  const currentAvatarUrl = live?.avatar_url
    ? `${live.avatar_url}?t=${live.updated_at}`
    : null;

  useEffect(() => {
    return () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    };
  }, [avatarPreview]);

  const handleAvatarSelect = useCallback((files: FileList | null) => {
    if (!files?.length) return;
    const raw = files[0];
    if (!raw) return;
    setPendingCropFile(raw);
  }, []);

  const handleCropConfirm = useCallback(
    async (file: File, crop: CropRect) => {
      const cropped = await applyCrop(file, crop);
      setPendingAvatarFile(cropped);
      const preview = URL.createObjectURL(cropped);
      setAvatarPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return preview;
      });
      setPendingCropFile(null);
    },
    [],
  );

  const parsedTags = tags
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  const totalTokens =
    tok(name) +
    tok(description) +
    tok(personality) +
    tok(scenario) +
    tok(firstMes) +
    tok(mesExample) +
    alternateGreetings.reduce((s, g) => s + tok(g), 0) +
    tok(systemPrompt) +
    tok(postHistory);

  const handleSave = useCallback(async () => {
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    setError(null);
    setSaving(true);

    try {
      const fields = {
        name: name.trim(),
        description,
        personality,
        scenario,
        first_mes: firstMes,
        mes_example: mesExample,
        alternate_greetings: alternateGreetings,
        system_prompt: systemPrompt,
        post_history_instructions: postHistory,
        creator_notes: creatorNotes,
        tags: parsedTags,
        creator,
        character_version: characterVersion,
      };

      let savedCharacter: Character;

      if (isNew) {
        const result = await createMutation.mutateAsync(fields);
        savedCharacter = result.character;
      } else {
        const result = await updateMutation.mutateAsync({
          id: character.id,
          ...fields,
        });
        savedCharacter = result.character;
      }

      if (pendingAvatarFile) {
        const avatarResult = await avatarMutation.mutateAsync({
          id: savedCharacter.id,
          file: pendingAvatarFile,
        });
        savedCharacter = avatarResult.character;
        setPendingAvatarFile(null);
        setAvatarPreview(null);
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 1500);

      if (isNew && onCreate) {
        onCreate(savedCharacter);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }, [
    name,
    description,
    personality,
    scenario,
    firstMes,
    mesExample,
    alternateGreetings,
    systemPrompt,
    postHistory,
    creatorNotes,
    parsedTags,
    creator,
    characterVersion,
    isNew,
    character,
    createMutation,
    updateMutation,
    avatarMutation,
    pendingAvatarFile,
    onCreate,
  ]);

  const handleAddGreeting = useCallback(() => {
    setAlternateGreetings((prev) => [...prev, ""]);
  }, []);

  const handleGreetingChange = useCallback((index: number, value: string) => {
    setAlternateGreetings((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }, []);

  const handleRemoveGreeting = useCallback((index: number) => {
    setAlternateGreetings((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const displayedAvatar = avatarPreview ?? currentAvatarUrl;

  return (
    <>
      {pendingCropFile && (
        <CropModal
          file={pendingCropFile}
          onConfirm={(crop) => handleCropConfirm(pendingCropFile, crop)}
          onCancel={() => setPendingCropFile(null)}
        />
      )}
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-[oklch(0_0_0_/_0.65)] backdrop-blur-[2px]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-[min(720px,96vw)] max-h-[88vh] flex flex-col bg-surface border border-border rounded-lg overflow-hidden shadow-[0_24px_64px_oklch(0_0_0_/_0.5)]"
        onClick={(e) => e.stopPropagation()}
      >
        <Header
          title={isNew ? "New Character" : (live?.name ?? "Edit Character")}
          onClose={onClose}
          onSave={handleSave}
          saving={saving}
          saved={saved}
          nameValid={name.trim().length > 0}
          totalTokens={totalTokens}
        />

        <div className="flex-1 overflow-y-auto p-[1.25rem] flex flex-col gap-[1.25rem]">
          {error && (
            <div className="px-3 py-2 rounded-md bg-[oklch(0.22_0.08_25)] text-[oklch(0.80_0.10_25)] text-[0.78rem]">
              {error}
            </div>
          )}

          <AvatarNameRow
            avatarUrl={displayedAvatar}
            name={name}
            onNameChange={setName}
            onAvatarClick={() => fileInputRef.current?.click()}
            uploading={avatarMutation.isPending}
            charInitial={name.charAt(0).toUpperCase() || "?"}
          />

          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              handleAvatarSelect(e.target.files);
              e.target.value = "";
            }}
          />

          <Field
            label="Description"
            hint="Physical traits, backstory, personality details. This is the main character prompt."
            value={description}
            onChange={setDescription}
            rows={8}
            placeholder="Describe your character's physical and mental traits here."
          />

          <Field
            label="Personality"
            hint="A short summary: brave, sarcastic, timid, etc."
            value={personality}
            onChange={setPersonality}
            rows={3}
            placeholder="(A brief description of the personality)"
          />

          <Field
            label="Scenario"
            hint="Sets the scene. Where are you? What's the context?"
            value={scenario}
            onChange={setScenario}
            rows={3}
            placeholder="(Circumstances and context of the interaction)"
          />

          <Field
            label="First Message"
            hint="What the character says to open every new chat."
            value={firstMes}
            onChange={setFirstMes}
            rows={6}
            placeholder="This will be the first message from the character that starts every chat."
          />

          <Field
            label="Examples of Dialogue"
            hint="Show the model the character's writing style. Begin each example with <START> on a new line."
            value={mesExample}
            onChange={setMesExample}
            rows={5}
            placeholder="<START>&#10;{{user}}: Hello.&#10;{{char}}: ..."
          />

          <AlternateGreetings
            greetings={alternateGreetings}
            onAdd={handleAddGreeting}
            onChange={handleGreetingChange}
            onRemove={handleRemoveGreeting}
          />

          <CollapsibleSection
            label="Advanced"
            open={advancedOpen}
            onToggle={() => setAdvancedOpen((v) => !v)}
          >
            <Field
              label="System Prompt Override"
              hint="Replaces the default system prompt for this character. Insert {{original}} to include the default."
              value={systemPrompt}
              onChange={setSystemPrompt}
              rows={4}
              placeholder="Any contents here will replace the default Main Prompt used for this character."
            />
            <Field
              label="Post-History Instructions"
              hint="Injected after the conversation history. Good for persistent reminders to the model."
              value={postHistory}
              onChange={setPostHistory}
              rows={4}
              placeholder="Any contents here will replace the default Post-History Instructions."
            />
          </CollapsibleSection>

          <CollapsibleSection
            label="Metadata"
            open={metadataOpen}
            onToggle={() => setMetadataOpen((v) => !v)}
          >
            <Field
              label="Creator Notes"
              hint="Usage tips, recommended models, warnings. Not sent to the AI."
              value={creatorNotes}
              onChange={setCreatorNotes}
              rows={3}
              placeholder="(Describe the bot, give use tips, or list the chat models it has been tested on.)"
              noTokens
            />
            <div className="flex gap-3">
              <SimpleField
                label="Tags"
                value={tags}
                onChange={setTags}
                placeholder="fantasy, female, elf, romance"
                flex={2}
              />
              <SimpleField
                label="Creator"
                value={creator}
                onChange={setCreator}
                placeholder="your handle"
                flex={1}
              />
              <SimpleField
                label="Version"
                value={characterVersion}
                onChange={setCharacterVersion}
                placeholder="1.0"
                flex={1}
              />
            </div>
          </CollapsibleSection>
        </div>
      </div>
    </div>
    </>
  );
}

function Header({
  title,
  onClose,
  onSave,
  saving,
  saved,
  nameValid,
  totalTokens,
}: {
  title: string;
  onClose: () => void;
  onSave: () => void;
  saving: boolean;
  saved: boolean;
  nameValid: boolean;
  totalTokens: number;
}) {
  return (
    <div className="px-[1.25rem] py-[0.85rem] border-b border-border flex items-center gap-3 shrink-0">
      <button
        onClick={onClose}
        className="bg-transparent border-none text-text-dim cursor-pointer text-[1rem] px-[0.25rem] py-[0.1rem] leading-none"
        title="Close"
      >
        ←
      </button>

      <span className="flex-1 text-[0.85rem] font-medium text-text-body overflow-hidden text-ellipsis whitespace-nowrap">
        {title}
      </span>

      <span className="text-[0.7rem] text-text-dim whitespace-nowrap">
        ~{totalTokens.toLocaleString()} tok total
      </span>

      <button
        onClick={onSave}
        disabled={!nameValid || saving}
        className="px-[0.9rem] py-[0.4rem] border-none rounded-md text-[0.78rem] font-medium transition-all duration-150 whitespace-nowrap"
        style={{
          /* intentionally dynamic — depends on saved/nameValid state */
          background: saved
            ? "oklch(0.35 0.10 155)"
            : !nameValid
              ? "var(--color-surface-raised)"
              : "var(--color-primary)",
          color: saved
            ? "oklch(0.80 0.12 155)"
            : !nameValid
              ? "var(--color-text-dim)"
              : "#fff",
          cursor: !nameValid || saving ? "not-allowed" : "pointer",
          opacity: saving ? 0.7 : 1,
        }}
      >
        {saving ? "Saving..." : saved ? "Saved ✓" : "Save"}
      </button>
    </div>
  );
}

function AvatarNameRow({
  avatarUrl,
  name,
  onNameChange,
  onAvatarClick,
  uploading,
  charInitial,
}: {
  avatarUrl: string | null;
  name: string;
  onNameChange: (v: string) => void;
  onAvatarClick: () => void;
  uploading: boolean;
  charInitial: string;
}) {
  return (
    <div className="flex items-center gap-4">
      <div
        onClick={onAvatarClick}
        className="w-[80px] h-[80px] rounded-lg shrink-0 cursor-pointer overflow-hidden bg-surface-raised border-2 border-border flex items-center justify-center relative transition-[border-color] duration-150"
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
          <img
            src={avatarUrl}
            alt="avatar"
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-[2rem] font-medium text-text-muted font-[var(--font-display)]">
            {charInitial}
          </span>
        )}
        {uploading && (
          <div className="absolute inset-0 bg-[oklch(0_0_0_/_0.5)] flex items-center justify-center text-[0.65rem] text-white">
            Uploading
          </div>
        )}
        <div
          className="avatar-edit-label absolute bottom-0 left-0 right-0 p-[0.2rem] bg-[oklch(0_0_0_/_0.5)] text-[0.6rem] text-[oklch(0.85_0_0)] text-center opacity-0 transition-opacity duration-150"
        >
          Edit
        </div>
      </div>

      <div className="flex-1">
        <label className="flex flex-col gap-1">
          <span className="text-[0.72rem] text-text-muted">
            Name <span className="text-[oklch(0.65_0.15_25)]">*</span>
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="Character name"
            autoFocus
            className="px-[0.65rem] py-2 bg-background text-text-body border border-border rounded-md text-[1rem] font-normal outline-none w-full box-border font-[var(--font-display)]"
            onFocus={(e) =>
              ((e.currentTarget as HTMLInputElement).style.borderColor =
                "var(--color-primary)")
            }
            onBlur={(e) =>
              ((e.currentTarget as HTMLInputElement).style.borderColor =
                "var(--color-border)")
            }
          />
        </label>
        <div className="mt-[0.3rem] text-[0.67rem] text-text-dim">
          ~{tok(name)} tok
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  value,
  onChange,
  rows,
  placeholder,
  noTokens,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  rows: number;
  placeholder?: string;
  noTokens?: boolean;
}) {
  return (
    <div className="flex flex-col gap-[0.3rem]">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[0.75rem] font-medium text-text-muted">
          {label}
        </span>
        {!noTokens && (
          <span className="text-[0.67rem] text-text-dim">
            ~{tok(value)} tok
          </span>
        )}
      </div>
      {hint && (
        <span className="text-[0.67rem] text-text-dim leading-[1.4]">
          {hint}
        </span>
      )}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className="px-[0.65rem] py-2 bg-background text-text-body border border-border rounded-md text-[0.82rem] font-[var(--font-body)] leading-[1.55] resize-y outline-none w-full box-border"
        onFocus={(e) =>
          ((e.currentTarget as HTMLTextAreaElement).style.borderColor =
            "var(--color-primary)")
        }
        onBlur={(e) =>
          ((e.currentTarget as HTMLTextAreaElement).style.borderColor =
            "var(--color-border)")
        }
      />
    </div>
  );
}

function SimpleField({
  label,
  value,
  onChange,
  placeholder,
  flex,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  flex?: number;
}) {
  return (
    <label
      className="flex flex-col gap-1"
      style={{
        /* intentionally dynamic — flex value from prop */
        flex: flex ?? 1,
      }}
    >
      <span className="text-[0.72rem] text-text-muted">
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="px-[0.5rem] py-[0.4rem] bg-background text-text-body border border-border rounded-md text-[0.78rem] outline-none w-full box-border"
        onFocus={(e) =>
          ((e.currentTarget as HTMLInputElement).style.borderColor =
            "var(--color-primary)")
        }
        onBlur={(e) =>
          ((e.currentTarget as HTMLInputElement).style.borderColor =
            "var(--color-border)")
        }
      />
    </label>
  );
}

function AlternateGreetings({
  greetings,
  onAdd,
  onChange,
  onRemove,
}: {
  greetings: string[];
  onAdd: () => void;
  onChange: (index: number, value: string) => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[0.75rem] font-medium text-text-muted">
          Alternate Greetings
        </span>
        <button
          onClick={onAdd}
          className="px-2 py-[0.2rem] bg-surface-raised text-text-muted border border-border rounded-sm cursor-pointer text-[0.7rem] transition-[background] duration-150"
          onMouseEnter={(e) =>
            ((e.currentTarget as HTMLButtonElement).style.background =
              "var(--color-surface-hover)")
          }
          onMouseLeave={(e) =>
            ((e.currentTarget as HTMLButtonElement).style.background =
              "var(--color-surface-raised)")
          }
        >
          + Add
        </button>
      </div>

      {greetings.length === 0 ? (
        <div className="p-2 rounded-md border border-dashed border-border text-[0.72rem] text-text-dim text-center">
          No alternate greetings. Click + Add to give users different opening
          scenes.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {greetings.map((g, i) => (
            <div key={i} className="flex gap-[0.4rem] items-start">
              <div className="flex flex-col gap-[0.2rem] flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-[0.67rem] text-text-dim">
                    #{i + 1}
                  </span>
                  <span className="text-[0.67rem] text-text-dim">
                    ~{tok(g)} tok
                  </span>
                </div>
                <textarea
                  value={g}
                  onChange={(e) => onChange(i, e.target.value)}
                  rows={4}
                  placeholder="Alternative opening message..."
                  className="px-[0.65rem] py-2 bg-background text-text-body border border-border rounded-md text-[0.82rem] font-[var(--font-body)] leading-[1.55] resize-y outline-none w-full box-border"
                  onFocus={(e) =>
                    ((e.currentTarget as HTMLTextAreaElement).style.borderColor =
                      "var(--color-primary)")
                  }
                  onBlur={(e) =>
                    ((e.currentTarget as HTMLTextAreaElement).style.borderColor =
                      "var(--color-border)")
                  }
                />
              </div>
              <button
                onClick={() => onRemove(i)}
                className="mt-[1.2rem] w-[22px] h-[22px] shrink-0 p-0 bg-transparent border-none cursor-pointer text-text-dim text-[0.8rem] flex items-center justify-center rounded-sm transition-[color] duration-150"
                onMouseEnter={(e) =>
                  ((e.currentTarget as HTMLButtonElement).style.color =
                    "var(--color-destructive)")
                }
                onMouseLeave={(e) =>
                  ((e.currentTarget as HTMLButtonElement).style.color =
                    "var(--color-text-dim)")
                }
                title="Remove this greeting"
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CollapsibleSection({
  label,
  open,
  onToggle,
  children,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-border rounded-md overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full px-[0.85rem] py-[0.6rem] border-none cursor-pointer flex items-center justify-between gap-2 transition-[background] duration-150"
        style={{
          /* intentionally dynamic — depends on open state */
          background: open
            ? "var(--color-surface-raised)"
            : "var(--color-surface)",
        }}
        onMouseEnter={(e) =>
          ((e.currentTarget as HTMLButtonElement).style.background =
            "var(--color-surface-hover)")
        }
        onMouseLeave={(e) =>
          ((e.currentTarget as HTMLButtonElement).style.background = open
            ? "var(--color-surface-raised)"
            : "var(--color-surface)")
        }
      >
        <span className="text-[0.75rem] font-medium text-text-muted tracking-[0.05em]">
          {label}
        </span>
        <span
          className="text-[0.7rem] text-text-dim transition-transform duration-200 inline-block"
          style={{
            /* intentionally dynamic — depends on open state */
            transform: open ? "rotate(180deg)" : "none",
          }}
        >
          ▾
        </span>
      </button>
      {open && (
        <div className="p-[0.85rem] flex flex-col gap-[0.85rem] border-t border-border">
          {children}
        </div>
      )}
    </div>
  );
}

const MAX_CROP_W = 600;
const MAX_CROP_H = 480;
const HANDLE_HIT = 14;
const HANDLE_VIS = 8;
const MIN_CROP = 20;

type DragMode = "new" | "move" | "nw" | "ne" | "sw" | "se";

interface DragState {
  mode: DragMode;
  startX: number;
  startY: number;
  startCrop: CropRect;
}

function getCursorForMode(mode: DragMode | null, fallback: string): string {
  if (!mode) return fallback;
  if (mode === "move") return "move";
  if (mode === "nw" || mode === "se") return "nw-resize";
  if (mode === "ne" || mode === "sw") return "ne-resize";
  return "crosshair";
}

function getHoverMode(x: number, y: number, crop: CropRect): DragMode {
  const { x: cx, y: cy, w: cw, h: ch } = crop;
  const h = HANDLE_HIT;
  if (Math.abs(x - cx) <= h && Math.abs(y - cy) <= h) return "nw";
  if (Math.abs(x - (cx + cw)) <= h && Math.abs(y - cy) <= h) return "ne";
  if (Math.abs(x - cx) <= h && Math.abs(y - (cy + ch)) <= h) return "sw";
  if (Math.abs(x - (cx + cw)) <= h && Math.abs(y - (cy + ch)) <= h) return "se";
  if (x >= cx && x <= cx + cw && y >= cy && y <= cy + ch) return "move";
  return "new";
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function computeNewCrop(drag: DragState, mx: number, my: number, dw: number, dh: number): CropRect {
  const dx = mx - drag.startX;
  const dy = my - drag.startY;
  const s = drag.startCrop;

  if (drag.mode === "new") {
    const x = clamp(Math.min(drag.startX, mx), 0, dw - MIN_CROP);
    const y = clamp(Math.min(drag.startY, my), 0, dh - MIN_CROP);
    return { x, y, w: clamp(Math.abs(mx - drag.startX), MIN_CROP, dw - x), h: clamp(Math.abs(my - drag.startY), MIN_CROP, dh - y) };
  }

  if (drag.mode === "move") {
    return { x: clamp(s.x + dx, 0, dw - s.w), y: clamp(s.y + dy, 0, dh - s.h), w: s.w, h: s.h };
  }

  if (drag.mode === "nw") {
    const nx = clamp(s.x + dx, 0, s.x + s.w - MIN_CROP);
    const ny = clamp(s.y + dy, 0, s.y + s.h - MIN_CROP);
    return { x: nx, y: ny, w: s.x + s.w - nx, h: s.y + s.h - ny };
  }

  if (drag.mode === "ne") {
    const ny = clamp(s.y + dy, 0, s.y + s.h - MIN_CROP);
    return { x: s.x, y: ny, w: clamp(s.w + dx, MIN_CROP, dw - s.x), h: s.y + s.h - ny };
  }

  if (drag.mode === "sw") {
    const nx = clamp(s.x + dx, 0, s.x + s.w - MIN_CROP);
    return { x: nx, y: s.y, w: s.x + s.w - nx, h: clamp(s.h + dy, MIN_CROP, dh - s.y) };
  }

  return { x: s.x, y: s.y, w: clamp(s.w + dx, MIN_CROP, dw - s.x), h: clamp(s.h + dy, MIN_CROP, dh - s.y) };
}

function CropModal({
  file,
  onConfirm,
  onCancel,
}: {
  file: File;
  onConfirm: (crop: CropRect) => void;
  onCancel: () => void;
}) {
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [displaySize, setDisplaySize] = useState<{ w: number; h: number } | null>(null);
  const [crop, setCrop] = useState<CropRect | null>(null);
  const [cursor, setCursor] = useState("crosshair");
  const dragRef = useRef<DragState | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setImgSrc(url);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, MAX_CROP_W / img.naturalWidth, MAX_CROP_H / img.naturalHeight);
      const dw = Math.round(img.naturalWidth * scale);
      const dh = Math.round(img.naturalHeight * scale);
      setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
      setDisplaySize({ w: dw, h: dh });
      setCrop({ x: Math.round(dw * 0.05), y: Math.round(dh * 0.05), w: Math.round(dw * 0.9), h: Math.round(dh * 0.9) });
    };
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const getRelativePos = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!crop || !displaySize) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const { x, y } = getRelativePos(e);
    const mode = getHoverMode(x, y, crop);
    dragRef.current = { mode, startX: x, startY: y, startCrop: { ...crop } };
    setCursor(getCursorForMode(mode, "crosshair"));
  }, [crop, displaySize, getRelativePos]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!displaySize || !crop) return;
    const { x, y } = getRelativePos(e);
    if (!dragRef.current) {
      setCursor(getCursorForMode(getHoverMode(x, y, crop), "crosshair"));
      return;
    }
    setCrop(computeNewCrop(dragRef.current, x, y, displaySize.w, displaySize.h));
  }, [displaySize, crop, getRelativePos]);

  const handlePointerUp = useCallback(() => { dragRef.current = null; }, []);

  const handleConfirm = useCallback(() => {
    if (!crop || !displaySize || !naturalSize) return;
    const scale = displaySize.w / naturalSize.w;
    onConfirm({ x: crop.x / scale, y: crop.y / scale, w: crop.w / scale, h: crop.h / scale });
  }, [crop, displaySize, naturalSize, onConfirm]);

  const cropDimLabel = useMemo(() => {
    if (!crop || !naturalSize || !displaySize) return null;
    const scale = displaySize.w / naturalSize.w;
    return `${Math.round(crop.w / scale)} × ${Math.round(crop.h / scale)} px`;
  }, [crop, naturalSize, displaySize]);

  return (
    <div
      className="fixed inset-0 z-[210] flex items-center justify-center bg-[oklch(0_0_0_/_0.75)]"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        className="flex flex-col items-center gap-[0.85rem] p-[1.25rem] bg-surface border border-border rounded-lg shadow-[0_24px_64px_oklch(0_0_0_/_0.6)] max-w-[92vw]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between w-full gap-4">
          <span className="text-[0.82rem] font-medium text-text-body">Crop Avatar</span>
          <span className="text-[0.72rem] text-text-dim">{cropDimLabel ?? "Loading…"}</span>
        </div>

        {!displaySize || !imgSrc ? (
          <div className="w-[200px] h-[120px] flex items-center justify-center text-text-dim text-[0.8rem]">
            Loading image…
          </div>
        ) : (
          <div
            className="relative shrink-0 select-none"
            style={{
              /* intentionally dynamic — computed from image dimensions */
              width: displaySize.w,
              height: displaySize.h,
            }}
          >
            <img
              src={imgSrc}
              alt="crop source"
              className="absolute inset-0 w-full h-full block object-fill pointer-events-none"
              draggable={false}
            />
            {crop && (
              <svg
                className="absolute inset-0 w-full h-full pointer-events-none overflow-visible"
                viewBox={`0 0 ${displaySize.w} ${displaySize.h}`}
              >
                <path
                  fillRule="evenodd"
                  d={`M0,0 H${displaySize.w} V${displaySize.h} H0 Z M${crop.x},${crop.y} H${crop.x + crop.w} V${crop.y + crop.h} H${crop.x} Z`}
                  fill="oklch(0 0 0 / 0.55)"
                />
                <rect x={crop.x} y={crop.y} width={crop.w} height={crop.h} fill="none" stroke="white" strokeWidth="1" />
                {([
                  [crop.x, crop.y], [crop.x + crop.w, crop.y],
                  [crop.x, crop.y + crop.h], [crop.x + crop.w, crop.y + crop.h],
                ] as [number, number][]).map(([hx, hy], i) => (
                  <rect key={i} x={hx - HANDLE_VIS / 2} y={hy - HANDLE_VIS / 2} width={HANDLE_VIS} height={HANDLE_VIS} fill="white" stroke="oklch(0 0 0 / 0.4)" strokeWidth="1" />
                ))}
              </svg>
            )}
            <div
              className="absolute inset-0"
              style={{
                /* intentionally dynamic — cursor changes based on drag mode */
                cursor,
              }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
            />
          </div>
        )}

        <div className="flex gap-2 self-end">
          <button
            onClick={onCancel}
            className="px-[0.85rem] py-[0.4rem] bg-surface-raised text-text-muted border border-border rounded-md cursor-pointer text-[0.78rem]"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!crop || !displaySize}
            className="px-[0.85rem] py-[0.4rem] bg-primary text-white border-none rounded-md cursor-pointer text-[0.78rem] font-medium"
            style={{
              /* intentionally dynamic — depends on crop state */
              opacity: !crop ? 0.5 : 1,
            }}
          >
            Crop & Use
          </button>
        </div>
      </div>
    </div>
  );
}
