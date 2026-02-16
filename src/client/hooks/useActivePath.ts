import { useMemo } from "react";
import type { ChatNode, ActivePath } from "../../shared/types.ts";
import { getActivePath } from "../../shared/tree.ts";

export function useActivePath(
  nodes: Map<string, ChatNode> | undefined,
  rootNodeId: string | null | undefined,
): ActivePath | null {
  return useMemo(() => {
    if (!nodes || !rootNodeId) return null;
    const nodeIds = getActivePath(rootNodeId, nodes);
    const pathNodes = nodeIds.map((id) => nodes.get(id)!).filter(Boolean);
    return { node_ids: nodeIds, nodes: pathNodes };
  }, [nodes, rootNodeId]);
}
