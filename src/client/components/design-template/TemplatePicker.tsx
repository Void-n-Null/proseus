import React from "react";
import { Palette } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog.tsx";
import { cn } from "../../lib/utils.ts";
import {
  DESIGN_TEMPLATES,
  type DesignTemplateId,
} from "../../../shared/design-templates.ts";

interface TemplatePresentation {
  eyebrow: string;
  accent: string;
  swatches: string[];
}

const TEMPLATE_PRESENTATION: Record<DesignTemplateId, TemplatePresentation> = {
  forge: {
    eyebrow: "Editorial command deck",
    accent: "from-[oklch(0.68_0.17_280)] via-[oklch(0.62_0.14_285)] to-[oklch(0.52_0.12_290)]",
    swatches: ["#7c5cff", "#1f1534", "#15111f", "#f5ecff"],
  },
  discord: {
    eyebrow: "Channel-first social shell",
    accent: "from-[#5865F2] via-[#404EED] to-[#313bb9]",
    swatches: ["#5865F2", "#2b2d31", "#1e1f22", "#f2f3f5"],
  },
  chub: {
    eyebrow: "Warm roleplay lounge",
    accent: "from-[#d7a25f] via-[#c88a3d] to-[#7b5024]",
    swatches: ["#d7a25f", "#272727", "#1a1a24", "#e5e0d8"],
  },
};

interface TemplatePickerGridProps {
  activeId: DesignTemplateId;
  onSelect: (id: DesignTemplateId) => void;
  className?: string;
  embedded?: boolean;
}

interface TemplatePickerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeId: DesignTemplateId;
  onSelect: (id: DesignTemplateId) => void;
}

export function TemplatePickerGrid({
  activeId,
  onSelect,
  className,
  embedded = false,
}: TemplatePickerGridProps) {
  return (
    <div
      className={cn(
        "grid gap-4",
        embedded ? "grid-cols-1 md:grid-cols-3" : "grid-cols-1 lg:grid-cols-3",
        className,
      )}
    >
      {Object.values(DESIGN_TEMPLATES).map((template) => {
        const presentation = TEMPLATE_PRESENTATION[template.id];
        const active = template.id === activeId;

        return (
          <button
            key={template.id}
            type="button"
            onClick={() => onSelect(template.id)}
            className={cn(
              "group relative overflow-hidden rounded-[1.35rem] border text-left transition-all duration-200",
              "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-surface",
              active
                ? "border-primary/60 bg-[linear-gradient(180deg,oklch(0.18_0.03_280),oklch(0.12_0.02_275))] shadow-[0_26px_70px_oklch(0_0_0_/_0.36)]"
                : "border-border bg-[linear-gradient(180deg,oklch(0.16_0.02_280),oklch(0.11_0.015_275))] hover:-translate-y-0.5 hover:border-border-subtle hover:shadow-[0_22px_60px_oklch(0_0_0_/_0.28)]",
            )}
          >
            <div
              className={cn(
                "absolute inset-x-0 top-0 h-24 bg-gradient-to-br opacity-90",
                presentation.accent,
              )}
            />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,oklch(1_0_0_/_0.14),transparent_40%),linear-gradient(180deg,transparent,oklch(0_0_0_/_0.26))]" />

            <div className="relative flex h-full flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[0.62rem] font-semibold uppercase tracking-[0.28em] text-white/70">
                    {presentation.eyebrow}
                  </p>
                  <h3 className="mt-2 text-[1.05rem] font-semibold text-white">
                    {template.label}
                  </h3>
                </div>
                <span
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.2em]",
                    active
                      ? "border-primary/40 bg-primary/20 text-primary"
                      : "border-white/10 bg-black/20 text-white/70",
                  )}
                >
                  {active ? "Live" : "Preview"}
                </span>
              </div>

              <div className="mt-5">
                <TemplateMiniPreview id={template.id} active={active} />
              </div>

              <div className="mt-4 flex items-center gap-2">
                {presentation.swatches.map((swatch) => (
                  <span
                    key={swatch}
                    className="h-2.5 w-2.5 rounded-full ring-1 ring-white/10"
                    style={{ backgroundColor: swatch }}
                  />
                ))}
              </div>

              <p className="mt-4 text-sm leading-6 text-white/80">
                {template.description}
              </p>

              <div className="mt-4 flex items-center justify-between text-[0.72rem] text-white/55">
                <span>Applies instantly behind the modal</span>
                <span className="font-medium text-white/80">
                  {active ? "Current theme" : "Try it"}
                </span>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

export default function TemplatePickerModal({
  open,
  onOpenChange,
  activeId,
  onSelect,
}: TemplatePickerModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl bg-[linear-gradient(180deg,oklch(0.14_0.02_280),oklch(0.1_0.015_275))] p-0">
        <div className="border-b border-white/8 bg-[radial-gradient(circle_at_top_left,oklch(0.72_0.16_280_/_0.2),transparent_38%)] px-6 py-6">
          <DialogHeader className="space-y-2 text-left">
            <div className="flex items-center gap-2 text-white/75">
              <Palette className="h-4 w-4" />
              <span className="text-[0.68rem] font-semibold uppercase tracking-[0.28em]">
                Design Templates
              </span>
            </div>
            <DialogTitle className="text-2xl text-white">
              Choose the Proseus mood you want to inhabit
            </DialogTitle>
            <DialogDescription className="max-w-3xl text-sm leading-6 text-white/70">
              Each template shifts the shell, rhythm, and visual tone of the app.
              Click any card to apply it live and keep the one that feels right.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="px-6 py-6">
          <TemplatePickerGrid activeId={activeId} onSelect={onSelect} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TemplateMiniPreview({
  id,
  active,
}: {
  id: DesignTemplateId;
  active: boolean;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[1rem] border border-white/10 bg-black/25 p-3 shadow-inner",
        active ? "ring-1 ring-primary/35" : "",
      )}
    >
      {id === "forge" && <ForgePreview />}
      {id === "discord" && <DiscordPreview />}
      {id === "chub" && <ChubPreview />}
    </div>
  );
}

