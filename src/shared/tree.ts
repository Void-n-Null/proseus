import type { ChatNode } from "./types.ts";

/**
 * Walk from root following active_child_index to produce the linear active path.
 * Returns array of node IDs from root to leaf.
 */
export function getActivePath(
  rootId: string,
  nodes: ReadonlyMap<string, ChatNode>,
): string[] {
  const path: string[] = [];
  let currentId: string | undefined = rootId;

  while (currentId !== undefined) {
    const node = nodes.get(currentId);
    if (!node) break;

    path.push(node.id);

    // Stop if no children or no active child selected
    if (node.child_ids.length === 0 || node.active_child_index === null) break;

    // Defensive: stop if index out of bounds
    if (node.active_child_index < 0 || node.active_child_index >= node.child_ids.length) break;

    currentId = node.child_ids[node.active_child_index];
  }

  return path;
}

/**
 * Walk up from target node, computing what each ancestor's active_child_index
 * should be to make `targetNodeId` reachable via the active path.
 * Only includes nodes whose index actually CHANGED.
 * Returns patches array — does NOT mutate the map.
 */
export function computeBranchSwitch(
  targetNodeId: string,
  nodes: ReadonlyMap<string, ChatNode>,
): Array<{ id: string; newActiveChildIndex: number }> {
  const patches: Array<{ id: string; newActiveChildIndex: number }> = [];

  let childId = targetNodeId;
  const targetNode = nodes.get(childId);
  if (!targetNode) return patches;

  let parentId = targetNode.parent_id;

  while (parentId !== null) {
    const parent = nodes.get(parentId);
    if (!parent) break;

    const desiredIndex = parent.child_ids.indexOf(childId);
    if (desiredIndex === -1) break; // inconsistent tree, bail

    if (parent.active_child_index !== desiredIndex) {
      patches.push({ id: parent.id, newActiveChildIndex: desiredIndex });
    }

    childId = parentId;
    parentId = parent.parent_id;
  }

  return patches;
}

/**
 * Find the lowest common ancestor of two nodes.
 * Collects all ancestors of nodeA into a Set, then walks up from nodeB.
 * Returns null if no common ancestor or either node doesn't exist.
 */
export function findLCA(
  nodeA: string,
  nodeB: string,
  nodes: ReadonlyMap<string, ChatNode>,
): string | null {
  // Collect nodeA and all its ancestors
  const ancestorsA = new Set<string>();
  let current: string | null = nodeA;

  while (current !== null) {
    const node = nodes.get(current);
    if (!node) break;
    ancestorsA.add(current);
    current = node.parent_id;
  }

  if (ancestorsA.size === 0) return null;

  // Walk up from nodeB checking membership
  current = nodeB;
  while (current !== null) {
    if (ancestorsA.has(current)) return current;
    const node = nodes.get(current);
    if (!node) break;
    current = node.parent_id;
  }

  return null;
}

/**
 * Get a node's position among its siblings.
 * Returns { index, total } or null if node is root / not found.
 */
export function getSiblingInfo(
  nodeId: string,
  nodes: ReadonlyMap<string, ChatNode>,
): { index: number; total: number } | null {
  const node = nodes.get(nodeId);
  if (!node || node.parent_id === null) return null;

  const parent = nodes.get(node.parent_id);
  if (!parent) return null;

  const index = parent.child_ids.indexOf(nodeId);
  if (index === -1) return null;

  return { index, total: parent.child_ids.length };
}
