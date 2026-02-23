import React from "react";

interface DateDividerProps {
  date: number;
}

export default function DateDivider({ date }: DateDividerProps) {
  const formatted = new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="flex items-center justify-center py-3">
      <div className="flex items-center w-[98%]">
        <div className="flex-1 h-[0.75px] bg-[#404040]/35" />
        <div className="px-1 text-[#b9bbbe]/80 text-xs font-semibold" style={{ fontFamily: "var(--discord-font)" }}>
          {formatted}
        </div>
        <div className="flex-1 h-[0.75px] bg-[#404040]/35" />
      </div>
    </div>
  );
}
