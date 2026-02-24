import React, { useCallback, useEffect, useRef, useState } from "react";
import { Upload, X, FileText, ChevronDown, Check } from "lucide-react";
import { Avatar } from "../ui/avatar.tsx";
import { useCharacters } from "../../hooks/useCharacters.ts";
import { usePersonas } from "../../hooks/usePersonas.ts";
import { useImportJsonlChat } from "../../hooks/useChat.ts";
import type { ImportedMessage, SpeakerMapping } from "../../../shared/api-types.ts";
import type { CharacterListItem, Persona } from "../../../shared/types.ts";

/* ── JSONL parser ──────────────────────────────────────────────── */

interface JsonlHeader {
  user_name?: string;
  character_name?: string;
}

interface JsonlMessage {
  name: string;
  is_user: boolean;
  mes: string;
  send_date?: number | string;
}

interface ParsedFile {
  header: JsonlHeader;
  messages: ImportedMessage[];
  /** Unique speaker names found in the file, with is_user hint */
  speakers: Array<{ name: string; is_user: boolean }>;
}

function parseJsonl(text: string): ParsedFile {
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) throw new Error("File is empty");

  // First line is typically a metadata header
  const firstLine = JSON.parse(lines[0]!);
  const isHeader =
    ("user_name" in firstLine || "character_name" in firstLine) &&
    !("mes" in firstLine);

  const header: JsonlHeader = isHeader ? firstLine : {};
  const msgLines = isHeader ? lines.slice(1) : lines;

  const messages: ImportedMessage[] = [];
  const speakerMap = new Map<string, boolean>(); // name -> is_user

  for (const line of msgLines) {
    const raw = JSON.parse(line) as JsonlMessage;
    if (!raw.mes && raw.mes !== "") continue; // skip non-message lines

    const name = raw.name || (raw.is_user ? "User" : "Character");
    const sendDate =
      typeof raw.send_date === "number"
        ? raw.send_date
        : typeof raw.send_date === "string"
          ? new Date(raw.send_date).getTime()
          : undefined;

    messages.push({
      name,
      message: raw.mes,
      is_user: !!raw.is_user,
      send_date: sendDate && !Number.isNaN(sendDate) ? sendDate : undefined,
    });

    if (!speakerMap.has(name)) {
      speakerMap.set(name, !!raw.is_user);
    }
  }

  const speakers = [...speakerMap.entries()].map(([name, is_user]) => ({
    name,
    is_user,
  }));

  return { header, messages, speakers };
}

/* ── Generic entity picker ─────────────────────────────────────── */

interface PickerEntity {
  id: string;
  name: string;
  avatar_url: string | null;
}

interface EntityPickerProps {
  items: PickerEntity[];
  selected: PickerEntity | null;
  onSelect: (item: PickerEntity) => void;
  placeholder: string;
  emptyLabel: string;
}

