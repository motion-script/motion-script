import { useEditorStore, FrameHandleProvider } from "@/providers/editor-provider";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FrameHandle } from "@motion-script/react";
import { TimelineRuler } from "@/components/timeline/timeline";
import { VideoPreview } from "./video-preview";
import { PlaybackControls } from "./playback-controls";
import { ScenePanel } from "./scene-panel";
import { useExport } from "../export/use-export";
import { ExportDialog } from "../export/export-dialog";
import { ExportButton } from "../export/export-button";
import { ErrorsButton } from "../errors/errors-button";
import { PreviewZoomControls } from "./preview-zoom-controls";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { MenuIcon, Minimize2 } from "lucide-react";

// ---------------------------------------------------------------------------
// EditorLayout — top-level grid: scene panel | (preview + timeline) fixed split.
// The split orientation follows editorStore.playerLayout:
//   "column" → preview above the timeline (default).
//   "row"    → timeline on the left, preview on the right (good for vertical
//              videos). The transport (PlaybackControls) always sits directly
//              below the video preview in either layout.
// The timeline is a fixed size (TIMELINE_FIXED); the preview fills the rest via
// a CSS-grid `1fr` track. No drag-to-resize.
// ---------------------------------------------------------------------------

export function EditorLayout() {
    const projectName = useEditorStore(s => s.projectName);
    const scenes = useEditorStore(s => s.scenes);
    const playerLayout = useEditorStore(s => s.playerLayout);
    const isFullscreen = useEditorStore(s => s.isFullscreen);
    const setIsFullscreen = useEditorStore(s => s.setIsFullscreen);

    const frameRef = useRef<FrameHandle>(null);
    const fullscreenContainerRef = useRef<HTMLDivElement | null>(null);

    // VideoPreview (and the MotionPlayer/WASM canvas it holds) must never
    // unmount when toggling fullscreen — remounting it recreates the render
    // context and can leave the canvas blank (the async asset/paint handshake
    // races the teardown of the old instance). So it's rendered exactly once
    // below and portaled into whichever slot (normal layout vs. fullscreen) is
    // currently active, rather than branching its JSX call site.
    const [videoSlot, setVideoSlot] = useState<HTMLDivElement | null>(null);

    // On mobile the fixed sidebar is replaced by a slide-in drawer so the
    // preview + timeline can use the full width. `sceneDrawerOpen` is only
    // meaningful on mobile; the drawer isn't mounted on desktop.
    const isMobile = useIsMobile();
    const [sceneDrawerOpen, setSceneDrawerOpen] = useState(false);

    // Export state and dialog
    const exportState = useExport();
    const [exportDialogOpen, setExportDialogOpen] = useState(false);

    const openExportDialog = () => {
        if (exportState.status === "idle" || exportState.status === "cancelled") {
            exportState.resetExport();
        }
        setExportDialogOpen(true);
    };

    // When dialog closes after a finished export, reset so button goes back to idle
    const handleDialogOpenChange = (open: boolean) => {
        setExportDialogOpen(open);
        if (!open && exportState.status === "finished") {
            // Small delay so the finished view is visible during close animation
            setTimeout(() => exportState.resetExport(), 300);
        }
    };

    // Initialise selectedScenes when scenes first load
    const scenesInitRef = useRef(false);
    useEffect(() => {
        if (!scenesInitRef.current && scenes.length > 0) {
            scenesInitRef.current = true;
            exportState.setSelectedScenes([...scenes]);
        }
    }, [scenes]);

    // Mirror isFullscreen with the real browser Fullscreen API so Escape / the
    // browser's own exit-fullscreen affordance also collapses our overlay.
    useEffect(() => {
        const el = fullscreenContainerRef.current;
        if (isFullscreen && el && !document.fullscreenElement) {
            el.requestFullscreen?.().catch(() => {});
        } else if (!isFullscreen && document.fullscreenElement) {
            document.exitFullscreen?.().catch(() => {});
        }
    }, [isFullscreen]);

    useEffect(() => {
        const onChange = () => {
            if (!document.fullscreenElement) setIsFullscreen(false);
        };
        document.addEventListener("fullscreenchange", onChange);
        return () => document.removeEventListener("fullscreenchange", onChange);
    }, [setIsFullscreen]);

    // Fallback exit for when requestFullscreen is unavailable/blocked (e.g. an
    // embedding iframe without allowfullscreen) — the fullscreenchange
    // listener above won't fire in that case.
    useEffect(() => {
        if (!isFullscreen) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape" && !document.fullscreenElement) setIsFullscreen(false);
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [isFullscreen, setIsFullscreen]);

    return (
        <FrameHandleProvider frameRef={frameRef}>
            <div
                ref={fullscreenContainerRef}
                className="flex flex-col h-screen bg-background text-foreground overflow-hidden"
            >

                <ExportDialog
                    open={exportDialogOpen}
                    onOpenChange={handleDialogOpenChange}
                    exportState={exportState}
                />

                {videoSlot && createPortal(<VideoPreview frameRef={frameRef} />, videoSlot)}

                {isFullscreen ? (
                    // ── Fullscreen playback view ──
                    // Just the video, the transport (mute/speed/time/loop/camera —
                    // all of PlaybackControls), and a scene-only timeline. No scene
                    // panel, no node tree.
                    <div className="relative flex flex-1 flex-col min-h-0">
                        <button
                            type="button"
                            onClick={() => setIsFullscreen(false)}
                            className="absolute top-2 right-2 z-10 h-8 w-8 flex items-center justify-center rounded-sm bg-card/80 hover:bg-toolbar-control text-muted-foreground cursor-pointer"
                            aria-label="Exit fullscreen"
                            title="Exit fullscreen (Esc)"
                        >
                            <Minimize2 className="size-4" strokeWidth={2} />
                        </button>
                        <div className="flex-1 flex flex-col min-h-0" ref={setVideoSlot} />
                        <PlaybackControls />
                        <div className="h-24 shrink-0 px-1 pb-1">
                            <TimelineRuler sceneOnly />
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-1 min-h-0">
                        {!isMobile && (
                            <div className="w-64 shrink-0  rounded-lg m-1 mr-0  bg-panel  flex flex-col min-h-0">
                                <ScenePanel />
                            </div>
                        )}
                        {isMobile && (
                            <Drawer open={sceneDrawerOpen} onOpenChange={setSceneDrawerOpen}>
                                <DrawerContent side="left" showCloseButton={false} className="p-0">
                                    <ScenePanel onSceneSelect={() => setSceneDrawerOpen(false)} />
                                </DrawerContent>
                            </Drawer>
                        )}
                        <main className="flex-1 flex flex-col min-w-0 px-1">
                            {(() => {
                                const isRow = playerLayout === "row";

                                // The preview block: header, the video preview, and the
                                // transport. The transport always sits directly below the
                                // preview, in both layouts.
                                const previewBlock = (
                                    <div className="flex flex-col h-full min-h-0 min-w-0">
                                        {/* Top bar */}
                                        <header className="grid grid-cols-3 items-center h-11 px-4 border-b mt-1 rounded-t-lg bg-panel shrink-0">
                                            <div className="flex items-center gap-2 min-w-0">
                                                {isMobile && (
                                                    <Button
                                                        variant="ghost"
                                                        size="icon-sm"
                                                        className="shrink-0 -ml-1.5"
                                                        aria-label="Open scenes"
                                                        onClick={() => setSceneDrawerOpen(true)}
                                                    >
                                                        <MenuIcon />
                                                    </Button>
                                                )}
                                                <span className="text-sm font-medium text-muted-foreground truncate">{projectName}</span>
                                            </div>
                                            <div className="flex items-center justify-center">
                                                <PreviewZoomControls />
                                            </div>
                                            <div className="flex items-center justify-end gap-2">
                                                <ErrorsButton />
                                                <ExportButton exportState={exportState} onOpenDialog={openExportDialog} />
                                            </div>
                                        </header>
                                        <div className="flex-1 flex flex-col min-h-0 min-w-0" ref={setVideoSlot} />
                                        {/* In column mode the transport lives inside the
                                            timeline toolbar; in row mode it sits here under
                                            the preview (the toolbar is a narrow left column). */}
                                        {isRow && <PlaybackControls />}
                                    </div>
                                );

                                const timelinePane = (
                                    <div className={isRow ? "h-full min-h-0 min-w-0" : "h-full min-h-0 min-w-0 pb-1"}>
                                        <TimelineRuler />
                                    </div>
                                );

                                // Fixed split via Tailwind grid fractions.
                                //   row    → two columns [timeline 2fr | preview 1fr]:
                                //            side-by-side timeline takes the majority.
                                //   column → two rows [preview 2fr / timeline 1fr]:
                                //            stacked preview takes the majority.
                                return isRow ? (
                                    <div className="grid grid-cols-[2fr_1fr] gap-1 flex-1 min-h-0">
                                        {timelinePane}
                                        {previewBlock}
                                    </div>
                                ) : (
                                    <div className="grid grid-rows-[2fr_1fr] gap-1 flex-1 min-h-0">
                                        {previewBlock}
                                        {timelinePane}
                                    </div>
                                );
                            })()}
                        </main>
                    </div>
                )}

            </div>
        </FrameHandleProvider>
    );
}
