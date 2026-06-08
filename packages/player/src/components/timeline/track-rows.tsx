import { AudioWaveformBar } from "./audio-waveform-bar";
import { BAR_MARGIN_X, BAR_PADDING_Y, NODE_ROW_HEIGHT } from "./constants";
import type { FlatNode } from "./flatten";
import type { RowWindow } from "./use-row-virtualizer";

interface TrackRowsProps {
  nodes: FlatNode[];
  window: RowWindow;
  fullContentWidth: number;
  effectiveScrollLeft: number;
  paddingX: number;
  computedPxPerUnit: number;
  totalFrameCount: number;
  fps: number;
  playheadX: number;
  gridTicks: number[];
  onMeasure: (el: HTMLDivElement | null) => void;
  onScroll: (scrollTop: number) => void;
  scrollRef: (el: HTMLDivElement | null) => void;
}

// Right column: per-node track bars plus the grid lines and playhead. Only the
// node rows inside `window` are rendered; grid lines and the playhead are
// full-height siblings independent of which rows are visible.
//
// Each bar spans the node's [startFrame, endFrame] lifespan. Nodes that own
// audio clips render AudioWaveformBar(s) instead — clip times are scene-local,
// so they're shifted by the owning node's startFrame (the scene's global
// offset) to align with the rest of the global timeline.
export function TrackRows({
  nodes,
  window,
  fullContentWidth,
  effectiveScrollLeft,
  paddingX,
  computedPxPerUnit,
  totalFrameCount,
  fps,
  playheadX,
  gridTicks,
  onMeasure,
  onScroll,
  scrollRef,
}: TrackRowsProps) {
  const { startIndex, endIndex, totalHeight } = window;
  const visible = nodes.slice(startIndex, endIndex);
  const barHeight = NODE_ROW_HEIGHT - BAR_PADDING_Y * 2;

  return (
    <div
      ref={(el) => { scrollRef(el); onMeasure(el); }}
      onScroll={(e) => onScroll(e.currentTarget.scrollTop)}
      className="flex-1 overflow-y-auto overflow-x-hidden no-scrollbar relative"
    >
      <div
        style={{
          width: fullContentWidth,
          height: totalHeight,
          position: "relative",
          transform: `translateX(${-effectiveScrollLeft}px)`,
        }}
      >
        {/* Grid lines */}
        {gridTicks.map((unit) => (
          <div
            key={unit}
            aria-hidden
            style={{
              position: "absolute",
              left: Math.round(paddingX + unit * computedPxPerUnit),
              top: 0, width: 1, height: "100%",
              background: "var(--timeline-grid-line)",
              pointerEvents: "none", zIndex: 1,
            }}
          />
        ))}

        {/* Playhead line */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: playheadX - 1,
            top: 0, height: "100%", width: 2,
            background: "var(--primary)",
            opacity: 0.85, zIndex: 5, pointerEvents: "none",
          }}
        />

        {/* Per-node rows (windowed) */}
        {visible.map((node, vi) => {
          const i = startIndex + vi;
          const rowTop = i * NODE_ROW_HEIGHT;

          // Nodes that own audio render one waveform bar per clip, each spanning
          // the clip's start→end range so it lines up with the timeline. Clip
          // times are scene-local, so shift them by the owning node's startFrame
          // (the scene's global offset) to land within the scene's slot.
          if (node.waveform && node.waveform.length > 0) {
            const sceneOffset = node.startFrame ?? 0;
            return (
              <div key={node.id} className="border-b border-border/40"
                style={{ position: "absolute", top: rowTop, left: 0, width: fullContentWidth, height: NODE_ROW_HEIGHT, zIndex: 2 }}>
                {node.waveform.map((clip, ci) => {
                  const startFrame = sceneOffset + clip.startTime * fps;
                  const endFrame = clip.endTime != null ? sceneOffset + clip.endTime * fps : totalFrameCount;
                  const startPx = paddingX + startFrame * computedPxPerUnit + BAR_MARGIN_X;
                  const barWidth = Math.max(4, (endFrame - startFrame) * computedPxPerUnit - BAR_MARGIN_X * 2);
                  return (
                    <div
                      key={ci}
                      className="absolute rounded-xs overflow-hidden bg-card"
                      style={{ left: startPx, top: BAR_PADDING_Y, width: barWidth, height: barHeight }}
                      title={clip.name}
                    >
                      <AudioWaveformBar url={clip.src} width={barWidth} height={barHeight} name={clip.name} />
                    </div>
                  );
                })}
              </div>
            );
          }

          // Bound the bar to the node's lifespan. endFrame is the last frame the
          // node is present, so the bar spans through it (inclusive). Fall back to
          // the whole timeline only when lifespan data is missing.
          const hasSpan = node.startFrame != null && node.endFrame != null;
          const spanStart = hasSpan ? node.startFrame! : 0;
          const spanFrames = hasSpan ? node.endFrame! - node.startFrame! + 1 : totalFrameCount;
          const startPx = paddingX + spanStart * computedPxPerUnit + BAR_MARGIN_X;
          const barWidth = Math.max(4, spanFrames * computedPxPerUnit - BAR_MARGIN_X * 2);
          return (
            <div key={node.id} className="border-b border-border/40"
              style={{ position: "absolute", top: rowTop, left: 0, width: fullContentWidth, height: NODE_ROW_HEIGHT, zIndex: 2 }}>
              <div
                className="absolute rounded-xs bg-card"
                style={{ left: startPx, top: BAR_PADDING_Y, width: barWidth, height: barHeight }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
