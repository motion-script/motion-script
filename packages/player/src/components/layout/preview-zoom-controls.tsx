import { useEditorStore } from '@/providers/editor-provider';

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 8;
const BUTTON_ZOOM_STEP = 0.1;

function clampZoom(z: number) {
    return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
}

export function PreviewZoomControls() {
    const previewZoom = useEditorStore(s => s.previewZoom);
    const setPreviewZoom = useEditorStore(s => s.setPreviewZoom);
    const resetPreviewView = useEditorStore(s => s.resetPreviewView);

    const zoomOut = () => setPreviewZoom(clampZoom(previewZoom - BUTTON_ZOOM_STEP));
    const zoomIn = () => setPreviewZoom(clampZoom(previewZoom + BUTTON_ZOOM_STEP));

    return (
        <div className="flex items-center gap-1 text-muted-foreground">
            <button
                type="button"
                onClick={zoomOut}
                className="h-6 w-6 flex items-center justify-center rounded-sm bg-card hover:bg-toolbar-control cursor-pointer"
                aria-label="Zoom out"
            >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="size-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
                </svg>
            </button>

            <div className="flex items-center justify-center h-6 w-12 rounded-sm bg-card text-xs tabular-nums">
                {Math.round(previewZoom * 100)}%
            </div>

            <button
                type="button"
                onClick={zoomIn}
                className="h-6 w-6 flex items-center justify-center rounded-sm bg-card hover:bg-toolbar-control cursor-pointer"
                aria-label="Zoom in"
            >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="size-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
            </button>

            <button
                type="button"
                onClick={resetPreviewView}
                className="h-6 px-2 text-xs rounded-sm bg-card hover:bg-toolbar-control cursor-pointer"
                aria-label="Reset view"
                title="Fit and center (Shift+F)"
            >
                Fit
            </button>
        </div>
    );
}
