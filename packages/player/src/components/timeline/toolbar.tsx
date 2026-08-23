import * as React from "react"

import { Slider } from "@/components/ui/slider"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { PlaybackControls } from "@/components/layout/playback-controls";
import { useEditorStore } from "@/providers/editor-provider";

// EditorToolbar — the timeline's top strip. It carries the player-layout switch
// (column ⇄ row) and the timeline zoom controls. The transport (play/pause,
// speed, loop, …) lives in PlaybackControls under the video preview instead, so
// this toolbar's contents are the same in both layouts even though the
// surrounding chrome differs.
export const EditorToolbar: React.FC = () => {
  const timelineZoom = useEditorStore((s) => s.timelineZoom);
  const setTimelineZoom = useEditorStore((s) => s.setTimelineZoom);
  const playerLayout = useEditorStore((s) => s.playerLayout);
  const togglePlayerLayout = useEditorStore((s) => s.togglePlayerLayout);

  return (
    <div className="relative h-12 flex border-b border-border items-center">
      <div className="flex items-center gap-1 px-3">
        <Tooltip>
          <TooltipTrigger
            onClick={togglePlayerLayout}
            className="h-8 px-2 hover:bg-toolbar-control rounded-lg cursor-pointer flex items-center"
            aria-label={playerLayout === "column" ? "Switch to side-by-side layout" : "Switch to stacked layout"}
          >
            {playerLayout === "column" ? (
              // Stacked icon (current): preview box above a timeline bar → switches to side-by-side
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-5 text-muted-foreground">
                <rect x="3.75" y="3.75" width="16.5" height="10.5" rx="1.5" />
                <path strokeLinecap="round" d="M3.75 18.75h16.5" />
              </svg>
            ) : (
              // Side-by-side icon (current): timeline column beside a preview box → switches to stacked
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-5 text-muted-foreground">
                <path strokeLinecap="round" d="M5.25 3.75v16.5" />
                <rect x="9.75" y="3.75" width="10.5" height="16.5" rx="1.5" />
              </svg>
            )}
          </TooltipTrigger>
          <TooltipContent>
            {playerLayout === "column" ? "Side-by-side layout" : "Stacked layout"}
          </TooltipContent>
        </Tooltip>
      </div>

      {/* In column mode the transport is centered in the toolbar; in row mode
          it lives below the video preview instead (see EditorLayout). Absolutely
          centered so it stays put regardless of the left/right block widths. */}
      {playerLayout === "column" && (
        <div className="absolute left-1/2 -translate-x-1/2 pointer-events-auto">
          <PlaybackControls />
        </div>
      )}

      <div className="flex gap-2 ml-auto w-80 max-w-full min-w-0 text-muted-foreground px-4 items-center">
        {/* timelineZoom runs 0 (densest, zoomed in) → 1 (fit whole duration, zoomed out) —
            see timeline.tsx's zoom comment. So the "zoom out" (−) button raises
            timelineZoom toward 1 and "zoom in" (+) lowers it toward 0. */}
        <button onClick={() => setTimelineZoom(Math.min(1, timelineZoom + 0.1))} className="h-8 px-2 hover:bg-toolbar-control rounded-lg cursor-pointer">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="size-4 text-muted-foreground">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
          </svg>
        </button>

        <Slider className="flex-1" value={timelineZoom} step={0.01} min={0} max={1} onValueChange={(e) => {
          if (Array.isArray(e)) setTimelineZoom(e[0]);
          else setTimelineZoom(e as number);
        }} />

        <button onClick={() => setTimelineZoom(Math.max(0, timelineZoom - 0.1))} className="h-8 px-2 hover:bg-toolbar-control rounded-lg cursor-pointer">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="size-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </button>

        <div className="w-12 bg-toolbar-control font-semibold rounded-sm text-xs h-6 border border-toolbar-control-border flex items-center justify-center">
          <span>{(timelineZoom * 100).toFixed(0)}%</span>
        </div>

        <button onClick={() => setTimelineZoom(1)} className="w-8 cursor-pointer hover:bg-accent bg-toolbar-control font-semibold rounded-sm text-xs h-6 border border-toolbar-control-border flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-4 text-muted-foreground">
            <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default EditorToolbar;