function ForgePreview() {
  return (
    <div className="grid grid-cols-[0.95fr_1.7fr] gap-3">
      <div className="space-y-2">
        <div className="h-4 w-20 rounded-full bg-white/15" />
        <div className="rounded-xl border border-white/8 bg-black/25 p-2.5">
          <div className="space-y-1.5">
            <div className="h-8 rounded-lg bg-white/8" />
            <div className="h-8 rounded-lg bg-white/6" />
            <div className="h-8 rounded-lg bg-white/6" />
          </div>
        </div>
      </div>
      <div className="rounded-[1rem] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-3">
        <div className="mb-3 flex items-center justify-between">
          <div className="h-3 w-24 rounded-full bg-white/20" />
          <div className="flex gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full bg-white/20" />
            <div className="h-2.5 w-2.5 rounded-full bg-white/12" />
            <div className="h-2.5 w-2.5 rounded-full bg-white/12" />
          </div>
        </div>
        <div className="space-y-2">
          <div className="h-10 rounded-xl bg-white/8" />
          <div className="ml-auto h-9 w-[68%] rounded-xl bg-[oklch(0.7_0.15_280_/_0.32)]" />
          <div className="h-9 w-[76%] rounded-xl bg-white/8" />
        </div>
      </div>
    </div>
  );
}

function DiscordPreview() {
  return (
    <div className="grid grid-cols-[0.48fr_1fr_1.75fr] gap-2.5">
      <div className="rounded-xl bg-[#1e1f22] p-2">
        <div className="space-y-2">
          <div className="h-9 rounded-[0.85rem] bg-[#5865F2]/80" />
          <div className="h-9 rounded-[0.85rem] bg-white/10" />
          <div className="h-9 rounded-[0.85rem] bg-white/6" />
        </div>
      </div>
      <div className="rounded-xl bg-[#2b2d31] p-2.5">
        <div className="h-3 w-16 rounded-full bg-white/20" />
        <div className="mt-3 space-y-1.5">
          <div className="h-7 rounded-lg bg-white/10" />
          <div className="h-7 rounded-lg bg-white/7" />
          <div className="h-7 rounded-lg bg-white/7" />
        </div>
      </div>
      <div className="rounded-xl bg-[#313338] p-3">
        <div className="mb-3 flex items-center gap-2">
          <div className="h-6 w-6 rounded-full bg-[#5865F2]" />
          <div className="h-3 w-24 rounded-full bg-white/20" />
        </div>
        <div className="space-y-2">
          <div className="h-8 rounded-lg bg-white/8" />
          <div className="h-8 rounded-lg bg-white/8" />
          <div className="h-8 rounded-lg bg-white/8" />
        </div>
      </div>
    </div>
  );
}

function ChubPreview() {
  return (
    <div className="rounded-[1rem] bg-[linear-gradient(180deg,#262626,#1d1d1d)] p-3">
      <div className="mx-auto max-w-[88%] space-y-2">
        <div className="flex items-center justify-center gap-2">
          <div className="h-7 w-7 rounded-[0.7rem] bg-[#d7a25f]/85" />
          <div className="h-3 w-24 rounded-full bg-[#f4ddbc]/25" />
        </div>
        <div className="rounded-sm border border-[#d7a25f]/15 bg-[#2b2b2b] p-2.5">
          <div className="space-y-2">
            <div className="h-8 rounded-sm bg-[#373737]" />
            <div className="ml-auto h-8 w-[72%] rounded-sm bg-[#4b3420]" />
            <div className="h-8 w-[80%] rounded-sm bg-[#373737]" />
          </div>
        </div>
      </div>
    </div>
  );
}
