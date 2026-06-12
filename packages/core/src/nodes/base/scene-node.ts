import { Node, NodeConfig } from "./node";
import { FrameGenerator } from "@/tween/generator";
import { BuildStage } from "@/render/build-stage";
import { Rect, RectProps } from "../geometry/rect-node";
import { Sound, SoundProps } from "@/attributes/audio/sound";
import { AssetTracker } from "@/assets/tracker";


export type BaseSceneConfig = NodeConfig<any, RectProps> & {
    /** Child scenes used for asset preloading and composite sequencing. */
    scenes?: Scene[];
};

export abstract class Scene extends Rect {

    /** Child scenes declared up-front. Used by buildChildren() and asset preloading. */
    readonly scenes: Scene[];

    /** Sounds created via sound() / playSound() — auto-ticked and auto-prepared. */
    private _managedSounds: Sound[] = [];

    constructor(config: BaseSceneConfig = {}) {
        const { scenes, ...nodeConfig } = config;
        super({
            width: 'fill',
            height: 'fill',
            group: 'stack',
            ...(nodeConfig as NodeConfig<any, RectProps>),
        });

        this.scenes = scenes ?? [];
    }

    /** Clear all dynamically-added children and managed sounds, and reset the clock. */
    reset(): void {
        // A scene instance is owned by the project config and reused across
        // playback controllers (StrictMode double-mount, HMR). A prior
        // controller's dispose() frees this scene's own signals; restore them
        // from defaults before rebuilding so reads like `this.stroke` are valid.
        this.reinitProps();
        for (const child of this.children) child.dispose();
        this.clearChildren();
        for (const s of this._managedSounds) s.dispose();
        this._managedSounds.length = 0;
    }

    override tick(time: number): void {
        for (const s of this._managedSounds) s.tick(time);
    }

    abstract build(stage: BuildStage): FrameGenerator;

    /** Add a node (or array of nodes) as a child of this scene. */
    add(node: Node | Node[]): void {
        if (Array.isArray(node)) {
            this.addChildren(node);
        } else {
            this.addChild(node);
        }
    }

    /**
     * Start a sound on the scene's audio timeline without blocking, and return
     * the {@link Sound} handle. Pair with {@link stopSound} to end playback —
     * handy for running audio in parallel with visuals without nesting `all()`.
     *
     * The returned handle stays managed (auto-ticked, auto-prepared) until the
     * scene resets, so you can also let a bounded clip stop on its own.
     */
    startSound(src: string | Sound, opts?: Omit<SoundProps, "src">): Sound {
        const s = src instanceof Sound ? src : new Sound({ src, ...opts } as SoundProps);
        // The asset catalog is bound on the node, so the full-length default for
        // trimEnd can only be resolved here, not at Sound construction time.
        if (s.trimEnd === Infinity && !s.loop) {
            s.trimEnd = this.assets.getMediaDuration(s.src);
        }
        s.tick(this.clock.time);
        if (this._managedSounds.indexOf(s) < 0) this._managedSounds.push(s);
        s.start();
        return s;
    }

    /** Stop a sound started via {@link startSound}. No-op if it isn't playing. */
    stopSound(sound: Sound): void {
        sound.tick(this.clock.time);
        sound.stop();
    }

    /**
     * Play a sound on the scene's audio timeline. Blocks for the clip's duration.
     * Use as `yield* this.playSound(...)` inside a scene generator.
     */
    *playSound(src: string | Sound, opts?: Omit<SoundProps, "src">): FrameGenerator {
        const s = src instanceof Sound ? src : new Sound({ src, ...opts } as SoundProps);
        // The asset catalog is bound on the node, so the full-length default for
        // trimEnd can only be resolved here, not at Sound construction time.
        if (s.trimEnd === Infinity && !s.loop) {
            s.trimEnd = this.assets.getMediaDuration(s.src);
        }
        s.tick(this.clock.time);
        this._managedSounds.push(s);
        try {
            yield* s.play();
        } finally {
            const idx = this._managedSounds.indexOf(s);
            if (idx >= 0) this._managedSounds.splice(idx, 1);
        }
    }



    override prepare(tracker: AssetTracker): void {
        super.prepare(tracker);
        for (const s of this._managedSounds) s.prepare(tracker);
    }

    /**
     * Mount a child scene, run its build() to completion (its frames spliced
     * into the parent's timeline), then unmount and dispose it. Any nodes the
     * parent attached before the call are preserved.
     */
    private *_buildScene(child: Scene, stage: BuildStage): FrameGenerator {
        child.reset();
        this.addChild(child);
        try {
            yield* child.build(stage);
        } finally {
            this.removeChild(child);
            child.reset();
        }
    }

    /** Run every child scene in order via buildChild(). */
    *buildAll(stage: BuildStage): FrameGenerator {
        for (const child of this.scenes) {
            yield* this._buildScene(child, stage);
        }
    }

    dispose(): void {
        super.dispose();
        for (const s of this._managedSounds) s.dispose();
        this._managedSounds.length = 0;
        for (const child of this.scenes) child.dispose();
    }
}
