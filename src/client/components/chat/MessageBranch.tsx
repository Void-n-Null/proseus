import React, { useCallback } from "react";
import { useChatMutations } from "../../hooks/useMutations.ts";

interface MessageBranchProps {
  nodeId: string;
  siblingInfo: { index: number; total: number } | null;
  chatId: string;
}

export default function MessageBranch({
  nodeId,
  siblingInfo,
  chatId,
}: MessageBranchProps) {
  const { swipeSibling } = useChatMutations(chatId);

  const handlePrev = useCallback(() => {
    swipeSibling.mutate({ nodeId, direction: "prev" });
  }, [swipeSibling, nodeId]);

  const handleNext = useCallback(() => {
    swipeSibling.mutate({ nodeId, direction: "next" });
  }, [swipeSibling, nodeId]);

  // Only render if there are siblings
  if (!siblingInfo || siblingInfo.total <= 1) return null;

  const atStart = siblingInfo.index === 0;
  const atEnd = siblingInfo.index === siblingInfo.total - 1;

  return (
    <div className="inline-flex items-center gap-[0.15rem] mt-[0.25rem] text-[0.7rem] text-[#666] select-none">
      <button
        onClick={handlePrev}
        disabled={atStart}
        className={`bg-transparent border-none px-[0.25rem] py-0 text-[0.8rem] font-bold leading-none ${
          atStart ? "text-[#333] cursor-default" : "text-[#777] cursor-pointer"
        }`}
        aria-label="Previous sibling"
      >
        &larr;
      </button>
      <span className="min-w-[2rem] text-center">
        {siblingInfo.index + 1}/{siblingInfo.total}
      </span>
      <button
        onClick={handleNext}
        disabled={atEnd}
        className={`bg-transparent border-none px-[0.25rem] py-0 text-[0.8rem] font-bold leading-none ${
          atEnd ? "text-[#333] cursor-default" : "text-[#777] cursor-pointer"
        }`}
        aria-label="Next sibling"
      >
        &rarr;
      </button>
    </div>
  );
}
