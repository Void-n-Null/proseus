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
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "oklch(0 0 0 / 0.65)",
        backdropFilter: "blur(2px)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: "min(720px, 96vw)",
          maxHeight: "88vh",
          display: "flex",
          flexDirection: "column",
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-lg)",
          overflow: "hidden",
          boxShadow: "0 24px 64px oklch(0 0 0 / 0.5)",
        }}
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

        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "1.25rem",
            display: "flex",
            flexDirection: "column",
            gap: "1.25rem",
          }}
        >
          {error && (
            <div
              style={{
                padding: "0.5rem 0.75rem",
                borderRadius: "var(--radius-md)",
                background: "oklch(0.22 0.08 25)",
                color: "oklch(0.80 0.10 25)",
                fontSize: "0.78rem",
              }}
            >
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
            style={{ display: "none" }}
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
            <div style={{ display: "flex", gap: "0.75rem" }}>
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
    <div
      style={{
        padding: "0.85rem 1.25rem",
        borderBottom: "1px solid var(--color-border)",
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        flexShrink: 0,
      }}
    >
      <button
        onClick={onClose}
        style={{
          background: "none",
          border: "none",
          color: "var(--color-text-dim)",
          cursor: "pointer",
          fontSize: "1rem",
          padding: "0.1rem 0.25rem",
          lineHeight: 1,
        }}
        title="Close"
      >
        ←
      </button>

      <span
        style={{
          flex: 1,
          fontSize: "0.85rem",
          fontWeight: 500,
          color: "var(--color-text-body)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {title}
      </span>

      <span
        style={{
          fontSize: "0.7rem",
          color: "var(--color-text-dim)",
          whiteSpace: "nowrap",
        }}
      >
        ~{totalTokens.toLocaleString()} tok total
      </span>

      <button
        onClick={onSave}
        disabled={!nameValid || saving}
        style={{
          padding: "0.4rem 0.9rem",
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
          border: "none",
          borderRadius: "var(--radius-md)",
          cursor: !nameValid || saving ? "not-allowed" : "pointer",
          fontSize: "0.78rem",
          fontWeight: 500,
          transition: "all 0.15s",
          whiteSpace: "nowrap",
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
    <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
      <div
        onClick={onAvatarClick}
        style={{
          width: 80,
          height: 80,
          borderRadius: "var(--radius-lg)",
          flexShrink: 0,
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
          <img
            src={avatarUrl}
            alt="avatar"
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <span
            style={{
              fontSize: "2rem",
              fontWeight: 500,
              color: "var(--color-text-muted)",
              fontFamily: "var(--font-display)",
            }}
          >
            {charInitial}
          </span>
        )}
        {uploading && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "oklch(0 0 0 / 0.5)",
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
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            padding: "0.2rem",
            background: "oklch(0 0 0 / 0.5)",
            fontSize: "0.6rem",
            color: "oklch(0.85 0 0)",
            textAlign: "center",
            opacity: 0,
            transition: "opacity 0.15s",
          }}
          className="avatar-edit-label"
        >
          Edit
        </div>
      </div>

      <div style={{ flex: 1 }}>
        <label
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.25rem",
          }}
        >
          <span
            style={{ fontSize: "0.72rem", color: "var(--color-text-muted)" }}
          >
            Name <span style={{ color: "oklch(0.65 0.15 25)" }}>*</span>
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="Character name"
            autoFocus
            style={{
              padding: "0.5rem 0.65rem",
              background: "var(--color-background)",
              color: "var(--color-text-body)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              fontSize: "1rem",
              fontWeight: 400,
              outline: "none",
              width: "100%",
              boxSizing: "border-box",
              fontFamily: "var(--font-display)",
            }}
          />
        </label>
        <div
          style={{
            marginTop: "0.3rem",
            fontSize: "0.67rem",
            color: "var(--color-text-dim)",
          }}
        >
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
    <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: "0.5rem",
        }}
      >
        <span
          style={{
            fontSize: "0.75rem",
            fontWeight: 500,
            color: "var(--color-text-muted)",
          }}
        >
          {label}
        </span>
        {!noTokens && (
          <span
            style={{ fontSize: "0.67rem", color: "var(--color-text-dim)" }}
          >
            ~{tok(value)} tok
          </span>
        )}
      </div>
      {hint && (
        <span
          style={{
            fontSize: "0.67rem",
            color: "var(--color-text-dim)",
            lineHeight: 1.4,
          }}
        >
          {hint}
        </span>
      )}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        style={{
          padding: "0.5rem 0.65rem",
          background: "var(--color-background)",
          color: "var(--color-text-body)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-md)",
          fontSize: "0.82rem",
          fontFamily: "var(--font-body)",
          lineHeight: 1.55,
          resize: "vertical",
          outline: "none",
          width: "100%",
          boxSizing: "border-box",
        }}
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
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.25rem",
        flex: flex ?? 1,
      }}
    >
      <span style={{ fontSize: "0.72rem", color: "var(--color-text-muted)" }}>
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          padding: "0.4rem 0.5rem",
          background: "var(--color-background)",
          color: "var(--color-text-body)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-md)",
          fontSize: "0.78rem",
          outline: "none",
          width: "100%",
          boxSizing: "border-box",
        }}
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
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
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
            fontWeight: 500,
            color: "var(--color-text-muted)",
          }}
        >
          Alternate Greetings
        </span>
        <button
          onClick={onAdd}
          style={{
            padding: "0.2rem 0.5rem",
            background: "var(--color-surface-raised)",
            color: "var(--color-text-muted)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-sm)",
            cursor: "pointer",
            fontSize: "0.7rem",
            transition: "background 0.15s",
          }}
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
        <div
          style={{
            padding: "0.5rem",
            borderRadius: "var(--radius-md)",
            border: "1px dashed var(--color-border)",
            fontSize: "0.72rem",
            color: "var(--color-text-dim)",
            textAlign: "center",
          }}
        >
          No alternate greetings. Click + Add to give users different opening
          scenes.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {greetings.map((g, i) => (
            <div key={i} style={{ display: "flex", gap: "0.4rem", alignItems: "flex-start" }}>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.2rem",
                  flex: 1,
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
                      fontSize: "0.67rem",
                      color: "var(--color-text-dim)",
                    }}
                  >
                    #{i + 1}
                  </span>
                  <span
                    style={{
                      fontSize: "0.67rem",
                      color: "var(--color-text-dim)",
                    }}
                  >
                    ~{tok(g)} tok
                  </span>
                </div>
                <textarea
                  value={g}
                  onChange={(e) => onChange(i, e.target.value)}
                  rows={4}
                  placeholder="Alternative opening message..."
                  style={{
                    padding: "0.5rem 0.65rem",
                    background: "var(--color-background)",
                    color: "var(--color-text-body)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-md)",
                    fontSize: "0.82rem",
                    fontFamily: "var(--font-body)",
                    lineHeight: 1.55,
                    resize: "vertical",
                    outline: "none",
                    width: "100%",
                    boxSizing: "border-box",
                  }}
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
                style={{
                  marginTop: "1.2rem",
                  width: 22,
                  height: 22,
                  flexShrink: 0,
                  padding: 0,
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--color-text-dim)",
                  fontSize: "0.8rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "var(--radius-sm)",
                  transition: "color 0.15s",
                }}
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
    <div
      style={{
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-md)",
        overflow: "hidden",
      }}
    >
      <button
        onClick={onToggle}
        style={{
          width: "100%",
          padding: "0.6rem 0.85rem",
          background: open
            ? "var(--color-surface-raised)"
            : "var(--color-surface)",
          border: "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.5rem",
          transition: "background 0.15s",
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
        <span
          style={{
            fontSize: "0.75rem",
            fontWeight: 500,
            color: "var(--color-text-muted)",
            letterSpacing: "0.05em",
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontSize: "0.7rem",
            color: "var(--color-text-dim)",
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform 0.2s",
            display: "inline-block",
          }}
        >
          ▾
        </span>
      </button>
      {open && (
        <div
          style={{
            padding: "0.85rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.85rem",
            borderTop: "1px solid var(--color-border)",
          }}
        >
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
      style={{ position: "fixed", inset: 0, zIndex: 210, display: "flex", alignItems: "center", justifyContent: "center", background: "oklch(0 0 0 / 0.75)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.85rem", padding: "1.25rem", background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", boxShadow: "0 24px 64px oklch(0 0 0 / 0.6)", maxWidth: "92vw" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", gap: "1rem" }}>
          <span style={{ fontSize: "0.82rem", fontWeight: 500, color: "var(--color-text-body)" }}>Crop Avatar</span>
          <span style={{ fontSize: "0.72rem", color: "var(--color-text-dim)" }}>{cropDimLabel ?? "Loading…"}</span>
        </div>

        {!displaySize || !imgSrc ? (
          <div style={{ width: 200, height: 120, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-text-dim)", fontSize: "0.8rem" }}>
            Loading image…
          </div>
        ) : (
          <div style={{ position: "relative", width: displaySize.w, height: displaySize.h, flexShrink: 0, userSelect: "none" }}>
            <img
              src={imgSrc}
              alt="crop source"
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block", objectFit: "fill", pointerEvents: "none" }}
              draggable={false}
            />
            {crop && (
              <svg
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", overflow: "visible" }}
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
              style={{ position: "absolute", inset: 0, cursor }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
            />
          </div>
        )}

        <div style={{ display: "flex", gap: "0.5rem", alignSelf: "flex-end" }}>
          <button
            onClick={onCancel}
            style={{ padding: "0.4rem 0.85rem", background: "var(--color-surface-raised)", color: "var(--color-text-muted)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", cursor: "pointer", fontSize: "0.78rem" }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!crop || !displaySize}
            style={{ padding: "0.4rem 0.85rem", background: "var(--color-primary)", color: "#fff", border: "none", borderRadius: "var(--radius-md)", cursor: "pointer", fontSize: "0.78rem", fontWeight: 500, opacity: !crop ? 0.5 : 1 }}
          >
            Crop & Use
          </button>
        </div>
      </div>
    </div>
  );
}