function EntityPicker({
  items,
  selected,
  onSelect,
  placeholder,
  emptyLabel,
}: EntityPickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-surface-raised border border-border text-[0.78rem] text-text-body hover:border-primary transition-colors w-full min-w-[160px] cursor-pointer"
      >
        {selected ? (
          <>
            {selected.avatar_url ? (
              <Avatar src={selected.avatar_url} alt={selected.name} size={18} />
            ) : (
              <div className="w-[18px] h-[18px] rounded-full flex items-center justify-center text-[0.55rem] font-semibold text-white shrink-0 bg-[#555]">
                {selected.name.charAt(0).toUpperCase()}
              </div>
            )}
            <span className="truncate flex-1 text-left">{selected.name}</span>
          </>
        ) : (
          <span className="text-text-dim flex-1 text-left">{placeholder}</span>
        )}
        <ChevronDown width={14} height={14} className="text-text-dim shrink-0" />
      </button>

      {open && (
        <div className="absolute z-30 top-full left-0 mt-1 w-full min-w-[200px] max-h-[200px] overflow-y-auto rounded-md border border-border bg-surface-raised shadow-lg p-1">
          {items.length === 0 ? (
            <div className="px-2 py-1.5 text-[0.75rem] text-text-dim">
              {emptyLabel}
            </div>
          ) : (
            items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelect(item);
                  setOpen(false);
                }}
                className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded text-[0.76rem] text-text-muted hover:text-text-body hover:bg-surface transition-colors cursor-pointer"
              >
                {item.avatar_url ? (
                  <Avatar src={item.avatar_url} alt={item.name} size={20} />
                ) : (
                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-[0.55rem] font-semibold text-white shrink-0 bg-[#555]">
                    {item.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="truncate flex-1">{item.name}</span>
                {selected?.id === item.id && (
                  <Check width={14} height={14} className="text-primary shrink-0" />
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/* ── Mapping state ─────────────────────────────────────────────── */

interface MappingTarget {
  type: "character" | "persona";
  id: string;
  name: string;
  avatar_url: string | null;
}

/* ── Main modal ────────────────────────────────────────────────── */

interface ChatImportModalProps {
  onClose: () => void;
  onImported: (chatId: string) => void;
}

export default function ChatImportModal({
  onClose,
  onImported,
}: ChatImportModalProps) {
  const [parsedFile, setParsedFile] = useState<ParsedFile | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [chatName, setChatName] = useState("");
  const [mappings, setMappings] = useState<Map<string, MappingTarget>>(new Map());
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  const { data: characterData } = useCharacters();
  const { data: personaData } = usePersonas();
  const characters = characterData?.characters ?? [];
  const personas = personaData?.personas ?? [];
  const importMutation = useImportJsonlChat();

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setParseError(null);
      setParsedFile(null);
      setMappings(new Map());
      setImportError(null);

      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = parseJsonl(reader.result as string);
          setParsedFile(parsed);
          setChatName(
            parsed.header.character_name ?? file.name.replace(/\.jsonl?$/i, ""),
          );

          // Auto-map by matching names
          const autoMap = new Map<string, MappingTarget>();
          for (const fileSpeaker of parsed.speakers) {
            if (fileSpeaker.is_user) {
              // Match personas by name
              const match = personas.find(
                (p) => p.name.toLowerCase() === fileSpeaker.name.toLowerCase(),
              );
              // Fall back to first persona if available
              const target = match ?? personas[0];
              if (target) {
                autoMap.set(fileSpeaker.name, {
                  type: "persona",
                  id: target.id,
                  name: target.name,
                  avatar_url: target.avatar_url,
                });
              }
            } else {
              // Match characters by name
              const match = characters.find(
                (c) => c.name.toLowerCase() === fileSpeaker.name.toLowerCase(),
              );
              // Also try character_name from the header
              const headerMatch =
                !match && parsed.header.character_name
                  ? characters.find(
                      (c) =>
                        c.name.toLowerCase() ===
                        parsed.header.character_name!.toLowerCase(),
                    )
                  : undefined;
              const target = match ?? headerMatch;
              if (target) {
                autoMap.set(fileSpeaker.name, {
                  type: "character",
                  id: target.id,
                  name: target.name,
                  avatar_url: target.avatar_url,
                });
              }
            }
          }
          setMappings(autoMap);
        } catch (err) {
          setParseError(
            err instanceof Error ? err.message : "Failed to parse file",
          );
        }
      };
      reader.readAsText(file);
    },
    [characters, personas],
  );

  const allMapped =
    parsedFile != null &&
    parsedFile.speakers.every((s) => mappings.has(s.name));

  const handleImport = useCallback(async () => {
    if (!parsedFile || !allMapped) return;

    setImportError(null);

    const speakerMap: SpeakerMapping[] = parsedFile.speakers.map((s) => {
      const target = mappings.get(s.name)!;
      return {
        original_name: s.name,
        is_user: s.is_user,
        ...(target.type === "character"
          ? { character_id: target.id }
          : { persona_id: target.id }),
      };
    });

    try {
      const result = await importMutation.mutateAsync({
        name: chatName.trim() || "Imported Chat",
        messages: parsedFile.messages,
        speaker_map: speakerMap,
      });
      onImported(result.chat.id);
    } catch (err) {
      setImportError(
        err instanceof Error ? err.message : "Import failed",
      );
    }
  }, [parsedFile, allMapped, chatName, mappings, importMutation, onImported]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === backdropRef.current) {
        onClose();
      }
    },
    [onClose],
  );

  useEffect(() => {
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, [onClose]);

  // Convert characters/personas to generic picker items
  const characterItems: PickerEntity[] = characters.map((c) => ({
    id: c.id,
    name: c.name,
    avatar_url: c.avatar_url,
  }));

  const personaItems: PickerEntity[] = personas.map((p) => ({
    id: p.id,
    name: p.name,
    avatar_url: p.avatar_url,
  }));

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
    >
      <div className="w-full max-w-lg mx-4 rounded-lg border border-border bg-surface shadow-2xl flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-[0.9rem] font-medium text-text-body">
            Import Chat
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-text-dim hover:text-text-body hover:bg-surface-hover transition-colors cursor-pointer"
          >
            <X width={16} height={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          {/* File picker */}
          <div>
            <label className="text-[0.72rem] text-text-muted uppercase tracking-wider mb-1.5 block">
              JSONL File
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".jsonl,.json"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 px-4 py-6 rounded-md border-2 border-dashed border-border text-text-dim hover:text-text-body hover:border-primary transition-colors cursor-pointer"
            >
              {parsedFile ? (
                <>
                  <FileText width={18} height={18} className="text-primary" />
                  <span className="text-[0.8rem] text-text-body">
                    {parsedFile.messages.length} messages from{" "}
                    {parsedFile.speakers.length} speaker
                    {parsedFile.speakers.length !== 1 ? "s" : ""}
                  </span>
                </>
              ) : (
                <>
                  <Upload width={18} height={18} />
                  <span className="text-[0.8rem]">
                    Choose a .jsonl file (SillyTavern, Chub)
                  </span>
                </>
              )}
            </button>
            {parseError && (
              <p className="mt-1.5 text-[0.72rem] text-[oklch(0.68_0.16_28)]">
                {parseError}
              </p>
            )}
          </div>

          {parsedFile && (
            <>
              {/* Chat name */}
              <div>
                <label className="text-[0.72rem] text-text-muted uppercase tracking-wider mb-1.5 block">
                  Chat Name
                </label>
                <input
                  value={chatName}
                  onChange={(e) => setChatName(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-md bg-surface-raised border border-border text-[0.8rem] text-text-body placeholder:text-text-dim outline-none focus:border-primary"
                  placeholder="Imported Chat"
                />
              </div>

              {/* Speaker mapping */}
              <div>
                <label className="text-[0.72rem] text-text-muted uppercase tracking-wider mb-1.5 block">
                  Map Speakers
                </label>
                <p className="text-[0.72rem] text-text-dim mb-2">
                  Map each speaker from the file to a character or persona in
                  your library.
                </p>
                <div className="flex flex-col gap-2">
                  {parsedFile.speakers.map((fileSpeaker) => {
                    const mapping = mappings.get(fileSpeaker.name);
                    const pickerSelected = mapping
                      ? { id: mapping.id, name: mapping.name, avatar_url: mapping.avatar_url }
                      : null;

                    return (
                      <div
                        key={fileSpeaker.name}
                        className="flex items-center gap-3 p-2 rounded-md bg-surface-raised/50"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[0.78rem] text-text-body font-medium truncate">
                              {fileSpeaker.name}
                            </span>
                            <span
                              className={`text-[0.62rem] px-1.5 py-[1px] rounded-full ${
                                fileSpeaker.is_user
                                  ? "bg-primary/15 text-primary"
                                  : "bg-surface-hover text-text-dim"
                              }`}
                            >
                              {fileSpeaker.is_user ? "user" : "character"}
                            </span>
                          </div>
                        </div>
                        <span className="text-text-dim text-[0.7rem]">→</span>
                        <EntityPicker
                          items={fileSpeaker.is_user ? personaItems : characterItems}
                          selected={pickerSelected}
                          onSelect={(item) => {
                            setMappings((prev) => {
                              const next = new Map(prev);
                              next.set(fileSpeaker.name, {
                                type: fileSpeaker.is_user ? "persona" : "character",
                                id: item.id,
                                name: item.name,
                                avatar_url: item.avatar_url,
                              });
                              return next;
                            });
                          }}
                          placeholder={
                            fileSpeaker.is_user
                              ? "Select persona..."
                              : "Select character..."
                          }
                          emptyLabel={
                            fileSpeaker.is_user
                              ? "No personas available"
                              : "No characters available"
                          }
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Preview snippet */}
              {parsedFile.messages.length > 0 && (
                <div>
                  <label className="text-[0.72rem] text-text-muted uppercase tracking-wider mb-1.5 block">
                    Preview
                  </label>
                  <div className="rounded-md border border-border bg-surface-raised p-2 max-h-[120px] overflow-y-auto flex flex-col gap-1">
                    {parsedFile.messages.slice(0, 5).map((msg, i) => (
                      <div key={i} className="text-[0.72rem]">
                        <span
                          className={`font-medium ${
                            msg.is_user ? "text-primary" : "text-text-body"
                          }`}
                        >
                          {msg.name}:
                        </span>{" "}
                        <span className="text-text-dim">
                          {msg.message.length > 120
                            ? msg.message.slice(0, 120) + "..."
                            : msg.message}
                        </span>
                      </div>
                    ))}
                    {parsedFile.messages.length > 5 && (
                      <div className="text-[0.68rem] text-text-dim italic">
                        ...and {parsedFile.messages.length - 5} more messages
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {importError && (
            <p className="text-[0.72rem] text-[oklch(0.68_0.16_28)]">
              {importError}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-md text-[0.78rem] text-text-muted hover:text-text-body hover:bg-surface-hover transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!allMapped || importMutation.isPending}
            onClick={handleImport}
            className="px-4 py-1.5 rounded-md text-[0.78rem] bg-primary text-white hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            {importMutation.isPending ? "Importing..." : "Import"}
          </button>
        </div>
      </div>
    </div>
  );
}
