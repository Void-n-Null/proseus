import React from "react";

interface PersonaPickerItemProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

export default function PersonaPickerItem({
  label,
  active,
  onClick,
}: PersonaPickerItemProps) {
  return (
    <button
      onClick={onClick}
      className={[
        "w-full px-2 py-[0.4rem] border-none rounded-sm cursor-pointer",
        "text-[0.78rem] text-left transition-[background] duration-100",
        active
          ? "bg-surface-hover text-text-body"
          : "bg-transparent text-text-dim",
      ].join(" ")}
      onMouseEnter={(e) => {
        if (!active)
          (e.currentTarget as HTMLButtonElement).style.background =
            "var(--color-surface-hover)";
      }}
      onMouseLeave={(e) => {
        if (!active)
          (e.currentTarget as HTMLButtonElement).style.background =
            "transparent";
      }}
    >
      {label}
    </button>
  );
}
