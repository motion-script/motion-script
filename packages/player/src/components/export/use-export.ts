import { useCallback, useRef, useState } from "react";
import { Scene } from "@motion-script/core";
import { exportScenesAsVideo } from "@motion-script/web";
import { useEditorStore } from "@/providers/editor-provider";

export type ExportStatus = "idle" | "exporting" | "finished" | "cancelled";

export type SceneExportProgress = {
    sceneIndex: number;
    progress: number; // 0–1
    done: boolean;
};

export type UseExportReturn = {
    status: ExportStatus;
    totalProgress: number;
    sceneProgresses: SceneExportProgress[];
    selectedScenes: Scene[];
    setSelectedScenes: (scenes: Scene[]) => void;
    exportIndividually: boolean;
    setExportIndividually: (v: boolean) => void;
    exportScale: number;
    setExportScale: (v: number) => void;
    startExport: () => Promise<void>;
    cancelExport: () => void;
    resetExport: () => void;
};

function buildFilename(projectName: string): string {
    const now = new Date();
    const date = now.toISOString().slice(0, 10); // YYYY-MM-DD
    const time = now.toTimeString().slice(0, 8).replace(/:/g, "-"); // HH-MM-SS
    const slug = projectName.trim().replace(/\s+/g, "_") || "export";
    return `${slug}_${date}_${time}.mp4`;
}

export function useExport(): UseExportReturn {
    const scenes = useEditorStore(s => s.scenes);
    const assets = useEditorStore(s => s.assets);
    const viewport = useEditorStore(s => s.viewport);
    const fps = useEditorStore(s => s.fps);
    const projectName = useEditorStore(s => s.projectName);

    const [status, setStatus] = useState<ExportStatus>("idle");
    const [totalProgress, setTotalProgress] = useState(0);
    const [sceneProgresses, setSceneProgresses] = useState<SceneExportProgress[]>([]);
    const [selectedScenes, setSelectedScenes] = useState<Scene[]>([]);
    const [exportIndividually, setExportIndividually] = useState(false);
    const [exportScale, setExportScale] = useState(1);

    const abortControllerRef = useRef<AbortController | null>(null);

    const resetExport = useCallback(() => {
        setStatus("idle");
        setTotalProgress(0);
        setSceneProgresses([]);
        setSelectedScenes([...scenes]);
    }, [scenes]);

    const cancelExport = useCallback(() => {
        abortControllerRef.current?.abort();
    }, []);

    const startExport = useCallback(async () => {
        if (status === "exporting" || selectedScenes.length === 0) return;

        const controller = new AbortController();
        abortControllerRef.current = controller;

        const scenesToExport = selectedScenes;
        const filename = buildFilename(projectName);
        const initialProgresses: SceneExportProgress[] = scenesToExport.map((_, i) => ({
            sceneIndex: i,
            progress: 0,
            done: false,
        }));

        setStatus("exporting");
        setTotalProgress(0);
        setSceneProgresses(initialProgresses);

        try {
            if (exportIndividually) {
                for (let i = 0; i < scenesToExport.length; i++) {
                    await exportScenesAsVideo({
                        scenes: [scenesToExport[i]],
                        viewport,
                        fps,
                        scale: exportScale,
                        filename: scenesToExport.length > 1
                            ? filename.replace(".mp4", `_${i + 1}.mp4`)
                            : filename,
                        manifest: assets,
                        signal: controller.signal,
                        onProgress: (p) => {
                            setSceneProgresses(prev => prev.map((sp, idx) =>
                                idx === i ? { ...sp, progress: p, done: p >= 1 } : sp
                            ));
                            const base = i / scenesToExport.length;
                            setTotalProgress(base + p / scenesToExport.length);
                        },
                    });
                }
            } else {
                // For combined export, track total frames across all scenes
                const totalScenes = scenesToExport.length;
                await exportScenesAsVideo({
                    scenes: scenesToExport,
                    viewport,
                    fps,
                    scale: exportScale,
                    filename,
                    manifest: assets,
                    signal: controller.signal,
                    onProgress: (p) => {
                        setTotalProgress(p);
                        // Approximate per-scene progress: distribute evenly
                        setSceneProgresses(prev => prev.map((sp, i) => {
                            const sceneStart = i / totalScenes;
                            const sceneEnd = (i + 1) / totalScenes;
                            const sceneP = Math.max(0, Math.min(1, (p - sceneStart) / (sceneEnd - sceneStart)));
                            return { ...sp, progress: sceneP, done: p >= sceneEnd };
                        }));
                    },
                });
            }
            setStatus("finished");
            setTotalProgress(1);
            setSceneProgresses(prev => prev.map(sp => ({ ...sp, progress: 1, done: true })));
        } catch (err) {
            if ((err as Error)?.name === "AbortError") {
                setStatus("cancelled");
            } else {
                setStatus("idle");
            }
        }
    }, [status, selectedScenes, exportIndividually, exportScale, viewport, fps, assets, projectName]);

    return {
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
    };
}
