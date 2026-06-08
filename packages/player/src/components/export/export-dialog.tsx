import { useEditorStore } from "@/providers/editor-provider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TableBody, TableCell, TableHead, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { UseExportReturn } from "./use-export";

// ---------------------------------------------------------------------------
// Scene status icon
// ---------------------------------------------------------------------------

function SceneStatusIcon({ progress, done, selected }: { progress: number; done: boolean; selected: boolean }) {
    if (!selected) {
        return (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-4 text-muted-foreground/30">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
        );
    }
    if (done) {
        return (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-4 text-emerald-600 dark:text-emerald-500">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
        );
    }
    if (progress > 0) {
        // Actively rendering
        return (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-4 text-primary">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
        );
    }
    // Queued but not started
    return (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-4 text-muted-foreground">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </svg>
    );
}

// ---------------------------------------------------------------------------
// Per-scene progress bar
// ---------------------------------------------------------------------------

function SceneProgressBar({ progress, done }: { progress: number; done: boolean }) {
    const pct = Math.round(progress * 100);
    return (
        <div className="flex items-center gap-2 w-full">
            <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
                <div
                    className={`h-full rounded-full transition-[width] duration-150 ${done ? "bg-emerald-600/70 dark:bg-emerald-500/70" : "bg-muted-foreground/50"}`}
                    style={{ width: `${pct}%` }}
                />
            </div>
            <span className="text-xs tabular-nums text-muted-foreground w-8 text-right">{pct}%</span>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Finished view
// ---------------------------------------------------------------------------

function FinishedView({ onClose, onExportAgain }: { onClose: () => void; onExportAgain: () => void }) {
    return (
        <div className="flex flex-col items-center justify-center gap-6 py-10 px-6">
            <div className="flex flex-col items-center gap-2">
                <div className="w-12 h-12 rounded-full bg-emerald-600/10 dark:bg-emerald-500/10 flex items-center justify-center">
                    <svg className="w-6 h-6 text-emerald-600 dark:text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                </div>
                <span className="text-base font-medium">Export Complete</span>
                <span className="text-xs text-muted-foreground">Your video has been downloaded.</span>
            </div>
            <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
                <Button size="sm" onClick={onExportAgain}>Export Again</Button>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// ExportDialog
// ---------------------------------------------------------------------------

type ExportDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    exportState: UseExportReturn;
};

export function ExportDialog({ open, onOpenChange, exportState }: ExportDialogProps) {
    const scenes = useEditorStore(s => s.scenes);
    const viewport = useEditorStore(s => s.viewport);
    const buildErrors = useEditorStore(s => s.buildErrors);
    const sceneStartFrames = useEditorStore(s => s.sceneStartFrames);
    const fps = useEditorStore(s => s.fps);
    const totalDuration = useEditorStore(s => s.duration);

    const {
        status,
        totalProgress,
        sceneProgresses,
        selectedScenes,
        setSelectedScenes,
        exportIndividually,
        setExportIndividually,
        exportScale,
        setExportScale,
        startExport,
        cancelExport,
        resetExport,
    } = exportState;

    const isExporting = status === "exporting";
    const isFinished = status === "finished";
    const totalPct = Math.round(totalProgress * 100);

    const selectedDurationSecs = selectedScenes.reduce((sum, scene) => {
        const i = scenes.indexOf(scene);
        if (i < 0) return sum;
        const start = sceneStartFrames[i] ?? 0;
        const end = sceneStartFrames[i + 1] ?? Math.round(totalDuration * fps);
        return sum + (end - start) / fps;
    }, 0);
    const formatDuration = (s: number) => {
        const m = Math.floor(s / 60);
        const sec = (s % 60).toFixed(1);
        return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg flex flex-col gap-0 p-0 overflow-hidden">
                {isFinished ? (
                    <FinishedView
                        onClose={() => onOpenChange(false)}
                        onExportAgain={resetExport}
                    />
                ) : (
                    <>
                        <DialogHeader className="px-4 pt-4 pb-3">
                            <DialogTitle>Export Scenes</DialogTitle>
                        </DialogHeader>

                        {/* Settings above table */}
                        <div className="px-4 pb-3 flex flex-col gap-3 border-b">
                            <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2">
                                    <Checkbox
                                        id="export-individually"
                                        checked={exportIndividually}
                                        onCheckedChange={(v) => setExportIndividually(!!v)}
                                        disabled={isExporting}
                                    />
                                    <label
                                        htmlFor="export-individually"
                                        className="text-xs text-muted-foreground cursor-pointer select-none"
                                    >
                                        Export individually
                                    </label>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-muted-foreground">Scale</span>
                                    <Select value={String(exportScale)} onValueChange={(v) => setExportScale(Number(v))} disabled={isExporting}>
                                        <SelectTrigger size="sm" className="w-20">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="0.5">0.5×</SelectItem>
                                            <SelectItem value="1">1×</SelectItem>
                                            <SelectItem value="1.5">1.5×</SelectItem>
                                            <SelectItem value="2">2×</SelectItem>
                                            <SelectItem value="3">3×</SelectItem>
                                            <SelectItem value="4">4×</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <span className="text-xs text-muted-foreground tabular-nums">
                                        {Math.round(viewport.width * exportScale)}×{Math.round(viewport.height * exportScale)}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Scenes table — datatable style */}
                        <div className="px-4 py-3">
                            <div className="rounded-lg border border-border bg-background overflow-hidden flex flex-col">
                                {/* Fixed header — rendered outside the scroll container */}
                                <table className="w-full text-sm">
                                    <thead className="[&_tr]:border-b">
                                        <TableRow>
                                            <TableHead className="w-10">
                                                {!isExporting && (
                                                    <Checkbox
                                                        checked={scenes.length > 0 && selectedScenes.length === scenes.length}
                                                        indeterminate={selectedScenes.length > 0 && selectedScenes.length < scenes.length}
                                                        onCheckedChange={(checked) => {
                                                            setSelectedScenes(checked ? [...scenes] : []);
                                                        }}
                                                    />
                                                )}
                                            </TableHead>
                                            <TableHead>Scene</TableHead>
                                            {isExporting && <TableHead className="pr-3">Progress</TableHead>}
                                        </TableRow>
                                    </thead>
                                </table>

                                {/* Scrollable body only */}
                                <div className="overflow-y-auto" style={{ maxHeight: 200 }}>
                                    <table className="w-full text-sm">
                                        <TableBody>
                                            {scenes.map((scene, i) => {
                                                const isSelected = selectedScenes.includes(scene);
                                                const sceneIdx = selectedScenes.indexOf(scene);
                                                const sp = sceneProgresses[sceneIdx];
                                                const hasErrors = buildErrors.some(e => e.sceneIndex === i);
                                                return (
                                                    <TableRow
                                                        key={i}
                                                        data-state={!isExporting && isSelected && !hasErrors ? "selected" : undefined}
                                                        className={
                                                            hasErrors
                                                                ? "bg-destructive/8 hover:bg-destructive/8"
                                                                : isExporting
                                                                    ? sp?.done
                                                                        ? "bg-emerald-600/15 dark:bg-emerald-500/15"
                                                                        : sp && sp.progress > 0
                                                                            ? "bg-primary/5"
                                                                            : undefined
                                                                    : "cursor-pointer"
                                                        }
                                                        onClick={!isExporting && !hasErrors ? () => {
                                                            setSelectedScenes(
                                                                isSelected
                                                                    ? selectedScenes.filter(s => s !== scene)
                                                                    : [...selectedScenes, scene]
                                                            );
                                                        } : undefined}
                                                    >
                                                        <TableCell className="w-10" onClick={e => e.stopPropagation()}>
                                                            {hasErrors ? (
                                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-4 text-destructive">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 12.75c1.148 0 2.278.08 3.383.237 1.037.146 1.866.966 1.866 2.013 0 3.728-2.35 6.75-5.25 6.75S6.75 18.728 6.75 15c0-1.046.83-1.867 1.866-2.013A24.204 24.204 0 0 1 12 12.75Zm0 0c2.883 0 5.647.508 8.207 1.44a23.91 23.91 0 0 1-1.152 6.06M12 12.75c-2.883 0-5.647.508-8.208 1.44.125 2.104.52 4.136 1.153 6.06M12 12.75a2.25 2.25 0 0 0 2.248-2.354M12 12.75a2.25 2.25 0 0 1-2.248-2.354M12 8.25c.995 0 1.971-.08 2.922-.236.403-.066.74-.358.795-.762a3.778 3.778 0 0 0-.399-2.25M12 8.25c-.995 0-1.97-.08-2.922-.236-.402-.066-.74-.358-.795-.762a3.734 3.734 0 0 1 .4-2.253M12 8.25a2.25 2.25 0 0 0-2.248 2.146M12 8.25a2.25 2.25 0 0 1 2.248 2.146M8.683 5a6.032 6.032 0 0 1-1.155-1.002c.07-.63.27-1.222.574-1.747m.581 2.749A3.75 3.75 0 0 1 15.318 5m0 0c.427-.283.815-.62 1.155-.999a4.471 4.471 0 0 0-.575-1.752M4.921 6a24.048 24.048 0 0 0-.392 3.314c1.668.546 3.416.914 5.223 1.082M19.08 6c.205 1.08.337 2.187.392 3.314a23.882 23.882 0 0 1-5.223 1.082" />
                                                                </svg>
                                                            ) : isExporting ? (
                                                                <SceneStatusIcon
                                                                    progress={sp?.progress ?? 0}
                                                                    done={sp?.done ?? false}
                                                                    selected={isSelected}
                                                                />
                                                            ) : (
                                                                <Checkbox
                                                                    checked={isSelected}
                                                                    onCheckedChange={(checked) => {
                                                                        setSelectedScenes(
                                                                            checked
                                                                                ? [...selectedScenes, scene]
                                                                                : selectedScenes.filter(s => s !== scene)
                                                                        );
                                                                    }}
                                                                />
                                                            )}
                                                        </TableCell>
                                                        <TableCell className={`text-sm ${hasErrors ? "text-destructive" : ""}`}>{scene.name}</TableCell>
                                                        {isExporting && (
                                                            <TableCell className="pr-3 min-w-35">
                                                                {isSelected && sp ? (
                                                                    <SceneProgressBar progress={sp.progress} done={sp.done} />
                                                                ) : (
                                                                    <span className="text-xs text-muted-foreground">—</span>
                                                                )}
                                                            </TableCell>
                                                        )}
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                    </table>
                                </div>

                                {/* Table footer — selection count only */}
                                <div className="flex items-center border-t border-border bg-muted/20 px-3 py-2">
                                    <span className="text-xs text-muted-foreground">
                                        {selectedScenes.length} of {scenes.length} selected
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Dialog footer */}
                        <DialogFooter className="px-4 py-3 mx-0 mb-0 rounded-b-xl border-t bg-muted/50">
                            <div className="flex items-center gap-2 w-full">
                                {isExporting ? (
                                    <>
                                        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                                            <div
                                                className="h-full rounded-full bg-primary transition-[width] duration-150"
                                                style={{ width: `${totalPct}%` }}
                                            />
                                        </div>
                                        <span className="text-xs tabular-nums text-muted-foreground w-8 text-right shrink-0">{totalPct}%</span>
                                        <Button variant="destructive" size="sm" onClick={cancelExport}>
                                            Cancel
                                        </Button>
                                    </>
                                ) : (
                                    <div className="flex items-center justify-between w-full">
                                        <span className="text-xs text-muted-foreground tabular-nums">
                                            {formatDuration(selectedDurationSecs)}
                                        </span>
                                        <div className="flex items-center gap-2">
                                            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                                                Cancel
                                            </Button>
                                            <Button
                                                size="sm"
                                                onClick={startExport}
                                                disabled={selectedScenes.length === 0}
                                            >
                                                Export
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </DialogFooter>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}
