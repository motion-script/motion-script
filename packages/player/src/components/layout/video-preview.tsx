import { useCallback, useEffect, useRef, useState } from 'react';

import { useEditorStore } from '@/providers/editor-provider';
import { useDelayedFlag } from '@/hooks/use-delayed-flag';
import { FrameHandle, MotionPlayer, type PrecompProgress } from '@motion-script/react';

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 8;
const WHEEL_ZOOM_SPEED = 0.0015;
// Minimum px of the video that must stay visible on each axis when panning.
const PAN_MARGIN = 64;

function clampZoom(z: number) {
    return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
}

function clampPan(
    pan: { x: number; y: number },
    containerW: number,
    containerH: number,
    scaledVideoW: number,
    scaledVideoH: number,
): { x: number; y: number } {
    // The video center sits at (containerW/2 + pan.x, containerH/2 + pan.y).
    // Keep at least PAN_MARGIN px of the video inside the container on each side.
    const halfW = scaledVideoW / 2;
    const halfH = scaledVideoH / 2;
    const maxX = containerW / 2 + halfW - PAN_MARGIN;
    const minX = -(containerW / 2 + halfW - PAN_MARGIN);
    const maxY = containerH / 2 + halfH - PAN_MARGIN;
    const minY = -(containerH / 2 + halfH - PAN_MARGIN);
    return {
        x: Math.max(minX, Math.min(maxX, pan.x)),
        y: Math.max(minY, Math.min(maxY, pan.y)),
    };
}

