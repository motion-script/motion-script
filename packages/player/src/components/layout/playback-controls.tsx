import * as React from "react";
import { Repeat, Repeat1 } from "lucide-react";

import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useEditorStore } from "@/providers/editor-provider";

// ─── PlaybackControls ─────────────────────────────────────────────────────────
//
// The centered transport cluster (mute, speed, prev/next frame, play/pause,
// timecode, loop, snapshot). It always sits directly below the video preview,
// regardless of the column/row player layout — see EditorLayout. It used to live
// inside EditorToolbar; it was extracted so the toolbar can show only its
// collapse + layout + zoom controls while the transport stays under the preview.

const HOLD_START_DELAY = 200;
const INITIAL_REPEAT_DELAY = 200;
const MIN_REPEAT_DELAY = 30;
const ACCELERATION_FACTOR = 0.85;

const useHold = (action: () => void) => {
  const repeatTimeout = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const loopTimeout = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const delayRef = React.useRef<number>(INITIAL_REPEAT_DELAY);

  React.useEffect(() => {
    return () => {
      if (repeatTimeout.current) clearTimeout(repeatTimeout.current as any);
      if (loopTimeout.current) clearTimeout(loopTimeout.current as any);
    };
  }, []);

  const startLoop = () => {
    const loop = () => {
      action();
      delayRef.current = Math.max(MIN_REPEAT_DELAY, delayRef.current * ACCELERATION_FACTOR);
      loopTimeout.current = setTimeout(loop, delayRef.current);
    };
    loopTimeout.current = setTimeout(loop, delayRef.current);
  };

  const clearAll = () => {
    if (repeatTimeout.current) {
      clearTimeout(repeatTimeout.current as any);
      repeatTimeout.current = null;
    }
    if (loopTimeout.current) {
      clearTimeout(loopTimeout.current as any);
      loopTimeout.current = null;
    }
    delayRef.current = INITIAL_REPEAT_DELAY;
  };

  const onPointerDown = (e?: React.MouseEvent | React.TouchEvent) => {
    if (e && 'preventDefault' in e) e.preventDefault();
    action();
    repeatTimeout.current = setTimeout(() => {
      startLoop();
    }, HOLD_START_DELAY);
  };

  const onPointerUp = () => {
    clearAll();
  };

  return {
    onMouseDown: onPointerDown,
    onMouseUp: onPointerUp,
    onMouseLeave: onPointerUp,
    onTouchStart: onPointerDown,
    onTouchEnd: onPointerUp,
    onTouchCancel: onPointerUp,
  } as const;
};

const formatDuration = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return {
    minutes: minutes.toString().padStart(2, "0"),
    seconds: secs.toString().padStart(2, "0"),
    milliseconds: ms.toString().padStart(3, "0"),
  };
};

const speedOptions = [
  { label: "0.25x", value: 0.25 },
  { label: "0.5x", value: 0.5 },
  { label: "0.75x", value: 0.75 },
  { label: "1x", value: 1 },
  { label: "1.5x", value: 1.5 },
  { label: "2x", value: 2 },
];

