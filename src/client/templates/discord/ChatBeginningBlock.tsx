import React from "react";
import { Avatar } from "../../components/ui/avatar.tsx";

interface ChatBeginningBlockProps {
  characterName: string | null;
  characterAvatarUrl: string | null;
}

export default function ChatBeginningBlock({
  characterName,
  characterAvatarUrl,
}: ChatBeginningBlockProps) {
  const displayName = characterName || "Unknown";

  return (
    <div className="px-4 pt-4 pb-[10px]" style={{ fontFamily: "var(--discord-font)" }}>
      {/* Large avatar */}
      <div className="mb-2">
        {characterAvatarUrl ? (
          <Avatar
            src={characterAvatarUrl}
            alt={displayName}
            size={80}
            fit="cover"
            borderRadius="50%"
          />
        ) : (
          <div
            className="w-20 h-20 rounded-full bg-[#5865F2] flex items-center justify-center text-2xl font-semibold text-white"
          >
            {displayName.charAt(0).toUpperCase()}
          </div>
        )}
      </div>

      {/* Display name — large bold */}
      <h2 className="text-[31px] font-bold text-white mb-1 leading-tight">
        {displayName}
      </h2>

      {/* Username echo */}
      <p className="text-white text-2xl mb-3">{displayName}</p>

      {/* DM history notice */}
      <p className="text-neutral-200 text-sm mb-3">
        This is the beginning of your direct message history with{" "}
        <b>{displayName}</b>.
      </p>
    </div>
  );
}
