import { test, expect, describe } from "bun:test";
import {
  getActivePath,
  computeBranchSwitch,
  findLCA,
  getSiblingInfo,
} from "../shared/tree.ts";
import type { ChatNode } from "../shared/types.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(overrides: Partial<ChatNode> & { id: string }): ChatNode {
  return {
    client_id: null,
    parent_id: null,
    child_ids: [],
    active_child_index: null,
    speaker_id: "speaker1",
    message: "test",
    is_bot: false,
    created_at: Date.now(),
    updated_at: null,
    ...overrides,
  };
}

function buildTree(nodeList: ChatNode[]): Map<string, ChatNode> {
  const map = new Map<string, ChatNode>();
  for (const node of nodeList) {
    map.set(node.id, node);
  }
  return map;
}

// ---------------------------------------------------------------------------
// getActivePath
// ---------------------------------------------------------------------------

describe("getActivePath", () => {
  test("linear chain A→B→C returns [A, B, C]", () => {
    const nodes = buildTree([
      makeNode({ id: "A", child_ids: ["B"], active_child_index: 0 }),
      makeNode({ id: "B", parent_id: "A", child_ids: ["C"], active_child_index: 0 }),
      makeNode({ id: "C", parent_id: "B" }),
    ]);
    expect(getActivePath("A", nodes)).toEqual(["A", "B", "C"]);
  });

  test("tree with branch follows active_child_index", () => {
    // A has children [B, C], active=1 → follows C
    // B has child D (not followed)
    // C has child E
    const nodes = buildTree([
      makeNode({ id: "A", child_ids: ["B", "C"], active_child_index: 1 }),
      makeNode({ id: "B", parent_id: "A", child_ids: ["D"], active_child_index: 0 }),
      makeNode({ id: "C", parent_id: "A", child_ids: ["E"], active_child_index: 0 }),
      makeNode({ id: "D", parent_id: "B" }),
      makeNode({ id: "E", parent_id: "C" }),
    ]);
    expect(getActivePath("A", nodes)).toEqual(["A", "C", "E"]);
  });

  test("deeply nested (10+ levels)", () => {
    const ids = Array.from({ length: 12 }, (_, i) => `N${i}`);
    const nodeList = ids.map((id, i) =>
      makeNode({
        id,
        parent_id: i === 0 ? null : ids[i - 1]!,
        child_ids: i < ids.length - 1 ? [ids[i + 1]!] : [],
        active_child_index: i < ids.length - 1 ? 0 : null,
      }),
    );
    const nodes = buildTree(nodeList);
    expect(getActivePath("N0", nodes)).toEqual(ids);
  });

  test("single node tree returns [root]", () => {
    const nodes = buildTree([makeNode({ id: "root" })]);
    expect(getActivePath("root", nodes)).toEqual(["root"]);
  });

  test("node with null active_child_index stops", () => {
    const nodes = buildTree([
      makeNode({ id: "A", child_ids: ["B"], active_child_index: null }),
      makeNode({ id: "B", parent_id: "A" }),
    ]);
    expect(getActivePath("A", nodes)).toEqual(["A"]);
  });

  test("node with out-of-bounds active_child_index stops safely", () => {
    const nodes = buildTree([
      makeNode({ id: "A", child_ids: ["B"], active_child_index: 5 }),
      makeNode({ id: "B", parent_id: "A" }),
    ]);
    expect(getActivePath("A", nodes)).toEqual(["A"]);
  });

  test("negative active_child_index stops safely", () => {
    const nodes = buildTree([
      makeNode({ id: "A", child_ids: ["B"], active_child_index: -1 }),
      makeNode({ id: "B", parent_id: "A" }),
    ]);
    expect(getActivePath("A", nodes)).toEqual(["A"]);
  });

  test("rootId not in map returns []", () => {
    const nodes = buildTree([makeNode({ id: "A" })]);
    expect(getActivePath("MISSING", nodes)).toEqual([]);
  });

  test("empty map returns []", () => {
    const nodes = new Map<string, ChatNode>();
    expect(getActivePath("anything", nodes)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// computeBranchSwitch
// ---------------------------------------------------------------------------

describe("computeBranchSwitch", () => {
  test("switch to a sibling returns one patch for parent", () => {
    const nodes = buildTree([
      makeNode({ id: "P", child_ids: ["A", "B"], active_child_index: 0 }),
      makeNode({ id: "A", parent_id: "P" }),
      makeNode({ id: "B", parent_id: "P" }),
    ]);
    const patches = computeBranchSwitch("B", nodes);
    expect(patches).toEqual([{ id: "P", newActiveChildIndex: 1 }]);
  });

  test("switch to already-active branch returns empty patches", () => {
    const nodes = buildTree([
      makeNode({ id: "P", child_ids: ["A", "B"], active_child_index: 0 }),
      makeNode({ id: "A", parent_id: "P" }),
      makeNode({ id: "B", parent_id: "P" }),
    ]);
    const patches = computeBranchSwitch("A", nodes);
    expect(patches).toEqual([]);
  });

  test("switch to deeply nested branch patches all changed ancestors", () => {
    // Root → [A, B], active=0  (needs change to 1 for B)
    //   B → [C, D], active=0   (needs change to 1 for D)
    //     D → leaf
    const nodes = buildTree([
      makeNode({ id: "Root", child_ids: ["A", "B"], active_child_index: 0 }),
      makeNode({ id: "A", parent_id: "Root" }),
      makeNode({ id: "B", parent_id: "Root", child_ids: ["C", "D"], active_child_index: 0 }),
      makeNode({ id: "C", parent_id: "B" }),
      makeNode({ id: "D", parent_id: "B" }),
    ]);
    const patches = computeBranchSwitch("D", nodes);
    // Walk up: D's parent is B (needs index 1), B's parent is Root (needs index 1)
    expect(patches).toEqual([
      { id: "B", newActiveChildIndex: 1 },
      { id: "Root", newActiveChildIndex: 1 },
    ]);
  });

  test("target node is root returns empty patches", () => {
    const nodes = buildTree([
      makeNode({ id: "Root", child_ids: ["A"], active_child_index: 0 }),
      makeNode({ id: "A", parent_id: "Root" }),
    ]);
    const patches = computeBranchSwitch("Root", nodes);
    expect(patches).toEqual([]);
  });

  test("target not in map returns empty array", () => {
    const nodes = buildTree([makeNode({ id: "A" })]);
    expect(computeBranchSwitch("MISSING", nodes)).toEqual([]);
  });

  test("multi-level: 3 levels of branching, switch deep leaf to another", () => {
    // L0: Root → [L1a, L1b], active=0
    // L1a → [L2a, L2b], active=0
    // L2a → [L3a, L3b], active=0
    // Switch to L3b (under L2a, which is already active under L1a, which is already active)
    // Only L2a needs to change (from 0 to 1)
    const nodes = buildTree([
      makeNode({ id: "Root", child_ids: ["L1a", "L1b"], active_child_index: 0 }),
      makeNode({ id: "L1a", parent_id: "Root", child_ids: ["L2a", "L2b"], active_child_index: 0 }),
      makeNode({ id: "L1b", parent_id: "Root" }),
      makeNode({ id: "L2a", parent_id: "L1a", child_ids: ["L3a", "L3b"], active_child_index: 0 }),
      makeNode({ id: "L2b", parent_id: "L1a" }),
      makeNode({ id: "L3a", parent_id: "L2a" }),
      makeNode({ id: "L3b", parent_id: "L2a" }),
    ]);
    const patches = computeBranchSwitch("L3b", nodes);
    // L3b parent=L2a, desired index=1 (currently 0) → patch
    // L2a parent=L1a, desired index=0 (already 0) → skip
    // L1a parent=Root, desired index=0 (already 0) → skip
    expect(patches).toEqual([{ id: "L2a", newActiveChildIndex: 1 }]);
  });

  test("multi-level: switch from one deep branch to a completely different deep branch", () => {
    // Root → [L1a, L1b], active=0
    // L1b → [L2c, L2d], active=0
    // Switch to L2d — needs Root (0→1) and L1b (0→1)
    const nodes = buildTree([
      makeNode({ id: "Root", child_ids: ["L1a", "L1b"], active_child_index: 0 }),
      makeNode({ id: "L1a", parent_id: "Root" }),
      makeNode({ id: "L1b", parent_id: "Root", child_ids: ["L2c", "L2d"], active_child_index: 0 }),
      makeNode({ id: "L2c", parent_id: "L1b" }),
      makeNode({ id: "L2d", parent_id: "L1b" }),
    ]);
    const patches = computeBranchSwitch("L2d", nodes);
    expect(patches).toEqual([
      { id: "L1b", newActiveChildIndex: 1 },
      { id: "Root", newActiveChildIndex: 1 },
    ]);
  });
});

// ---------------------------------------------------------------------------
// findLCA
// ---------------------------------------------------------------------------

describe("findLCA", () => {
  test("same node: LCA is itself", () => {
    const nodes = buildTree([makeNode({ id: "A" })]);
    expect(findLCA("A", "A", nodes)).toBe("A");
  });

  test("parent-child: LCA is the parent", () => {
    const nodes = buildTree([
      makeNode({ id: "P", child_ids: ["C"], active_child_index: 0 }),
      makeNode({ id: "C", parent_id: "P" }),
    ]);
    expect(findLCA("P", "C", nodes)).toBe("P");
    expect(findLCA("C", "P", nodes)).toBe("P");
  });

  test("siblings: LCA is their shared parent", () => {
    const nodes = buildTree([
      makeNode({ id: "P", child_ids: ["A", "B"], active_child_index: 0 }),
      makeNode({ id: "A", parent_id: "P" }),
      makeNode({ id: "B", parent_id: "P" }),
    ]);
    expect(findLCA("A", "B", nodes)).toBe("P");
  });

  test("distant cousins diverge several levels up", () => {
    // Root → [A, B]
    //   A → [C]
    //     C → [D]
    //   B → [E]
    //     E → [F]
    // LCA(D, F) = Root
    const nodes = buildTree([
      makeNode({ id: "Root", child_ids: ["A", "B"], active_child_index: 0 }),
      makeNode({ id: "A", parent_id: "Root", child_ids: ["C"], active_child_index: 0 }),
      makeNode({ id: "B", parent_id: "Root", child_ids: ["E"], active_child_index: 0 }),
      makeNode({ id: "C", parent_id: "A", child_ids: ["D"], active_child_index: 0 }),
      makeNode({ id: "D", parent_id: "C" }),
      makeNode({ id: "E", parent_id: "B", child_ids: ["F"], active_child_index: 0 }),
      makeNode({ id: "F", parent_id: "E" }),
    ]);
    expect(findLCA("D", "F", nodes)).toBe("Root");
  });

  test("node not in map returns null", () => {
    const nodes = buildTree([makeNode({ id: "A" })]);
    expect(findLCA("A", "MISSING", nodes)).toBeNull();
    expect(findLCA("MISSING", "A", nodes)).toBeNull();
  });

  test("no common ancestor (separate trees) returns null", () => {
    // Two disconnected roots
    const nodes = buildTree([
      makeNode({ id: "R1", child_ids: ["A"], active_child_index: 0 }),
      makeNode({ id: "A", parent_id: "R1" }),
      makeNode({ id: "R2", child_ids: ["B"], active_child_index: 0 }),
      makeNode({ id: "B", parent_id: "R2" }),
    ]);
    expect(findLCA("A", "B", nodes)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getSiblingInfo
// ---------------------------------------------------------------------------

describe("getSiblingInfo", () => {
  test("only child returns { index: 0, total: 1 }", () => {
    const nodes = buildTree([
      makeNode({ id: "P", child_ids: ["A"], active_child_index: 0 }),
      makeNode({ id: "A", parent_id: "P" }),
    ]);
    expect(getSiblingInfo("A", nodes)).toEqual({ index: 0, total: 1 });
  });

  test("middle sibling (3 children, node is second) returns { index: 1, total: 3 }", () => {
    const nodes = buildTree([
      makeNode({ id: "P", child_ids: ["A", "B", "C"], active_child_index: 0 }),
      makeNode({ id: "A", parent_id: "P" }),
      makeNode({ id: "B", parent_id: "P" }),
      makeNode({ id: "C", parent_id: "P" }),
    ]);
    expect(getSiblingInfo("B", nodes)).toEqual({ index: 1, total: 3 });
  });

  test("root node (no parent) returns null", () => {
    const nodes = buildTree([makeNode({ id: "Root" })]);
    expect(getSiblingInfo("Root", nodes)).toBeNull();
  });

  test("node not in map returns null", () => {
    const nodes = buildTree([makeNode({ id: "A" })]);
    expect(getSiblingInfo("MISSING", nodes)).toBeNull();
  });

  test("last sibling returns correct index", () => {
    const nodes = buildTree([
      makeNode({ id: "P", child_ids: ["A", "B", "C", "D"], active_child_index: 0 }),
      makeNode({ id: "A", parent_id: "P" }),
      makeNode({ id: "B", parent_id: "P" }),
      makeNode({ id: "C", parent_id: "P" }),
      makeNode({ id: "D", parent_id: "P" }),
    ]);
    expect(getSiblingInfo("D", nodes)).toEqual({ index: 3, total: 4 });
  });
});
