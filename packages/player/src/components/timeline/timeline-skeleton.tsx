import { NODE_LIST_WIDTH, NODE_ROW_HEIGHT, RULER_HEIGHT, SCENE_ROW_HEIGHT } from "./constants";
import { useEditorStore } from "@/providers/editor-provider";

/**
 * Stands in for the timeline while the background precomp is still measuring.
 *
 * Scenes are measured one at a time so the preview can paint almost immediately,
 * but that means the timeline's length is only known progressively. Showing the
 * real timeline during that window meant watching it visibly grow, scene by
 * scene, with the ruler and every bar shifting underneath the cursor — motion
 * that reads as jank rather than progress, and a timeline that is actively
 * misleading (it looks complete at every intermediate step).
 *
 * A skeleton says "not ready yet" honestly, holds the layout steady, and is
 * replaced in one step by the finished timeline.
 */
export function TimelineSkeleton() {
    const { measuredScenes, totalScenes } = useEditorStore((s) => s.precompProgress);

    // Enough rows to fill a typical panel without implying a real node count.
    const rows = 7;

    return (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden" aria-busy="true">
            {/* Ruler band, matching the real header's height so nothing shifts on swap. */}
            <div className="flex shrink-0 border-b border-border" style={{ height: RULER_HEIGHT }}>
                <div
                    className="shrink-0 border-r border-border bg-panel flex items-center px-3"
                    style={{ width: NODE_LIST_WIDTH, minWidth: NODE_LIST_WIDTH }}
                >
                    <span className="text-xs tabular-nums text-muted-foreground" aria-live="polite">
                        {totalScenes > 0
                            ? `Measuring scenes ${measuredScenes}/${totalScenes}`
                            : "Measuring scenes"}
                    </span>
                </div>
                <div className="flex-1 flex items-center gap-6 px-4">
                    {Array.from({ length: 8 }, (_, i) => (
                        <Bar key={i} className="h-2 w-6" />
                    ))}
                </div>
            </div>

            {/* Scene band. */}
            <div className="flex shrink-0 border-b border-border" style={{ height: SCENE_ROW_HEIGHT }}>
                <div
                    className="shrink-0 border-r border-border bg-panel"
                    style={{ width: NODE_LIST_WIDTH, minWidth: NODE_LIST_WIDTH }}
                />
                <div className="flex-1 flex items-center gap-2 px-2">
                    {/* One placeholder per scene — the count is known up front even
                        though the durations are not, so widths are uniform rather
                        than pretending to show real proportions. */}
                    {Array.from({ length: Math.max(totalScenes, 1) }, (_, i) => (
                        <Bar key={i} className="h-4 flex-1" delayMs={i * 90} />
                    ))}
                </div>
            </div>

            {/* Node rows. */}
            <div className="flex-1 flex min-h-0 overflow-hidden">
                <div
                    className="shrink-0 border-r border-border bg-panel py-1"
                    style={{ width: NODE_LIST_WIDTH, minWidth: NODE_LIST_WIDTH }}
                >
                    {Array.from({ length: rows }, (_, i) => (
                        <div key={i} className="flex items-center px-3" style={{ height: NODE_ROW_HEIGHT }}>
                            {/* Varied widths so it reads as a tree rather than a grid. */}
                            <Bar className="h-2" style={{ width: `${40 + ((i * 17) % 45)}%` }} delayMs={i * 70} />
                        </div>
                    ))}
                </div>
                <div className="flex-1 py-1 px-2">
                    {Array.from({ length: rows }, (_, i) => (
                        <div key={i} className="flex items-center" style={{ height: NODE_ROW_HEIGHT }}>
                            <Bar
                                className="h-3"
                                style={{ width: `${25 + ((i * 23) % 55)}%`, marginLeft: `${(i * 11) % 30}%` }}
                                delayMs={i * 70}
                            />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

/**
 * One shimmering placeholder. `delayMs` staggers neighbours so the panel pulses
 * as a wave instead of flashing in unison, and `motion-reduce` drops the
 * animation entirely for anyone who has asked for less movement.
 */
function Bar({
    className = "",
    style,
    delayMs = 0,
}: {
    className?: string;
    style?: React.CSSProperties;
    delayMs?: number;
}) {
    return (
        <div
            className={`rounded-full bg-muted animate-pulse motion-reduce:animate-none ${className}`}
            style={{ animationDelay: `${delayMs}ms`, ...style }}
        />
    );
}
