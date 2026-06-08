import type { TreeState, WaveformInfo } from "@motion-script/core";

export interface FlatNode {
  id: string;
  type: string;
  depth: number;
  hasChildren: boolean;
  /** Audio clips owned by this node, rendered as waveforms over its track bar. */
  waveform?: WaveformInfo[];
  /** Absolute timeline frame the node first appears (its bar's left edge). */
  startFrame?: number;
  /** Absolute timeline frame the node was last present (its bar's right edge). */
  endFrame?: number;
}

// Flatten the visible portion of the node tree into a positional list, skipping
// the subtrees of any collapsed node.
export function flattenTree(node: TreeState, collapsed: Set<string>, depth = 0): FlatNode[] {
  const result: FlatNode[] = [{
    id: node.id,
    type: node.type,
    depth,
    hasChildren: node.children.length > 0,
    waveform: node.waveform,
    startFrame: node.startFrame,
    endFrame: node.endFrame,
  }];
  if (!collapsed.has(node.id)) {
    for (const child of node.children) {
      result.push(...flattenTree(child, collapsed, depth + 1));
    }
  }
  return result;
}
