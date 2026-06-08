import type { BuildError } from "@/stores/editor-store";

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    errors: BuildError[];
};

export function ErrorsDialog({ open, onOpenChange, errors }: Props) {
    if (!open) return null;

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 z-40 bg-black/50"
                onClick={() => onOpenChange(false)}
            />

            {/* Panel */}
            <div className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg max-h-[80vh] flex flex-col rounded-xl bg-popover text-popover-foreground border border-border shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
                    <div className="flex items-center gap-2">
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            strokeWidth={1.5}
                            stroke="currentColor"
                            className="size-4 text-destructive shrink-0"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 12.75c1.148 0 2.278.08 3.383.237 1.037.146 1.866.966 1.866 2.013 0 3.728-2.35 6.75-5.25 6.75S6.75 18.728 6.75 15c0-1.046.83-1.867 1.866-2.013A24.204 24.204 0 0 1 12 12.75Zm0 0c2.883 0 5.647.508 8.207 1.44a23.91 23.91 0 0 1-1.152 6.06M12 12.75c-2.883 0-5.647.508-8.208 1.44.125 2.104.52 4.136 1.153 6.06M12 12.75a2.25 2.25 0 0 0 2.248-2.354M12 12.75a2.25 2.25 0 0 1-2.248-2.354M12 8.25c.995 0 1.971-.08 2.922-.236.403-.066.74-.358.795-.762a3.778 3.778 0 0 0-.399-2.25M12 8.25c-.995 0-1.97-.08-2.922-.236-.402-.066-.74-.358-.795-.762a3.734 3.734 0 0 1 .4-2.253M12 8.25a2.25 2.25 0 0 0-2.248 2.146M12 8.25a2.25 2.25 0 0 1 2.248 2.146M8.683 5a6.032 6.032 0 0 1-1.155-1.002c.07-.63.27-1.222.574-1.747m.581 2.749A3.75 3.75 0 0 1 15.318 5m0 0c.427-.283.815-.62 1.155-.999a4.471 4.471 0 0 0-.575-1.752M4.921 6a24.048 24.048 0 0 0-.392 3.314c1.668.546 3.416.914 5.223 1.082M19.08 6c.205 1.08.337 2.187.392 3.314a23.882 23.882 0 0 1-5.223 1.082" />
                        </svg>
                        <span className="text-sm font-medium">
                            {errors.length} Build Error{errors.length !== 1 ? "s" : ""}
                        </span>
                    </div>
                    <button
                        onClick={() => onOpenChange(false)}
                        className="flex items-center justify-center h-6 w-6 rounded-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
                        aria-label="Close"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="size-3.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Error list */}
                <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
                    {errors.map((err, i) => (
                        <div
                            key={i}
                            className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 flex flex-col gap-1.5"
                        >
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-medium text-destructive">{err.sceneName}</span>
                            </div>
                            <p className="text-xs text-foreground font-mono break-all">{err.message}</p>
                            {err.stack && (
                                <details className="mt-1">
                                    <summary className="text-xs text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors">
                                        Stack trace
                                    </summary>
                                    <pre className="mt-1.5 text-[10px] text-muted-foreground font-mono whitespace-pre-wrap break-all leading-relaxed">
                                        {err.stack}
                                    </pre>
                                </details>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </>
    );
}
