import { layerAppliesTo, type GlobalLayerConfig, type TreeState, type WaveformInfo } from "@motion-script/core";

/**
 * What a row that isn't a scene node represents. Project-level content spans
 * scenes, so it can't hang off the scene tree — these rows sit above it.
 */
export type GlobalRowKind = "background" | "overlay" | "audio";

/** A contiguous stretch of the timeline a global row's bar covers. */
export interface RowSegment {
  startFrame: number;
  /** Exclusive — the first frame the row is no longer active. */
  endFrame: number;
}

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
  /**
   * Set on project-level rows (backgrounds / overlays / audio beds), which are
   * not part of any scene's tree: they have no id from the engine, can't be
   * expanded or selected, and draw from {@link segments} rather than a lifespan.
   */
  global?: GlobalRowKind;
  /** Label shown in the names column. Defaults to {@link type} for node rows. */
  label?: string;
  /**
   * Explicit bar segments (global rows only). A filtered layer is active on the
   * scenes it includes and dark on the rest, which can be several disjoint
   * stretches — one bar per stretch, so the gaps are visible.
   */
  segments?: RowSegment[];
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

/** Inputs for {@link globalRows} — everything project-level the timeline shows. */
export interface GlobalRowsInput {
  backgrounds: readonly GlobalLayerConfig[];
  overlays: readonly GlobalLayerConfig[];
  /** Beds already resolved to absolute seconds by the engine. */
  audioClips: readonly WaveformInfo[];
  sceneNames: readonly string[];
  /** Absolute start frame of each scene, parallel to `sceneNames`. */
  sceneStartFrames: readonly number[];
  totalFrameCount: number;
  fps: number;
}

/**
 * Build the rows for the project's global content, in the order they stack on
 * screen: backgrounds (drawn under everything), then overlays (over
 * everything), then audio beds.
 *
 * A layer's bar covers exactly the scenes its `include`/`exclude` select — the
 * decision is delegated to the engine's own `layerAppliesTo`, so what the
 * timeline draws and what actually renders can't disagree. Adjacent selected
 * scenes merge into one bar, so a layer on every scene reads as a single span
 * rather than one block per cut.
 */
export function globalRows(input: GlobalRowsInput): FlatNode[] {
  const { backgrounds, overlays, audioClips, fps } = input;
  const rows: FlatNode[] = [];

  const layerRows = (layers: readonly GlobalLayerConfig[], kind: GlobalRowKind) => {
    layers.forEach((layer, i) => {
      const segments = layerSegments(layer, input);
      // A layer no scene selects still gets a row — an empty bar is the clearest
      // way to show a filter that matched nothing.
      rows.push({
        id: `@${kind}:${i}`,
        type: kind,
        label: `${kind === "background" ? "Background" : "Overlay"} ${i + 1}`,
        depth: 0,
        hasChildren: false,
        global: kind,
        segments,
      });
    });
  };

  layerRows(backgrounds, "background");
  layerRows(overlays, "overlay");

  audioClips.forEach((clip, i) => {
    rows.push({
      id: `@audio:${i}`,
      type: "audio",
      label: fileLabel(clip.src),
      depth: 0,
      hasChildren: false,
      global: "audio",
      // Reuses the node waveform path: times are already absolute, so the
      // row's own offset is 0.
      waveform: [clip],
      startFrame: 0,
      endFrame: Math.round((clip.endTime ?? input.totalFrameCount / fps) * fps),
    });
  });

  return rows;
}

/** The stretches of the timeline `layer` is active on, adjacent scenes merged. */
function layerSegments(layer: GlobalLayerConfig, input: GlobalRowsInput): RowSegment[] {
  const { sceneNames, sceneStartFrames, totalFrameCount } = input;
  const segments: RowSegment[] = [];

  for (let i = 0; i < sceneNames.length; i++) {
    if (!layerAppliesTo(layer, i, sceneNames[i])) continue;
    const startFrame = sceneStartFrames[i] ?? 0;
    const endFrame = sceneStartFrames[i + 1] ?? totalFrameCount;
    const last = segments[segments.length - 1];
    if (last && last.endFrame === startFrame) last.endFrame = endFrame;
    else segments.push({ startFrame, endFrame });
  }

  return segments;
}

/** `"audio/song.mp3"` → `"song.mp3"`, for a readable row label. */
function fileLabel(src: string): string {
  return src.split(/[\\/]/).pop() || src;
}
