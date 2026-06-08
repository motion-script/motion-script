import { useState } from "react";
import { useEditorStore } from "@/providers/editor-provider";
import { ErrorsDialog } from "../errors/errors-dialog";
import type { BuildError } from "@/stores/editor-store";
import { Logo } from "../theme/logo";

export function ScenePanel() {
    const scenes = useEditorStore(s => s.scenes);
    const sceneStartFrames = useEditorStore(s => s.sceneStartFrames);
    const currentFrame = useEditorStore(s => s.currentFrame);
    const setCurrentFrame = useEditorStore(s => s.setCurrentFrame);
    const setIsPlaying = useEditorStore(s => s.setIsPlaying);
    const buildErrors = useEditorStore(s => s.buildErrors);

    const [dialogErrors, setDialogErrors] = useState<BuildError[] | null>(null);

    // Clicking a scene tile pauses playback and jumps to that scene's start.
    // Pausing is required: while playing, the player runs its own frame loop and
    // a bare setCurrentFrame is immediately overwritten by the next reported frame.
    const goToScene = (startFrame: number) => {
        setIsPlaying(false);
        setCurrentFrame(startFrame);
    };

    // Derive active scene index from real start frames
    const activeIndex = sceneStartFrames.length > 0
        ? sceneStartFrames.reduce((best, start, i) => currentFrame >= start ? i : best, 0)
        : 0;

    return (
        <>
            <div className="flex flex-col h-full">
                <div className="flex items-center justify-between px-3 h-11 border-b shrink-0">
                    <div className="flex items-center gap-2 min-w-0">
                        <a href="https://motionscript.dev" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 min-w-0 group">
                            <Logo className="h-6 w-6 shrink-0 text-primary" />
                            <span className="text-sm font-semibold text-foreground truncate underline-offset-2 group-hover:underline">Motion Script</span>
                        </a>
                    </div>
                    <a href="https://github.com/motion-script/motion-script" target="_blank" rel="noopener noreferrer" className="shrink-0 text-muted-foreground hover:text-foreground transition-colors">
                        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                            <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                        </svg>
                    </a>
                </div>
                <div className="flex flex-col gap-3 p-3 overflow-y-auto flex-1 min-h-0">
                    <div className="flex items-center gap-1.5 px-0.5">
                        <span className="text-xs tabular-nums text-muted-foreground">{scenes.length}</span>
                        <span className="text-xs font-medium text-muted-foreground">{scenes.length === 1 ? "Scene" : "Scenes"}</span>
                    </div>
                    {scenes.map((s, i) => {
                        const isActive = i === activeIndex;
                        const startFrame = sceneStartFrames[i] ?? 0;
                        const sceneErrors = buildErrors.filter(e => e.sceneIndex === i);
                        const hasErrors = sceneErrors.length > 0;
                        return (
                            <button
                                key={i}
                                onClick={() => goToScene(startFrame)}
                                className={`flex flex-col gap-1.5 text-left p-2 border rounded-lg group cursor-pointer ${hasErrors
                                    ? isActive
                                        ? 'bg-destructive/8 border-destructive'
                                        : 'bg-destructive/5 border-destructive/40 hover:border-destructive'
                                    : isActive
                                        ? 'bg-card border-primary'
                                        : 'bg-card border-border hover:border-muted-foreground'
                                    }`}
                            >
                                <span className={`text-xs truncate px-0.5 ${isActive ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground'}`}>
                                    {s.name}
                                </span>

                                {hasErrors && (
                                    <span
                                        role="button"
                                        tabIndex={0}
                                        onClick={e => { e.stopPropagation(); setDialogErrors(sceneErrors); }}
                                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setDialogErrors(sceneErrors); } }}
                                        className="flex items-center gap-1 px-0.5 w-fit text-[10px] cursor-pointer hover:underline"
                                        style={{ color: "var(--destructive)" }}
                                    >
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            strokeWidth={1.5}
                                            stroke="currentColor"
                                            className="size-3 shrink-0"
                                        >
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 12.75c1.148 0 2.278.08 3.383.237 1.037.146 1.866.966 1.866 2.013 0 3.728-2.35 6.75-5.25 6.75S6.75 18.728 6.75 15c0-1.046.83-1.867 1.866-2.013A24.204 24.204 0 0 1 12 12.75Zm0 0c2.883 0 5.647.508 8.207 1.44a23.91 23.91 0 0 1-1.152 6.06M12 12.75c-2.883 0-5.647.508-8.208 1.44.125 2.104.52 4.136 1.153 6.06M12 12.75a2.25 2.25 0 0 0 2.248-2.354M12 12.75a2.25 2.25 0 0 1-2.248-2.354M12 8.25c.995 0 1.971-.08 2.922-.236.403-.066.74-.358.795-.762a3.778 3.778 0 0 0-.399-2.25M12 8.25c-.995 0-1.97-.08-2.922-.236-.402-.066-.74-.358-.795-.762a3.734 3.734 0 0 1 .4-2.253M12 8.25a2.25 2.25 0 0 0-2.248 2.146M12 8.25a2.25 2.25 0 0 1 2.248 2.146M8.683 5a6.032 6.032 0 0 1-1.155-1.002c.07-.63.27-1.222.574-1.747m.581 2.749A3.75 3.75 0 0 1 15.318 5m0 0c.427-.283.815-.62 1.155-.999a4.471 4.471 0 0 0-.575-1.752M4.921 6a24.048 24.048 0 0 0-.392 3.314c1.668.546 3.416.914 5.223 1.082M19.08 6c.205 1.08.337 2.187.392 3.314a23.882 23.882 0 0 1-5.223 1.082" />
                                        </svg>
                                        {sceneErrors.length} bug{sceneErrors.length !== 1 ? "s" : ""}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>

                <a
                    href="https://motionscript.dev/docs"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2.5 px-3 py-3 border-t shrink-0 text-sm font-medium text-muted-foreground bg-muted/30 hover:bg-muted/50 hover:text-foreground transition-colors"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-6 shrink-0">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
                    </svg>
                    <span className="hover:underline">Documentation</span>
                </a>

                <a
                    href="https://github.com/motion-script/motion-script/issues"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2.5 px-3 py-3 border-t shrink-0 text-sm font-medium text-muted-foreground bg-muted/30 hover:bg-muted/50 hover:text-foreground transition-colors"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-6 shrink-0">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                    </svg>
                    <span className="hover:underline">Report New Issue</span>
                </a>

            </div>

            <ErrorsDialog
                open={dialogErrors !== null}
                onOpenChange={open => { if (!open) setDialogErrors(null); }}
                errors={dialogErrors ?? []}
            />
        </>
    );
}