export const PlaybackControls: React.FC = () => {
  const isPlaying = useEditorStore((s) => s.isPlaying);
  const togglePlay = useEditorStore((s) => s.togglePlay);
  const currentTime = useEditorStore((s) => s.currentTime);
  const duration = useEditorStore((s) => s.duration);
  const requestSnapshot = useEditorStore((s) => s.requestSnapshot);
  const playbackSpeed = useEditorStore((s) => s.playbackSpeed);
  const setPlaybackSpeed = useEditorStore((s) => s.setPlaybackSpeed);
  const loopMode = useEditorStore((s) => s.loopMode);
  const cycleLoopMode = useEditorStore((s) => s.cycleLoopMode);
  const isMuted = useEditorStore((s) => s.isMuted);
  const toggleMuted = useEditorStore((s) => s.toggleMuted);
  const replay = useEditorStore((s) => s.replay);
  const setCurrentFrame = useEditorStore((s) => s.setCurrentFrame);
  const currentFrame = useEditorStore((s) => s.currentFrame);
  const fps = useEditorStore((s) => s.fps);

  const completed = duration > 0 && currentTime >= duration;

  const totalFrames = Math.round(duration * fps);
  const prevFrame = () => setCurrentFrame(Math.max(0, currentFrame - 1));
  const nextFrame = () => setCurrentFrame(Math.min(totalFrames, currentFrame + 1));

  const prevHoldHandlers = useHold(prevFrame);
  const nextHoldHandlers = useHold(nextFrame);

  const handleCenterAction = () => {
    if (completed) {
      replay();
    } else {
      togglePlay();
    }
  };

  const renderCenterIcon = () => {
    if (completed) {
      return (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-5 text-muted-foreground">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />
        </svg>
      );
    }
    if (isPlaying) {
      return (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-5 text-muted-foreground">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5" />
        </svg>
      );
    }
    return (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-5 text-muted-foreground">
        <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
      </svg>
    );
  };

  const d = formatDuration(currentTime);

  return (
    <div className="flex gap-2 h-12 items-center justify-center shrink-0">
      <button
        onClick={toggleMuted}
        className="h-8 px-2 hover:bg-toolbar-control rounded-lg cursor-pointer"
        title={isMuted ? "Unmute audio" : "Mute audio"}
      >
        {isMuted ? (
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-5 text-muted-foreground">
            <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75 19.5 12m0 0 2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-5 text-muted-foreground">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
          </svg>
        )}
      </button>

      <Select value={playbackSpeed} items={speedOptions} onValueChange={(v) => {
        if (v) setPlaybackSpeed(v);
      }}>
        <SelectTrigger className="w-24" size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {speedOptions.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>

      <button {...prevHoldHandlers} className="h-8 px-2 hover:bg-toolbar-control rounded-lg cursor-pointer">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-5 text-muted-foreground">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 16.811c0 .864-.933 1.406-1.683.977l-7.108-4.061a1.125 1.125 0 0 1 0-1.954l7.108-4.061A1.125 1.125 0 0 1 21 8.689v8.122ZM11.25 16.811c0 .864-.933 1.406-1.683.977l-7.108-4.061a1.125 1.125 0 0 1 0-1.954l7.108-4.061a1.125 1.125 0 0 1 1.683.977v8.122Z" />
        </svg>
      </button>

      <button onClick={handleCenterAction} className="h-8 px-2 hover:bg-toolbar-control rounded-lg cursor-pointer">
        {renderCenterIcon()}
      </button>

      <div className="h-8 text-foreground flex justify-center items-center tabular-nums">
        <span className="inline-block w-5 text-center">{d.minutes}</span>
        <span>:</span>
        <span className="inline-block w-5 text-center">{d.seconds}</span>
        <span>:</span>
        <span className="inline-block w-7 text-center">{d.milliseconds}</span>
      </div>

      <button {...nextHoldHandlers} className="h-8 px-2 hover:bg-toolbar-control rounded-lg cursor-pointer">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-5 text-muted-foreground">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 8.689c0-.864.933-1.406 1.683-.977l7.108 4.061a1.125 1.125 0 0 1 0 1.954l-7.108 4.061A1.125 1.125 0 0 1 3 16.811V8.69ZM12.75 8.689c0-.864.933-1.406 1.683-.977l7.108 4.061a1.125 1.125 0 0 1 0 1.954l-7.108 4.061a1.125 1.125 0 0 1-1.683-.977V8.69Z" />
        </svg>
      </button>

      <Tooltip>
        <TooltipTrigger
          onClick={cycleLoopMode}
          className={`h-8 px-2 rounded-lg cursor-pointer ${loopMode !== "off" ? 'bg-primary/10 hover:bg-primary/20' : 'hover:bg-toolbar-control'}`}
        >
          {loopMode === "scene" ? (
            <Repeat1 className="size-5 text-primary" strokeWidth={1.5} />
          ) : (
            <Repeat
              className={`size-5 ${loopMode === "video" ? "text-primary" : "text-muted-foreground"}`}
              strokeWidth={1.5}
            />
          )}
        </TooltipTrigger>
        <TooltipContent>
          {loopMode === "scene" ? "Loop Scene" : loopMode === "video" ? "Loop Video" : "No Loop"}
        </TooltipContent>
      </Tooltip>

      <button onClick={requestSnapshot} className="h-8 px-2 hover:bg-toolbar-control rounded-lg cursor-pointer">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-5 text-muted-foreground">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
        </svg>
      </button>
    </div>
  );
};

export default PlaybackControls;
