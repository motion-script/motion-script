import * as React from "react";
import { Pause, Play, RotateCcw, Volume2, VolumeX } from "lucide-react";

import { useEditorStore } from "@/providers/editor-provider";

// ─── SimpleControls ───────────────────────────────────────────────────────────
//
// The transport for `simplePlayer` mode: play/pause, a timecode, a seek bar and
// mute — nothing else. Deliberately austere, because the point of the mode is to
// leave as little React work per frame as possible next to the canvas: a plain
// `<input type="range">` rather than the Slider primitive, no tooltips, no
// waveforms, no node rows. What remains (this component and the timecode) is
// what "minimal controls" costs, and it is the baseline the full editor is
// compared against. See UiSlice.simplePlayer.

const formatTimecode = (seconds: number) => {
    const safe = Math.max(0, seconds);
    const m = Math.floor(safe / 60).toString().padStart(2, "0");
    const s = Math.floor(safe % 60).toString().padStart(2, "0");
    const ms = Math.floor((safe % 1) * 1000).toString().padStart(3, "0");
    return `${m}:${s}.${ms}`;
};

export const SimpleControls: React.FC = () => {
    const isPlaying = useEditorStore((s) => s.isPlaying);
    const togglePlay = useEditorStore((s) => s.togglePlay);
    const replay = useEditorStore((s) => s.replay);
    const currentTime = useEditorStore((s) => s.currentTime);
    const currentFrame = useEditorStore((s) => s.currentFrame);
    const duration = useEditorStore((s) => s.duration);
    const fps = useEditorStore((s) => s.fps);
    const setCurrentFrame = useEditorStore((s) => s.setCurrentFrame);
    const setIsPlaying = useEditorStore((s) => s.setIsPlaying);
    const isMuted = useEditorStore((s) => s.isMuted);
    const toggleMuted = useEditorStore((s) => s.toggleMuted);

    const totalFrames = Math.max(0, Math.round(duration * fps));
    const completed = duration > 0 && currentTime >= duration;

    // Seeking pauses first: while playing, the player runs its own frame loop and
    // a bare setCurrentFrame is immediately overwritten by the next reported
    // frame (same reason ScenePanel pauses before jumping to a scene).
    const seek = (frame: number) => {
        setIsPlaying(false);
        setCurrentFrame(Math.max(0, Math.min(totalFrames, frame)));
    };

    return (
        <div className="flex items-center gap-3 h-12 px-4 shrink-0">
            <button
                onClick={completed ? replay : togglePlay}
                className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-toolbar-control cursor-pointer text-muted-foreground"
                title={completed ? "Replay" : isPlaying ? "Pause" : "Play"}
            >
                {completed ? (
                    <RotateCcw className="size-5" strokeWidth={1.5} />
                ) : isPlaying ? (
                    <Pause className="size-5" strokeWidth={1.5} />
                ) : (
                    <Play className="size-5" strokeWidth={1.5} />
                )}
            </button>

            <span className="text-sm tabular-nums text-foreground shrink-0">
                {formatTimecode(currentTime)}
            </span>

            <input
                type="range"
                min={0}
                max={Math.max(1, totalFrames)}
                step={1}
                value={Math.min(currentFrame, totalFrames)}
                onChange={(e) => seek(Number(e.target.value))}
                aria-label="Seek"
                className="flex-1 min-w-0 h-1 accent-primary cursor-pointer"
            />

            <span className="text-sm tabular-nums text-muted-foreground shrink-0">
                {formatTimecode(duration)}
            </span>

            <button
                onClick={toggleMuted}
                className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-toolbar-control cursor-pointer text-muted-foreground"
                title={isMuted ? "Unmute audio" : "Mute audio"}
            >
                {isMuted ? <VolumeX className="size-5" strokeWidth={1.5} /> : <Volume2 className="size-5" strokeWidth={1.5} />}
            </button>
        </div>
    );
};

export default SimpleControls;
