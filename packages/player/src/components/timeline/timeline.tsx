import { useEffect, useRef, useState, useCallback, useReducer } from "react";

import { EditorToolbar } from "./toolbar";
import { useEditorStore } from "@/providers/editor-provider";
import {
  DEFAULT_MINOR_TICKS,
  DEFAULT_PADDING_X,
  FRAME_MODE_PX_THRESHOLD,
  FRAME_PX_AT_MIN_ZOOM,
  NODE_LIST_WIDTH,
  NODE_ROW_HEIGHT,
  PLAYHEAD_EDGE_PADDING_PX,
  RULER_HEIGHT,
  SCENE_ROW_HEIGHT,
  BAR_PADDING_Y,
  BAR_MARGIN_X,
} from "./constants";
import { flattenTree } from "./flatten";
import { formatRulerLabel, pickMajorStep } from "./ruler-utils";
import { NodeNamesColumn } from "./node-names-column";
import { TrackRows } from "./track-rows";
import { useRowVirtualizer } from "./use-row-virtualizer";

// ─── Timeline ───────────────────────────────────────────────────────────────
//
// TimelineRuler composes: EditorToolbar, a canvas-drawn ruler header (also a
// seek control), a scene row, and a virtualized two-column node tree
// (NodeNamesColumn + TrackRows) that scrolls in lockstep — see
// useRowVirtualizer / flattenTree. Zoom is geometric (not linear) between a
// "densest" and a "fit whole duration" extreme so the slider feels linear in
// perceived zoom; see ARCHITECTURE.md for the auto-follow-lock playhead
// scrolling design (computed synchronously per-render to avoid the vibration
// a split effects-based version produced).

type TimelineRulerProps = {
  width?: number;
  minorTicks?: number;
};