export function VideoPreview({ frameRef }: { frameRef: React.RefObject<FrameHandle | null> }) {
    const scenes = useEditorStore(s => s.scenes);
    const assets = useEditorStore(s => s.assets);
    const viewport = useEditorStore(s => s.viewport);
    const fps = useEditorStore(s => s.fps);
    const currentFrame = useEditorStore(s => s.currentFrame);
    const isPlaying = useEditorStore(s => s.isPlaying);
    const theme = useEditorStore(s => s.theme);
    const variables = useEditorStore(s => s.variables);
    const audioTracks = useEditorStore(s => s.audioTracks);
    const overlays = useEditorStore(s => s.overlays);
    const backgrounds = useEditorStore(s => s.backgrounds);
    const playbackSpeed = useEditorStore(s => s.playbackSpeed);
    const isMuted = useEditorStore(s => s.isMuted);
    const loopMode = useEditorStore(s => s.loopMode);
    const sceneStartFrames = useEditorStore(s => s.sceneStartFrames);

    const previewZoom = useEditorStore(s => s.previewZoom);
    const previewPan = useEditorStore(s => s.previewPan);
    const setPreviewZoom = useEditorStore(s => s.setPreviewZoom);
    const setPreviewPan = useEditorStore(s => s.setPreviewPan);
    const resetPreviewView = useEditorStore(s => s.resetPreviewView);

    const setCurrentFrame = useEditorStore(s => s.setCurrentFrame);
    const setIsPlaying = useEditorStore(s => s.setIsPlaying);
    const setDuration = useEditorStore(s => s.setDuration);
    const setSceneDurations = useEditorStore(s => s.setSceneDurations);
    const setGlobalAudioClips = useEditorStore(s => s.setGlobalAudioClips);
    const setPrecompProgress = useEditorStore(s => s.setPrecompProgress);
    const setIsSeeking = useEditorStore(s => s.setIsSeeking);
    const isScrubbing = useEditorStore(s => s.isScrubbing);
    const isSeeking = useEditorStore(s => s.isSeeking);
    // Never during playback — there the canvas is already updating every frame.
    const showShimmer = useDelayedFlag(isSeeking && !isPlaying);
    const setRootNode = useEditorStore(s => s.setRootNode);
    const setBuildErrors = useEditorStore(s => s.setBuildErrors);
    const simplePlayer = useEditorStore(s => s.simplePlayer);
    const snapshotRequested = useEditorStore(s => s.snapshotRequested);
    const completeSnapshot = useEditorStore(s => s.completeSnapshot);
    const registerHotReplace = useEditorStore(s => s.registerHotReplace);

    // Bridge the dev-server `?scene` HMR signal to the live controller: register
    // the mounted player's in-place scene swap so the store's hotReplaceScene
    // (driven by window.__motionScriptSceneHot) can route an edited scene to it.
    useEffect(() => {
        registerHotReplace((scene) => frameRef.current?.hotReplaceScene(scene) ?? -1);
        return () => registerHotReplace(null);
    }, [registerHotReplace, frameRef]);

    // Read through a ref inside the callbacks below so their useCallback identity
    // doesn't change when a drag starts or stops — MotionPlayer holds them.
    const isScrubbingRef = useRef(isScrubbing);
    useEffect(() => { isScrubbingRef.current = isScrubbing; }, [isScrubbing]);

    // Same reason: simple mode is read through a ref so entering or leaving it
    // doesn't hand MotionPlayer a fresh set of callbacks.
    const simplePlayerRef = useRef(simplePlayer);
    useEffect(() => { simplePlayerRef.current = simplePlayer; }, [simplePlayer]);

    const handleLoadingChange = useCallback((loading: boolean) => {
        setIsSeeking(loading);
        if (!loading && frameRef.current) {
            // getTreeState walks the whole node tree and its result re-renders the
            // timeline's node list. Skip it mid-drag (the flush on drag end below
            // catches up) and in simple mode, where nothing consumes it; durations
            // are cheap and needed on first load.
            if (!isScrubbingRef.current && !simplePlayerRef.current) setRootNode(frameRef.current.getTreeState());
            setDuration(frameRef.current.getDuration());
            setSceneDurations(frameRef.current.getSceneDurations());
            // Beds are bounded by the measured duration, so they're re-read
            // wherever it is — not once on mount.
            setGlobalAudioClips(frameRef.current.getGlobalAudio());
        }
    }, [frameRef, setIsSeeking, setDuration, setSceneDurations, setGlobalAudioClips, setRootNode]);

    const handleBuildErrors = useCallback((errors: Parameters<typeof setBuildErrors>[0]) => {
        setBuildErrors(errors);
    }, [setBuildErrors]);

    // A scene finishing its precomp lengthens the timeline, so re-pull the same
    // durations handleLoadingChange pulls. Deliberately *not* routed through that
    // callback: it also drives `isSeeking`, and flipping the shimmer on every
    // scene that lands would strobe the preview for the whole measuring pass.
    const handlePrecompProgress = useCallback((progress: PrecompProgress) => {
        setPrecompProgress(progress);
        if (!frameRef.current) return;
        setDuration(frameRef.current.getDuration());
        setSceneDurations(frameRef.current.getSceneDurations());
        setGlobalAudioClips(frameRef.current.getGlobalAudio());
    }, [frameRef, setPrecompProgress, setDuration, setSceneDurations, setGlobalAudioClips]);

    const handleFrameChange = useCallback((frame: number) => {
        setCurrentFrame(frame);
        // The per-frame tree walk — the single biggest slice of the editor's
        // playback overhead, and the first thing simple mode drops.
        if (!isScrubbingRef.current && !simplePlayerRef.current && frameRef.current) setRootNode(frameRef.current.getTreeState());

        const duration = frameRef.current?.getDuration() ?? 0;
        const totalFrames = Math.round(duration * fps);
        if (totalFrames <= 0) return;

        if (loopMode === "scene" && sceneStartFrames.length > 0) {
            const activeSceneIndex = sceneStartFrames.reduce(
                (best, start, i) => frame >= start ? i : best, 0
            );
            const sceneStart = sceneStartFrames[activeSceneIndex] ?? 0;
            const nextSceneStart = sceneStartFrames[activeSceneIndex + 1] ?? totalFrames;
            if (frame >= nextSceneStart - 1) {
                frameRef.current?.seekWhilePlaying(sceneStart);
                return;
            }
        }

        // Wrap one frame before the end: the playback controller auto-pauses
        // the clock as soon as a tick lands on/after the last frame, so we have
        // to seek back to 0 before that happens (mirrors the scene-loop guard).
        if (loopMode === "video" && frame >= totalFrames - 1) {
            frameRef.current?.seekWhilePlaying(0);
            return;
        }

        if (frame >= totalFrames) {
            setIsPlaying(false);
        }
    }, [frameRef, fps, loopMode, sceneStartFrames, setCurrentFrame, setIsPlaying, setRootNode]);

    // Refresh the node tree once the drag ends, catching up on everything the
    // per-frame updates skipped. Edge-triggered so it can't fire on mount.
    const prevScrubbingRef = useRef(isScrubbing);
    useEffect(() => {
        if (prevScrubbingRef.current && !isScrubbing && frameRef.current) {
            setRootNode(frameRef.current.getTreeState());
        }
        prevScrubbingRef.current = isScrubbing;
    }, [isScrubbing, frameRef, setRootNode]);

    // Leaving simple mode catches up the same way a drag does: the tree wasn't
    // walked while it was on, so the timeline would otherwise show whatever
    // frame was current when it was entered.
    useEffect(() => {
        if (simplePlayer || !frameRef.current) return;
        setRootNode(frameRef.current.getTreeState());
    }, [simplePlayer, frameRef, setRootNode]);

    useEffect(() => {
        if (!snapshotRequested || !frameRef.current) return;
        frameRef.current.screenshot().then((url) => {
            if (url) {
                const link = document.createElement('a');
                link.href = url;
                link.download = `frame-${currentFrame}.png`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
            }
            completeSnapshot();
        });
    }, [snapshotRequested]);

    // Pan / zoom interaction
    const containerRef = useRef<HTMLDivElement | null>(null);
    const panState = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [containerSize, setContainerSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const update = () => {
            const r = el.getBoundingClientRect();
            setContainerSize({ w: r.width, h: r.height });
        };
        update();
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    // Ctrl + scroll to zoom. We need a non-passive listener to call preventDefault.
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        const onWheel = (e: WheelEvent) => {
            e.preventDefault();

            const rect = el.getBoundingClientRect();
            const cw = rect.width;
            const ch = rect.height;
            const baseVideoW = Math.min(cw, ch * (viewport.width / viewport.height));
            const baseVideoH = baseVideoW * (viewport.height / viewport.width);

            if (e.ctrlKey) {
                const cx = cw / 2;
                const cy = ch / 2;
                const mx = e.clientX - rect.left - cx;
                const my = e.clientY - rect.top - cy;

                const oldZoom = previewZoom;
                const factor = Math.exp(-e.deltaY * WHEEL_ZOOM_SPEED);
                const newZoom = clampZoom(oldZoom * factor);
                if (newZoom === oldZoom) return;

                const ratio = newZoom / oldZoom;
                const rawPanX = mx - (mx - previewPan.x) * ratio;
                const rawPanY = my - (my - previewPan.y) * ratio;
                const newPan = clampPan({ x: rawPanX, y: rawPanY }, cw, ch, baseVideoW * newZoom, baseVideoH * newZoom);

                setPreviewZoom(newZoom);
                setPreviewPan(newPan);
                return;
            }

            // Plain scroll pans vertically; shift+scroll pans horizontally.
            // deltaX is also honored if the device emits it (trackpads, tilt wheels).
            const dx = e.shiftKey ? e.deltaY : e.deltaX;
            const dy = e.shiftKey ? 0 : e.deltaY;
            if (dx === 0 && dy === 0) return;
            const newPan = clampPan(
                { x: previewPan.x - dx, y: previewPan.y - dy },
                cw, ch, baseVideoW * previewZoom, baseVideoH * previewZoom,
            );
            setPreviewPan(newPan);
        };

        el.addEventListener('wheel', onWheel, { passive: false });
        return () => el.removeEventListener('wheel', onWheel);
    }, [previewZoom, previewPan, viewport, setPreviewZoom, setPreviewPan]);

    // Shift+F: fit and center
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.shiftKey && e.key === 'F' && !e.ctrlKey && !e.altKey && !e.metaKey) {
                const target = e.target as HTMLElement;
                if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
                resetPreviewView();
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [resetPreviewView]);

    const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        // Only middle button
        if (e.button !== 1) return;
        // Prevent the browser's middle-click autoscroll
        e.preventDefault();
        const target = e.target as HTMLElement;
        // Don't start drag if clicking on a control inside the overlay
        if (target.closest('[data-preview-control]')) return;

        panState.current = {
            startX: e.clientX,
            startY: e.clientY,
            baseX: previewPan.x,
            baseY: previewPan.y,
        };
        setIsDragging(true);
        (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    };

    const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        const p = panState.current;
        if (!p) return;
        const dx = e.clientX - p.startX;
        const dy = e.clientY - p.startY;
        const baseVideoW = Math.min(containerSize.w, containerSize.h * (viewport.width / viewport.height));
        const baseVideoH = baseVideoW * (viewport.height / viewport.width);
        const newPan = clampPan(
            { x: p.baseX + dx, y: p.baseY + dy },
            containerSize.w, containerSize.h, baseVideoW * previewZoom, baseVideoH * previewZoom,
        );
        setPreviewPan(newPan);
    };

    const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!panState.current) return;
        panState.current = null;
        setIsDragging(false);
        try {
            (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
        } catch {
            // ignore
        }
    };

    // Ruler: figure out how big the displayed (unscaled) video is so we can
    // convert container-space px <-> viewport px. The video element uses
    // `width: min(100cqw, calc(100cqh * w/h))`, then scale(previewZoom).
    const displayedVideoWidth = Math.min(
        containerSize.w,
        containerSize.h * (viewport.width / viewport.height),
    );
    // 1 viewport px = pxPerUnit screen px (after zoom).
    const pxPerUnit = displayedVideoWidth > 0
        ? (displayedVideoWidth / viewport.width) * previewZoom
        : 0;

    // Pick a tick step (in viewport units) so labels stay readable. Grid is 50px
    // screen, so target ~100px between labels.
    const niceStep = (targetPx: number): number => {
        if (pxPerUnit <= 0) return 100;
        const raw = targetPx / pxPerUnit;
        const pow = Math.pow(10, Math.floor(Math.log10(raw)));
        const n = raw / pow;
        const mult = n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10;
        return mult * pow;
    };
    const tickStep = niceStep(100);

    const buildTicks = (sizeScreen: number, panOffset: number) => {
        if (pxPerUnit <= 0 || sizeScreen <= 0 || tickStep <= 0) return [] as { value: number; pos: number }[];
        // The viewport origin (value=0) sits at (sizeScreen/2 + panOffset) in screen px.
        // Convert the visible screen range back to viewport units to find which ticks are needed.
        const origin = sizeScreen / 2 + panOffset;
        const unitStart = -origin / pxPerUnit;
        const unitEnd = (sizeScreen - origin) / pxPerUnit;
        const ticks: { value: number; pos: number }[] = [];
        const start = Math.floor(unitStart / tickStep) * tickStep;
        const end = Math.ceil(unitEnd / tickStep) * tickStep;
        for (let v = start; v <= end; v += tickStep) {
            const pos = origin + v * pxPerUnit;
            ticks.push({ value: Math.round(v), pos });
        }
        return ticks;
    };

    // Both ruler axes are rebuilt on every render, and this component re-renders
    // on every frame — so simple mode skips the work rather than just hiding it.
    const horizontalTicks = simplePlayer ? [] : buildTicks(containerSize.w, previewPan.x)
        .filter(t => t.pos >= 16 && t.pos <= containerSize.w - 4);

    const verticalTicks = simplePlayer ? [] : buildTicks(containerSize.h, previewPan.y)
        .filter(t => t.pos >= 16 && t.pos <= containerSize.h - 4);

    return (
        <div className="relative flex-1 flex flex-col min-w-0 min-h-0">
            <div
                ref={containerRef}
                className="relative flex-1 flex items-center justify-center min-w-0 min-h-0 overflow-hidden rounded-b-lg bg-panel  select-none"
                style={{
                    containerType: 'size',
                    cursor: isDragging ? 'grabbing' : 'default',
                    ...(simplePlayer ? {} : {
                        backgroundImage:
                            'linear-gradient(to right, color-mix(in oklch, var(--timeline-grid-line) 15%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in oklch, var(--timeline-grid-line) 15%, transparent) 1px, transparent 1px)',
                        backgroundSize: `${35 * previewZoom}px ${35 * previewZoom}px`,
                        backgroundPosition: `calc(50% + ${previewPan.x}px) calc(50% + ${previewPan.y}px)`,
                    }),
                }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
            >
                {/* Top ruler */}
                <div className="pointer-events-none absolute top-0 left-0 right-0 h-5 text-[10px] tabular-nums text-muted-foreground/25">
                    {horizontalTicks.map((t) => (
                        <span
                            key={`h${t.value}`}
                            className="absolute top-0.5 -translate-x-1/2"
                            style={{ left: t.pos }}
                        >
                            {t.value}
                        </span>
                    ))}
                </div>
                {/* Left ruler */}
                <div className="pointer-events-none absolute top-0 left-0 bottom-0 w-8 text-[10px] tabular-nums text-muted-foreground/25">
                    {verticalTicks.map((t) => (
                        <span
                            key={`v${t.value}`}
                            className="absolute left-1 -translate-y-1/2"
                            style={{ top: t.pos }}
                        >
                            {t.value}
                        </span>
                    ))}
                </div>

                <div
                    className="relative ring-2 ring-border shadow-xl"
                    style={{
                        aspectRatio: `${viewport.width} / ${viewport.height}`,
                        maxWidth: '100%',
                        maxHeight: '100%',
                        width: `min(100cqw, calc(100cqh * ${viewport.width} / ${viewport.height}))`,
                        transform: `translate(${previewPan.x}px, ${previewPan.y}px) scale(${previewZoom})`,
                        transformOrigin: 'center center',
                        willChange: 'transform',
                    }}
                >
                    {/* Shown only while the rendered frame is behind the playhead,
                        so a scrub the engine keeps up with stays completely clean. */}
                    {showShimmer && (
                        <div
                            aria-hidden
                            className="pointer-events-none absolute inset-0 z-10 overflow-hidden bg-white/10"
                        >
                            <div
                                className="absolute inset-y-0 left-0 w-1/3 animate-shimmer motion-reduce:hidden
                                           bg-gradient-to-r from-transparent via-white/20 to-transparent"
                            />
                        </div>
                    )}
                    <MotionPlayer
                        ref={frameRef}
                        initialFrame={currentFrame}
                        isPlaying={isPlaying}
                        fps={fps}
                        theme={theme}
                        variables={variables}
                        audioTracks={audioTracks}
                        overlays={overlays}
                        backgrounds={backgrounds}
                        viewport={viewport}
                        scenes={scenes}
                        assets={assets}
                        speed={playbackSpeed}
                        muted={isMuted}
                        onLoadingChange={handleLoadingChange}
                        onFrameChange={handleFrameChange}
                        onBuildErrors={handleBuildErrors}
                        onPrecompProgress={handlePrecompProgress}
                    />
                </div>
            </div>
        </div>
    );
}
