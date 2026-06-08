import { RenderContext } from "@/render/render-context";
import { Scene } from "@/nodes/base/scene-node";
import { Size2D } from "@/attributes/layout/size";
import { AssetCatalog } from "@/assets/catalog";
import { FrameGenerator } from "@/tween/generator";
import { BuildStage } from "@/render/build-stage";
import { MeasureScope } from "@/render/measure-scope";

/** Per-scene generator state, kept alive so we never replay a finished scene. */
type SceneSlot = {
    scene: Scene;
    /** Absolute frame this scene starts at in the global timeline. */
    startFrame: number;
    /** Inclusive last frame for this scene (startFrame + duration - 1). */
    endFrame: number;
    generator: FrameGenerator | null;
    /** Highest frame the generator has been advanced to within this scene. */
    localFrame: number;
};

/**
 * Drives scene generators forward in time and exposes the evaluated state for
 * layout and rendering. It is the stateful playback engine that `PlaybackController`
 * calls on every tick (and on seek).
 *
 * Each scene gets a `SceneSlot` that holds its generator and the highest local
 * frame it has reached. Forward seeks simply advance the generator; backward
 * seeks within a scene reset that slot and replay from frame 0. Scenes that
 * haven't been entered yet are initialised lazily when first needed.
 *
 * Call order per frame:
 * 1. `stateAt(frame)` — advance generator(s) to the requested frame.
 * 2. `layout(scope)` — lay out the current scene's node tree.
 * 3. `render(context)` — draw the current scene into the render context.
 */
export class StateEvaluator {
    private scenes: Scene[];
    private slots: SceneSlot[] = [];
    private _currentFrame: number = 0;
    private fps: number;
    private viewport: Size2D;
    private assets: AssetCatalog;

    /** Most-recently evaluated global frame (integer). */
    get currentFrame() {
        return this._currentFrame;
    }

    private readonly stage: BuildStage;

    /**
     * @param scenes  Scene list in timeline order.
     * @param viewport Render viewport size; passed to each scene on init.
     * @param fps     Frames per second — used to convert frames ↔ seconds.
     * @param assets  Asset catalog bound to scenes before each generator step.
     * @param tracks  Per-scene frame counts in timeline order (one entry per
     *                scene). Used to build global frame ranges so `stateAt`
     *                can jump directly to the owning scene without scanning.
     */
    constructor(scenes: Scene[], viewport: Size2D, fps: number, assets: AssetCatalog, tracks: number[]) {
        this.fps = fps;
        this.viewport = viewport;
        this.scenes = scenes;
        this.assets = assets;
        this.stage = new BuildStage(viewport, fps);

        for (const s of scenes) {
            s.set({ width: viewport.width, height: viewport.height });
        }

        let offset = 0;
        for (let i = 0; i < scenes.length; i++) {
            const duration = tracks[i] ?? 0;
            this.slots.push({
                scene: scenes[i],
                startFrame: offset,
                endFrame: offset + duration - 1,
                generator: null,
                localFrame: -1,
            });
            offset += duration;
        }

        if (this.slots.length > 0) {
            this._currentScene = this.slots[0].scene;
        }
    }

    private _currentScene!: Scene;

    public get currentScene(): Scene {
        return this._currentScene;
    }

    /** Index of the current scene in the scenes array, or -1 if none. */
    public get currentSceneIndex(): number {
        return this.scenes.indexOf(this._currentScene);
    }

    private get dt() {
        return 1 / this.fps;
    }

    private bindAssets() {
        for (const s of this.scenes) {
            s.bindAssets(this.assets);
        }
    }

    private ellapse(time: number) {
        for (const s of this.scenes) {
            s.ellapse(time);
        }
    }

    /** Find the slot that owns the given global frame. */
    private slotAt(frame: number): SceneSlot | null {
        for (const slot of this.slots) {
            if (frame >= slot.startFrame && frame <= slot.endFrame) return slot;
        }
        // Past the last frame — return the last slot so currentScene stays valid.
        return this.slots[this.slots.length - 1] ?? null;
    }

    /**
     * Resets a single scene slot and primes its generator up to local frame 0.
     * Scenes that come *after* this one in the timeline are left untouched —
     * they will be lazily initialised when first needed.
     */
    private resetSlot(slot: SceneSlot): void {
        slot.scene.reset();
        slot.scene.bindAssets(this.assets);
        slot.scene.ellapse(0);
        this.stage.reset();
        const gen = slot.scene.build(this.stage);
        // Prime: advance to the first yield so frame-0 nodes are registered.
        gen.next(this.dt);
        slot.generator = gen;
        slot.localFrame = 0;
    }

    /** Lay out the current scene's node tree against the full viewport. */
    layout(scope: MeasureScope) {
        const bounds = { x: 0, y: 0, width: this.viewport.width, height: this.viewport.height };
        this.currentScene.layout(bounds, scope);
    }

    /** Render the current scene's node tree into `context`. */
    render(context: RenderContext) {
        this.currentScene.render(context);
    }

    /**
     * Advance (or rewind) state to the given global `frame`.
     *
     * - If `frame` matches the current frame and the generator is already
     *   primed, this is a no-op (early return).
     * - If the target is within the current slot but behind the generator's
     *   position, the slot is reset and replayed from frame 0.
     * - If the target belongs to a different scene, that slot is entered
     *   (resetting it if necessary) and advanced to the local target frame.
     *
     * @param frame Global frame index (float accepted; fractional part ignored).
     */
    stateAt(frame: number): void {
        const clampedFrame = Math.max(0, Math.floor(frame));

        if (clampedFrame === this._currentFrame && this.slotAt(clampedFrame)?.generator !== null) return;

        const targetSlot = this.slotAt(clampedFrame);
        if (!targetSlot) return;

        this._currentScene = targetSlot.scene;

        const localTarget = clampedFrame - targetSlot.startFrame;

        // If we need to go backwards within this slot, reset only this slot.
        if (targetSlot.generator === null || targetSlot.localFrame > localTarget) {
            this.resetSlot(targetSlot);
        }

        const dt = this.dt;

        // Advance this slot's generator from its current local frame to localTarget.
        while (targetSlot.localFrame < localTarget) {
            targetSlot.localFrame++;
            const globalTime = (targetSlot.startFrame + targetSlot.localFrame) * dt;
            this.bindAssets();
            this.ellapse(globalTime);
            targetSlot.generator!.next(dt);
        }

        this._currentFrame = clampedFrame;
    }

    /** Dispose all scenes and drop generator references. */
    dispose(): void {
        for (const slot of this.slots) {
            slot.scene.dispose();
            slot.generator = null;
        }
    }
}