export function TimelineRuler({
  width,
  minorTicks = DEFAULT_MINOR_TICKS,
}: TimelineRulerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rulerCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const namesScrollRef = useRef<HTMLDivElement | null>(null);
  const trackScrollRef = useRef<HTMLDivElement | null>(null);
  const hScrollRef = useRef<HTMLDivElement | null>(null);
  const syncingScrollRef = useRef(false);

  const [measuredWidth, setMeasuredWidth] = useState<number | null>(null);
  const [scrollLeft, setScrollLeft] = useState(0);

  const rootNode = useEditorStore((s) => s.rootNode);
  const currentTime = useEditorStore((s) => s.currentTime);
  const duration = useEditorStore((s) => s.duration);
  const fps = useEditorStore((s) => s.fps);
  const setCurrentFrame = useEditorStore((s) => s.setCurrentFrame);
  const setIsPlaying = useEditorStore((s) => s.setIsPlaying);
  const timelineZoom = useEditorStore((s) => s.timelineZoom);
  const isPlaying = useEditorStore((s) => s.isPlaying);
  const timelineCollapsed = useEditorStore((s) => s.timelineCollapsed);

  const [selectedNodeId, setSelectedNodeId] = useState<string | undefined>(undefined);

  const [themeVersion, bumpTheme] = useReducer((x: number) => x + 1, 0);
  const draggingRef = useRef(false);
  const scrollLeftRef = useRef(scrollLeft);
  const pxRef = useRef<number>(0);
  const totalUnitsRef = useRef<number>(0);

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const flatNodes = rootNode ? flattenTree(rootNode, collapsed) : [];

  // Vertical row virtualization shared by both columns.
  const { window: rowWindow, measure: measureRows, onScroll: onRowScroll } =
    useRowVirtualizer(flatNodes.length, NODE_ROW_HEIGHT);

  // Timeline works in frames for display; convert time ↔ frame using fps.
  // Use sub-frame precision for the playhead position so it moves smoothly
  // between integer frames; round only for the displayed frame number.
  const totalFrameCount = Math.max(1, Math.round(duration * fps));
  const currentFrameExact = currentTime * fps;
  const currentFrame = Math.round(currentFrameExact);

  const handleToggle = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleNavigate = (id: string) => {
    setSelectedNodeId(prev => prev === id ? undefined : id);
  };

  const handleSeek = useCallback((frame: number) => {
    setCurrentFrame(frame);
    setIsPlaying(false);
  }, [setCurrentFrame, setIsPlaying]);

  // Measure container width
  useEffect(() => {
    if (width !== undefined) return;
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setMeasuredWidth(Math.floor(entry.contentRect.width));
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [width]);

  // Theme change detection
  useEffect(() => {
    const observer = new MutationObserver(bumpTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  // Sync vertical scroll between names and track columns, and feed the shared
  // scroll position into the virtualizer so the rendered window follows.
  const onNamesScroll = useCallback((scrollTop: number) => {
    onRowScroll(scrollTop);
    if (syncingScrollRef.current) return;
    const track = trackScrollRef.current;
    if (!track) return;
    syncingScrollRef.current = true;
    track.scrollTop = scrollTop;
    syncingScrollRef.current = false;
  }, [onRowScroll]);

  const onTrackScroll = useCallback((scrollTop: number) => {
    onRowScroll(scrollTop);
    if (syncingScrollRef.current) return;
    const names = namesScrollRef.current;
    if (!names) return;
    syncingScrollRef.current = true;
    names.scrollTop = scrollTop;
    syncingScrollRef.current = false;
  }, [onRowScroll]);

  const finalWidth = width ?? measuredWidth ?? 0;
  const trackWidth = Math.max(0, finalWidth - NODE_LIST_WIDTH);
  const paddingX = DEFAULT_PADDING_X;

  const displayTotalUnits = Math.max(totalFrameCount, 1);

  // Zoom 0 → max density (each frame at FRAME_PX_AT_MIN_ZOOM); Zoom 1 → fit whole duration into trackWidth.
  // Interpolate logarithmically (geometric) so the slider feels linear in perceived zoom across orders of magnitude.
  const fitPxPerUnit = Math.max(0.0001, (trackWidth - paddingX * 2) / displayTotalUnits);
  const denseEnd = Math.max(fitPxPerUnit, FRAME_PX_AT_MIN_ZOOM); // zoom=0 end
  const fitEnd = fitPxPerUnit;                                   // zoom=1 end
  const t = Math.max(0, Math.min(1, timelineZoom));
  const computedPxPerUnit = trackWidth > 0
    ? denseEnd * Math.pow(fitEnd / denseEnd, t)
    : FRAME_PX_AT_MIN_ZOOM;
  const majorStep = pickMajorStep(computedPxPerUnit);
  const showFrames = computedPxPerUnit >= FRAME_MODE_PX_THRESHOLD;
  const fullContentWidth = Math.max(trackWidth, Math.ceil(displayTotalUnits * computedPxPerUnit + paddingX * 2));

  // Scene info
  const scenes = useEditorStore((s) => s.scenes);
  const sceneStartFrames = useEditorStore((s) => s.sceneStartFrames);
  const activeSceneIndex = sceneStartFrames.length > 0
    ? sceneStartFrames.reduce((best, start, i) => currentFrame >= start ? i : best, 0)
    : 0;
  const activeSceneName = scenes.length > 0 ? `${scenes[activeSceneIndex].name}` : "";

  // ─── Auto-follow lock ──────────────────────────────────────────────────────
  // While playing, once the playhead reaches the right edge limit we pin its view-X
  // there and scroll the content under it. Computed synchronously each render so the
  // playhead and the scroll position can never disagree (which is what caused the
  // vibration in the prior version). Do not move this into an effect/state pair —
  // that reintroduces the one-frame race between playhead position and scrollLeft.
  const followLockedRef = useRef(false);
  const maxScroll = Math.max(0, fullContentWidth - trackWidth);
  const rightLimit = trackWidth - PLAYHEAD_EDGE_PADDING_PX;
  const leftLimit = PLAYHEAD_EDGE_PADDING_PX;
  const rawPlayheadX = paddingX + currentFrameExact * computedPxPerUnit;

  let effectiveScrollLeft = scrollLeft;
  let followActive = false;
  if (isPlaying && trackWidth > 0) {
    const lockedScroll = Math.max(0, Math.min(maxScroll, rawPlayheadX - rightLimit));
    const lockedViewX = rawPlayheadX - lockedScroll;
    if (followLockedRef.current) {
      if (lockedViewX >= rightLimit - 0.5 && lockedScroll < maxScroll) {
        effectiveScrollLeft = lockedScroll;
        followActive = true;
      } else {
        followLockedRef.current = false;
      }
    } else if (rawPlayheadX - scrollLeft >= rightLimit && lockedScroll < maxScroll) {
      followLockedRef.current = true;
      effectiveScrollLeft = lockedScroll;
      followActive = true;
    } else if (rawPlayheadX - scrollLeft < leftLimit) {
      const back = Math.max(0, Math.min(maxScroll, rawPlayheadX - leftLimit));
      effectiveScrollLeft = back;
      followActive = true;
    }
  }
  if (!isPlaying) followLockedRef.current = false;

  // ─── Ruler canvas ──────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = rulerCanvasRef.current;
    if (!canvas || trackWidth <= 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const cs = getComputedStyle(document.documentElement);
    const fontFamily = cs.getPropertyValue("--font-sans").trim() || "sans-serif";
    const colors = {
      rulerFill: cs.getPropertyValue("--timeline-ruler-fill").trim(),
      gridLine: cs.getPropertyValue("--timeline-grid-line").trim(),
      tick: cs.getPropertyValue("--timeline-tick").trim(),
      tickMuted: cs.getPropertyValue("--timeline-tick-muted").trim(),
      minorTick: cs.getPropertyValue("--timeline-minor-tick").trim(),
    };

    const dpr = window.devicePixelRatio || 1;
    canvas.width = trackWidth * dpr;
    canvas.height = RULER_HEIGHT * dpr;
    canvas.style.width = `${trackWidth}px`;
    canvas.style.height = `${RULER_HEIGHT}px`;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.translate(-effectiveScrollLeft, 0);
    ctx.clearRect(effectiveScrollLeft, 0, trackWidth, RULER_HEIGHT);

    ctx.save();
    ctx.fillStyle = colors.rulerFill;
    ctx.fillRect(effectiveScrollLeft, 0, trackWidth, RULER_HEIGHT);
    ctx.restore();

    const pxPer = computedPxPerUnit;
    const startUnit = Math.max(0,
      Math.floor(Math.floor((effectiveScrollLeft - paddingX) / pxPer) / majorStep) * majorStep);
    const endUnit = Math.min(displayTotalUnits + 1,
      Math.ceil((effectiveScrollLeft + trackWidth - paddingX) / pxPer));

    ctx.save();
    ctx.font = `11px ${fontFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (let unit = startUnit; unit <= endUnit; unit += majorStep) {
      const x = Math.round(paddingX + unit * pxPer);

      ctx.fillStyle = unit <= displayTotalUnits ? colors.tick : colors.tickMuted;
      ctx.fillText(formatRulerLabel(unit, fps, showFrames), x, RULER_HEIGHT / 2);

      ctx.save();
      ctx.strokeStyle = colors.gridLine;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 0.5, RULER_HEIGHT - 6);
      ctx.lineTo(x + 0.5, RULER_HEIGHT);
      ctx.stroke();
      ctx.restore();

      if (minorTicks > 0) {
        const minorStep = majorStep / minorTicks;
        ctx.save();
        ctx.strokeStyle = colors.minorTick;
        ctx.lineWidth = 1;
        for (let i = 1; i < minorTicks; i++) {
          const mu = unit + i * minorStep;
          if (mu >= displayTotalUnits) break;
          const mx = Math.round(paddingX + mu * pxPer) + 0.5;
          ctx.beginPath();
          ctx.moveTo(mx, RULER_HEIGHT * 0.55);
          ctx.lineTo(mx, RULER_HEIGHT);
          ctx.stroke();
        }
        ctx.restore();
      }
    }
    ctx.restore();

  }, [trackWidth, displayTotalUnits, majorStep, minorTicks, computedPxPerUnit, effectiveScrollLeft, fps, themeVersion]);

  // Keep refs in sync
  useEffect(() => {
    scrollLeftRef.current = scrollLeft;
    pxRef.current = computedPxPerUnit;
    totalUnitsRef.current = displayTotalUnits;
  }, [scrollLeft, computedPxPerUnit, displayTotalUnits]);

  // Shift+wheel or horizontal wheel → scroll the horizontal scrollbar div
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const shouldPan = e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY);
      if (!shouldPan) return;
      e.preventDefault();
      const delta = e.deltaX !== 0 ? e.deltaX : e.deltaY;
      const hScroll = hScrollRef.current;
      if (hScroll) hScroll.scrollLeft = Math.max(0, hScroll.scrollLeft + delta);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Push the chosen scrollLeft to the native scrollbar so the scrollbar thumb tracks the
  // rendered position. Only when follow is active — otherwise the user's scroll wins.
  useEffect(() => {
    if (!followActive) return;
    const hScroll = hScrollRef.current;
    if (!hScroll) return;
    if (Math.abs(hScroll.scrollLeft - effectiveScrollLeft) > 0.5) {
      hScroll.scrollLeft = effectiveScrollLeft;
    }
  });

  // Seek on ruler click/drag
  function clientXToFrame(clientX: number): number {
    const canvas = rulerCanvasRef.current;
    if (!canvas) return 0;
    const rect = canvas.getBoundingClientRect();
    const xInContent = clientX - rect.left + scrollLeftRef.current;
    const frame = Math.round((xInContent - paddingX) / (pxRef.current || 1));
    return Math.max(0, Math.min(totalUnitsRef.current, frame));
  }

  const onMouseMoveWindow = useCallback((e: MouseEvent) => {
    if (!draggingRef.current) return;
    handleSeek(clientXToFrame(e.clientX));
  }, [handleSeek]);

  const onMouseUpWindow = useCallback((e: MouseEvent) => {
    if (!draggingRef.current) return;
    handleSeek(clientXToFrame(e.clientX));
    draggingRef.current = false;
    window.removeEventListener("mousemove", onMouseMoveWindow);
    window.removeEventListener("mouseup", onMouseUpWindow);
  }, [onMouseMoveWindow, handleSeek]);

  useEffect(() => {
    return () => {
      window.removeEventListener("mousemove", onMouseMoveWindow);
      window.removeEventListener("mouseup", onMouseUpWindow);
    };
  }, [onMouseMoveWindow, onMouseUpWindow]);

  if (!finalWidth) {
    return <div ref={containerRef} className="bg-timeline p-2" />;
  }

  const playheadX = rawPlayheadX;
  const playheadViewX = playheadX - effectiveScrollLeft;

  const gridTicks: number[] = [];
  {
    const startUnit = Math.max(0,
      Math.floor(Math.floor((effectiveScrollLeft - paddingX) / computedPxPerUnit) / majorStep) * majorStep);
    const endUnit = Math.min(displayTotalUnits + 1,
      Math.ceil((effectiveScrollLeft + trackWidth - paddingX) / computedPxPerUnit));
    for (let u = startUnit; u <= endUnit; u += majorStep) gridTicks.push(u);
  }

  return (
    <div
      ref={containerRef}
      className="bg-timeline w-full h-full rounded-lg flex flex-col select-none overflow-hidden"
    >
      <EditorToolbar />

      {/* ── Header ── */}
      <div className="flex shrink-0 border-b border-border" style={{ height: RULER_HEIGHT }}>
        <div
          className="shrink-0 border-r border-border bg-panel flex items-center px-3"
          style={{ width: NODE_LIST_WIDTH, minWidth: NODE_LIST_WIDTH }}
        >
          <span className="text-xs font-medium text-foreground truncate">
            {currentTime.toFixed(2)}s / {duration.toFixed(2)}s
          </span>
        </div>

        <div className="flex-1 relative overflow-hidden" style={{ height: RULER_HEIGHT }}>
          <canvas
            ref={rulerCanvasRef}
            style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none" }}
          />

          {/* Seek overlay */}
          <div
            onMouseDown={(e) => {
              if (e.button !== 0) return;
              handleSeek(clientXToFrame(e.clientX));
              draggingRef.current = true;
              window.addEventListener("mousemove", onMouseMoveWindow);
              window.addEventListener("mouseup", onMouseUpWindow);
              e.preventDefault();
            }}
            style={{ position: "absolute", inset: 0, zIndex: 50 }}
          />

          {/* Playhead — line + label */}
          <div
            aria-hidden
            style={{
              position: "absolute",
              left: playheadViewX,
              top: 0,
              width: 0,
              height: RULER_HEIGHT,
              pointerEvents: "none",
              zIndex: 15,
            }}
          >
            {/* Stem line through ruler */}
            <div style={{
              position: "absolute",
              left: -1,
              top: 0,
              width: 2,
              height: "100%",
              background: "var(--primary)",
              opacity: 0.85,
            }} />
            {/* Frame/time label */}
            <div
              className="bg-primary text-primary-foreground"
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                fontSize: 10,
                fontWeight: 600,
                lineHeight: 1,
                padding: "3px 6px",
                borderRadius: 3,
                whiteSpace: "nowrap",
                zIndex: 1,
              }}
            >
              {formatRulerLabel(currentFrame, fps, showFrames)}
            </div>
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Scene row */}
        <div className="flex shrink-0 border-b border-border" style={{ height: SCENE_ROW_HEIGHT }}>
          <div
            className="shrink-0 border-r border-border bg-panel flex items-center px-3"
            style={{ width: NODE_LIST_WIDTH, minWidth: NODE_LIST_WIDTH }}
          >
            <span className="text-xs font-medium text-foreground truncate" title={activeSceneName}>
              {activeSceneName}
            </span>
          </div>
          <div className="flex-1 relative overflow-hidden">
            {sceneStartFrames.map((startFrame, i) => {
              const endFrame = sceneStartFrames[i + 1] ?? totalFrameCount;
              const isActive = i === activeSceneIndex;
              const sceneName = scenes[i]?.name ?? `Scene ${i + 1}`;
              const barWidth = Math.max(4, (endFrame - startFrame) * computedPxPerUnit - BAR_MARGIN_X * 2);
              return (
                <div
                  key={i}
                  title={sceneName}
                  className={`group/scenebar absolute rounded-xs overflow-hidden flex items-center px-1.5 ${isActive ? "bg-primary/70" : "bg-card"}`}
                  style={{
                    left: paddingX + startFrame * computedPxPerUnit - effectiveScrollLeft + BAR_MARGIN_X,
                    top: BAR_PADDING_Y,
                    width: barWidth,
                    height: SCENE_ROW_HEIGHT - BAR_PADDING_Y * 2,
                  }}
                >
                  <button
                    className={`text-xs font-medium truncate leading-none select-none bg-transparent border-none p-0 cursor-pointer underline-offset-2 group-hover/scenebar:underline ${isActive ? "text-primary-foreground" : "text-muted-foreground"}`}
                    style={{ fontSize: 10 }}
                    onClick={() => handleSeek(sceneStartFrames[i])}
                  >
                    {sceneName}
                  </button>
                </div>
              );
            })}
            {/* Playhead line continuation */}
            <div
              aria-hidden
              style={{
                position: "absolute",
                left: playheadViewX - 1,
                top: 0,
                width: 2,
                height: "100%",
                background: "var(--primary)",
                opacity: 0.85,
                pointerEvents: "none",
                zIndex: 10,
              }}
            />
          </div>
        </div>

        {!timelineCollapsed && (
        <div className="flex-1 flex overflow-hidden">
          {/* Left: node names (virtualized) */}
          <NodeNamesColumn
            nodes={flatNodes}
            window={rowWindow}
            collapsed={collapsed}
            selectedNodeId={selectedNodeId}
            onMeasure={measureRows}
            onScroll={onNamesScroll}
            scrollRef={(el) => { namesScrollRef.current = el; }}
            onToggle={handleToggle}
            onNavigate={handleNavigate}
          />

          {/* Right: track area (virtualized) */}
          <TrackRows
            nodes={flatNodes}
            window={rowWindow}
            fullContentWidth={fullContentWidth}
            effectiveScrollLeft={effectiveScrollLeft}
            paddingX={paddingX}
            computedPxPerUnit={computedPxPerUnit}
            totalFrameCount={totalFrameCount}
            fps={fps}
            playheadX={playheadX}
            gridTicks={gridTicks}
            onMeasure={measureRows}
            onScroll={onTrackScroll}
            scrollRef={(el) => { trackScrollRef.current = el; }}
          />
        </div>
        )}

        {/* Horizontal scrollbar */}
        {!timelineCollapsed && (
        <div className="flex shrink-0">
          <div style={{ width: NODE_LIST_WIDTH, minWidth: NODE_LIST_WIDTH }} className="shrink-0 border-r border-border bg-panel" />
          <div
            ref={(el) => {
              hScrollRef.current = el;
              if (!el) return;
              el.onscroll = () => { setScrollLeft(el.scrollLeft); };
            }}
            className="flex-1 overflow-x-auto overflow-y-hidden"
          >
            <div style={{ width: fullContentWidth, height: 1 }} />
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
