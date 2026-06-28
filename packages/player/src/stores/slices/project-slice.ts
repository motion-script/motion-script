import type { AssetManifest, ProjectConfig, Scene, Size2D, Theme, Variables } from "@motion-script/core";

import type { SliceCreator } from "./types";

/**
 * Static project config (scenes/theme/viewport/fps/assets) plus the lifecycle
 * that mutates it: reloading a project (`resetConfig`) and the dev-server
 * `?scene` HMR in-place scene swap (`hotReplaceScene`). `_pendingSceneIndex`
 * lives here because both `resetConfig` (sets it) and the timeline's
 * `setSceneDurations` (consumes it) coordinate through it across reloads.
 */
export type ProjectSlice = {
    scenes: Scene[];
    projectName: string;
    theme: Theme;
    variables: Variables;
    viewport: Size2D;
    fps: number;
    assets: AssetManifest;

    resetConfig: (config: ProjectConfig) => void;

    /**
     * Bridge the dev-server `?scene` HMR signal to the live player. The video
     * preview registers the mounted controller's in-place scene swap here; the
     * `?scene` wrapper (via `window.__motionScriptSceneHot`) calls
     * {@link hotReplaceScene} with the freshly-edited instance.
     */
    _hotReplace: ((scene: Scene) => number) | null;
    registerHotReplace: (fn: ((scene: Scene) => number) | null) => void;
    hotReplaceScene: (scene: Scene) => void;

    _pendingSceneIndex: number | null;
};

export const createProjectSlice = (
    config: ProjectConfig,
    assets: AssetManifest,
): SliceCreator<ProjectSlice> => (set, get) => ({
    scenes: config.scenes,
    projectName: config.name,
    viewport: config.viewport,
    fps: config.fps,
    theme: config.theme ?? {},
    variables: config.variables ?? {},
    assets,

    _pendingSceneIndex: null,

    _hotReplace: null,
    registerHotReplace: (fn) => { set(() => ({ _hotReplace: fn })); },
    hotReplaceScene: (scene) => {
        const { scenes, _hotReplace } = get();
        if (!_hotReplace) return;
        // Swap the controller's scene in place (per-scene precomp re-run, no
        // surface teardown → no flash). Returns the matched slot index.
        const index = _hotReplace(scene);
        if (index < 0) return;
        // Keep the store's scene list pointing at the live instance, but do
        // NOT replace the array reference — the video preview passes `scenes`
        // to MotionPlayer, whose heavy effect would otherwise tear the whole
        // controller down (and flash). Mutating in place is exactly what we
        // want: same name/count/order, just the edited instance swapped.
        scenes[index] = scene;
    },

    resetConfig: (newConfig) => {
        // Reloading a project must keep the user looking at "the same" scene even
        // though scene order/count/durations may have changed. We resolve the
        // scene by name (falling back to index) but can't compute its frame yet —
        // durations for the new config aren't known until the player re-renders —
        // so we stash `_pendingSceneIndex` and let `setSceneDurations` finish the
        // jump once real start frames exist.
        const { scenes, currentFrame, sceneStartFrames } = get();

        // Determine which scene was active before the reload
        const activeIndex = sceneStartFrames.length > 0
            ? sceneStartFrames.reduce((best, start, i) => currentFrame >= start ? i : best, 0)
            : 0;
        const activeName = scenes[activeIndex]?.name;

        // Try to find the same scene by name in the new config; fall back to same index
        const newScenes = newConfig.scenes;
        const newIndex = activeName
            ? (newScenes.findIndex(s => s.name === activeName) ?? -1) === -1
                ? Math.min(activeIndex, newScenes.length - 1)
                : newScenes.findIndex(s => s.name === activeName)
            : Math.min(activeIndex, newScenes.length - 1);

        // We don't know the new scene start frames yet (they're computed after render),
        // so store the target scene index and resolve it once durations are set.
        set(() => ({
            scenes: newConfig.scenes,
            projectName: newConfig.name,
            viewport: newConfig.viewport,
            fps: newConfig.fps,
            theme: newConfig.theme ?? {},
            variables: newConfig.variables ?? {},
            currentFrame: 0,
            currentTime: 0,
            duration: 0,
            sceneStartFrames: [],
            isPlaying: false,
            buildErrors: [],
            _pendingSceneIndex: Math.max(0, newIndex),
        }));
    },
});
