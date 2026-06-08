import { useEditorStore, FrameHandleProvider } from "@/providers/editor-provider";
import { useEffect, useRef, useState } from "react";
import { FrameHandle } from "@motion-script/react";
import { TimelineRuler } from "@/components/timeline/timeline";
import { VideoPreview } from "./video-preview";
import { ScenePanel } from "./scene-panel";
import { useExport } from "../export/use-export";
import { ExportDialog } from "../export/export-dialog";
import { ExportButton } from "../export/export-button";
import { ErrorsButton } from "../errors/errors-button";
import { PreviewZoomControls } from "./preview-zoom-controls";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import type { PanelImperativeHandle } from "react-resizable-panels";

// Collapsed timeline shows only the toolbar (h-12), ruler row and scene row.
const TIMELINE_COLLAPSED_HEIGHT = "112px";

// ---------------------------------------------------------------------------
// EditorLayout — top-level grid: scene panel | (preview / timeline) resizable
// vertical split. The timeline panel's collapsed state is driven both ways:
// editorStore.timelineCollapsed <-> the resizable panel's own collapse/expand,
// so the toolbar's collapse arrow and the panel's drag handle stay in sync
// (see the effect below and `onResize` on the timeline ResizablePanel).
// ---------------------------------------------------------------------------

export function EditorLayout() {
    const projectName = useEditorStore(s => s.projectName);
    const scenes = useEditorStore(s => s.scenes);
    const timelineCollapsed = useEditorStore(s => s.timelineCollapsed);
    const setTimelineCollapsed = useEditorStore(s => s.setTimelineCollapsed);

    const frameRef = useRef<FrameHandle>(null);
    const timelinePanelRef = useRef<PanelImperativeHandle>(null);

    // Drive the resizable panel from the collapse state (toolbar arrow / store).
    useEffect(() => {
        const panel = timelinePanelRef.current;
        if (!panel) return;
        if (timelineCollapsed && !panel.isCollapsed()) panel.collapse();
        else if (!timelineCollapsed && panel.isCollapsed()) panel.expand();
    }, [timelineCollapsed]);

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
                    <div className="w-64 shrink-0  rounded-lg m-1 mr-0  bg-panel  flex flex-col min-h-0">
                        <ScenePanel />
                    </div>
                    <main className="flex-1 flex flex-col min-w-0 px-1">
                        <ResizablePanelGroup orientation="vertical" className="flex-1 min-h-0">
                            <ResizablePanel defaultSize={70} minSize={20} className="flex flex-col h-full min-h-0">
                                {/* Top bar */}
                                <header className="grid grid-cols-3 items-center h-11 px-4 border-b mt-1 rounded-t-lg bg-panel shrink-0">

                                    <div className="flex items-center min-w-0">
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
                            </ResizablePanel>
                            <ResizableHandle withHandle className="my-1 bg-transparent" />
                            <ResizablePanel
                                panelRef={timelinePanelRef}
                                defaultSize={30}
                                minSize={10}
                                collapsible
                                collapsedSize={TIMELINE_COLLAPSED_HEIGHT}
                                onResize={() => {
                                    const collapsed = timelinePanelRef.current?.isCollapsed() ?? false;
                                    if (collapsed !== timelineCollapsed) {
                                        setTimelineCollapsed(collapsed);
                                    }
                                }}
                                className="h-full min-h-0 pb-1"
                            >
                                <TimelineRuler />
                            </ResizablePanel>
                        </ResizablePanelGroup>
                    </main>
                </div>

            </div>
        </FrameHandleProvider>
    );
}
