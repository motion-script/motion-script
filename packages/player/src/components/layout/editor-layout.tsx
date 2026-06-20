import { useEditorStore, FrameHandleProvider } from "@/providers/editor-provider";
import { useEffect, useRef, useState } from "react";
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
import { MenuIcon } from "lucide-react";

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

    const frameRef = useRef<FrameHandle>(null);

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

    return (
        <FrameHandleProvider frameRef={frameRef}>
            <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">


                <ExportDialog
                    open={exportDialogOpen}
                    onOpenChange={handleDialogOpenChange}
                    exportState={exportState}
                />

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
                                    <VideoPreview frameRef={frameRef} />
                                    {/* In column mode the transport lives inside the
                                        timeline toolbar; in row mode it sits here under
                                        the preview (the toolbar is a narrow left column). */}
                                    {isRow && <PlaybackControls />}
                                </div>
                            );

                            const timelinePane = (
                                <div className={isRow ? "h-full min-h-0 min-w-0" : "h-full min-h-0 pb-1"}>
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

            </div>
        </FrameHandleProvider>
    );
}
