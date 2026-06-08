import { useState, useCallback, useRef, type ChangeEvent, type CSSProperties } from "react";
import { exportScenesAsVideo } from "@motion-script/web";
import type {
    AssetManifest,
    Color,
    Scene,
    Size2D,
} from "@motion-script/core";
import { MotionPlayer, type FrameHandle } from "../src/ui/scene";

const EMPTY_MANIFEST: AssetManifest = {
    image: {},
    video: {},
    audio: {},
    font: {},
};

type Props = {
    viewport: Size2D;
    fps: number;
    theme: Record<string, Color>;
    scenes: Scene[];
    assets?: AssetManifest;

};

export function ScriptEmbed({
    viewport,
    fps,
    scenes,
    theme,
    assets = EMPTY_MANIFEST,

}: Props) {

    const frameRef = useRef<FrameHandle>(null);

    const [isPlaying, setIsPlaying] = useState(false);
    const [currentFrame, setCurrentFrame] = useState(0);
    const [isLoading, setIsLoading] = useState(false);
    const [duration, setDuration] = useState(0);
    const [exportProgress, setExportProgress] = useState<number | null>(null);

    const totalFrames = Math.max(0, Math.round(duration * fps));
    const currentTime = currentFrame / fps;

    // Reset playback when the scenes change. Adjusting state during render
    // (rather than in an effect) avoids a cascading re-render.
    const [prevScenes, setPrevScenes] = useState(scenes);
    if (scenes !== prevScenes) {
        setPrevScenes(scenes);
        setCurrentFrame(0);
        setIsPlaying(false);
        setDuration(0);
    }

    const handleLoadingChange = useCallback((loading: boolean) => {
        setIsLoading(loading);
        if (!loading && frameRef.current) {
            setDuration(frameRef.current.getDuration());
        }
    }, []);

    const handleFrameChange = useCallback((f: number) => {
        setCurrentFrame(f);
        if (totalFrames > 0 && f >= totalFrames) {
            setIsPlaying(false);
        }
    }, [totalFrames]);

    const togglePlay = () => {
        if (currentFrame >= totalFrames && !isPlaying) {
            setCurrentFrame(0);
        }
        setIsPlaying((p) => !p);
    };

    const handleSliderChange = (e: ChangeEvent<HTMLInputElement>) => {
        setCurrentFrame(Math.round(parseFloat(e.target.value) * fps));
        setIsPlaying(false);
    };

    const handleScreenshot = async () => {
        if (!frameRef.current) return;
        try {
            const dataUrl = await frameRef.current.screenshot();
            if (!dataUrl) {
                console.error("Screenshot returned undefined");
                return;
            }
            const link = document.createElement("a");
            link.href = dataUrl;
            link.download = `frame-${currentTime.toFixed(2)}s.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (error) {
            console.error("Failed to capture screenshot:", error);
        }
    };

    const handleExport = async () => {
        if (exportProgress !== null) return;
        setExportProgress(0);
        try {
            await exportScenesAsVideo({
                scenes,
                viewport,
                fps,


                onProgress: (p) => setExportProgress(p),
            });
        } catch (error) {
            console.error("Export failed:", error);
        } finally {
            setExportProgress(null);
        }
    };

    return (
        <div className="script-player-container">
            <div className="scene-wrapper">
                <MotionPlayer
                    theme={theme}
                    ref={frameRef}
                    initialFrame={currentFrame}
                    isPlaying={isPlaying}
                    fps={fps}
                    viewport={viewport}
                    scenes={scenes}
                    assets={assets}
                    onLoadingChange={handleLoadingChange}
                    onFrameChange={handleFrameChange}
                />
            </div>

            <div className="player-controls">
                <button className="play-toggle-btn" onClick={togglePlay}>
                    {isPlaying ? (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="player-icon">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5" />
                        </svg>
                    ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="player-icon ">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
                        </svg>
                    )}
                </button>

                <button className="play-toggle-btn" onClick={handleScreenshot}>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="player-icon">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
                    </svg>
                </button>

                <button
                    className="play-toggle-btn"
                    onClick={handleExport}
                    disabled={exportProgress !== null}
                >
                    {exportProgress !== null
                        ? `Exporting ${Math.round(exportProgress * 100)}%`
                        : (
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="player-icon">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                            </svg>
                        )}
                </button>

                <input
                    type="range"
                    className="time-slider"
                    min={0}
                    max={duration}
                    step={0.01}
                    value={currentTime}
                    onChange={handleSliderChange}
                    style={{ "--progress": `${duration > 0 ? (currentTime / duration) * 100 : 0}%` } as CSSProperties}
                />

                <span className="time-display">
                    {currentTime.toFixed(1)} / {duration.toFixed(1)}s
                </span>

                {isLoading && (
                    <svg className="player-icon loading-spinner" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="40 20" />
                    </svg>
                )}
            </div>
        </div>
    );
}
