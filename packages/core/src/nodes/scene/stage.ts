import type { Size2D } from "@/attributes/layout/size";
import type { Vector2 } from "@/attributes/layout/vector2";
import type { Anchor } from "@/attributes/layout/anchor";
import type { Insets } from "@/attributes/layout/insets";
import type { GapSize } from "@/layout/flex";
import type { FlowMode } from "@/layout/flow-engine";
import type { Fill } from "@/attributes/shape/fill/chain";
import type { FillResolved } from "@/attributes/shape/fill/union";
import type { EasingFunction } from "@/tween/ease/type";
import type { TweenOptions } from "@/tween/lerp";
import type { Command } from "@/tween/command";
import type { FrameGenerator } from "@/tween/generator";
import type { Sound, SoundProps } from "@/attributes/audio/sound";
import type { AssetCatalog } from "@/assets/catalog";
import type { Random } from "@/util/random";
import type { NodeTime } from "@/nodes/node/node-time";
import type { Node } from "@/nodes/node/node";
import type { Canvas2D, Canvas2DProps } from "./canvas2d-node";

/**
 * The object a scene generator is handed — **everything a scene may do, and
 * nothing else**.
 *
 * ```ts
 * export default createScene(function* (stage) {
 *     stage.set({ fill: 'bg' });
 *     stage.add(<Rect width={200} height={200} fill="royalblue" />);
 *     yield* stage.zoomTo(2, 1);
 * });
 * ```
 *
 * It bundles three things a generator needs and keeps everything else out of
 * reach:
 *
 * - **The composition** it is drawing into — `viewport`, `fps`, `variables`.
 * - **The canvas** — `add`/`set`/`to` plus the camera and paint commands, all
 *   acting on the scene's {@link Canvas2D}. `canvas` itself is there for
 *   anything not forwarded.
 * - **Determinism** — `random(seed)`, a seeded source that is rewound before
 *   every replay, so a scene that scrubs, precomps or hot-reloads draws the
 *   identical sequence each pass.
 *
 * Hand-written rather than derived from the implementing class, so what a scene
 * author can reach is a decision rather than a consequence: adding a public
 * method to {@link CanvasStage} does not silently widen the authoring surface.
 */
export interface Stage {
    // ─── The composition ──────────────────────────────────────────────────────

    /** Canvas dimensions in pixels. */
    readonly viewport: Size2D;

    /** Target frames-per-second of the composition. */
    readonly fps: number;

    /**
     * Read a project variable by its (flat) name:
     *
     * ```tsx
     * <Rect cornerRadius={stage.variables<number>('rounded-lg')} />
     * ```
     *
     * Variables are the project's `variables` map — arbitrary constants like
     * corner radii, durations, counts or flags that, unlike colors and
     * typography, have no string-resolution channel of their own. The type
     * parameter asserts the expected value type and defaults to `number` (the
     * common case); it is an unchecked assertion of whatever the project
     * declared, not validation. Lookup is case-insensitive.
     *
     * Returns `fallback` when the variable is absent, or `undefined` when no
     * fallback is given — so `stage.variables('x') ?? default` works too.
     */
    variables<T = number>(key: string, fallback?: T): T | undefined;

    // ─── Determinism ──────────────────────────────────────────────────────────

    /**
     * A seeded {@link Random} source for this build.
     *
     * ```ts
     * const random = stage.random("sparkle");
     * const xs = random.floatArray(40, -100, 100);
     * const drift = random.noise(t, 6);
     * ```
     *
     * The seed lives on the returned source, not on the stage, so determinism is
     * scoped per source: several `random(...)` calls with distinct seeds give
     * independent reproducible streams. A string seed is djb2-hashed; omit the
     * seed for the fixed default `0`, so an unseeded source is stable rather
     * than time-varying.
     *
     * Sources are cached by seed and rewound before each timeline replay, so a
     * scene that re-runs its generator (scrub, precomp, HMR) draws the identical
     * sequence every pass, whether or not it named a seed.
     *
     * **This is where randomness belongs.** A node has no seed of its own: one
     * that drew from a private source would be reproducible only for as long as
     * nothing above it changed how many times it was built.
     */
    random(seed?: string | number): Random;

    // ─── The canvas ───────────────────────────────────────────────────────────

    /**
     * The scene's root container — its layout frame, its background paint and
     * its camera, all one node. The forwarding members below cover the common
     * cases; reach for this for anything they don't.
     */
    readonly canvas: Canvas2D;

    /** The scene-relative clock. */
    readonly time: Readonly<NodeTime>;

    /** Metadata for the assets available to this project. */
    readonly assets: AssetCatalog;

    /**
     * Add a node (or array of nodes) to the canvas.
     *
     * Typed to the shared base because that is what JSX produces; the canvas is
     * 2D, so handing it a `Node3D` throws rather than silently drawing nothing.
     */
    add(node: Node | Node[]): void;

    /** Set one or more reactive props on the canvas. */
    set(props: { [K in keyof Canvas2DProps]?: Canvas2DProps[K] | (() => Canvas2DProps[K]) }): void;

    /** Animate any canvas props in one call — `yield* stage.to({ zoom: 2, fill: 'red' }, 1)`. */
    to(props: Partial<Canvas2DProps>, duration: number, easing?: EasingFunction): Command<Canvas2DProps>;

    /** Animate the camera magnification (`zoom`). > 1 zooms in; < 1 zooms out. */
    zoomTo(zoom: number, duration: number, ease?: EasingFunction): Command<Canvas2DProps>;

    /** Animate the camera focus point (`lookAt`) — the world point at viewport centre. */
    panTo(lookAt: Vector2, duration: number, ease?: EasingFunction): Command<Canvas2DProps>;

    /** Animate the camera view rotation (`heading`) in degrees. */
    headingTo(heading: number, duration: number, ease?: EasingFunction): Command<Canvas2DProps>;

    /** Animate the canvas `fill` (the scene-wide background). */
    fillTo(to: Fill, duration: number, options?: TweenOptions<FillResolved[]>): Command<Canvas2DProps>;

    /** Animate the canvas `overlay` (painted over fill + children, viewport-wide). */
    overlayTo(to: Fill, duration: number, options?: TweenOptions<FillResolved[]>): Command<Canvas2DProps>;

    /** The canvas background fill. */
    fill: Fill;
    /** The canvas overlay — painted over the fill *and* the children. */
    overlay: Fill;
    /** Layout mode for the canvas's children: `horizontal` / `vertical` / `freeform`. */
    flow: FlowMode;
    /** Spacing between the canvas's children along the main axis. Set via `stage.set({ gap })`. */
    readonly gap: GapSize;
    /** Alignment of the canvas's children within the viewport. */
    align: Anchor;
    /** Inner spacing between the viewport edges and the canvas's children. */
    padding: Insets;
    /** Camera magnification factor. > 1 zooms in; < 1 zooms out. */
    zoom: number;
    /** World-space point that maps to the centre of the viewport. */
    origin: Vector2;
    /** Camera view rotation in degrees (clockwise). */
    heading: number;

    // ─── Audio ────────────────────────────────────────────────────────────────

    /**
     * Start a sound on the scene's audio timeline without blocking, and return
     * the {@link Sound} handle. Pair with {@link stopSound} to end playback.
     */
    startSound(src: string | Sound, opts?: Omit<SoundProps, "src">): Sound;

    /** Stop a sound started via {@link startSound}. No-op if it isn't playing. */
    stopSound(sound: Sound): void;

    /**
     * Play a sound on the scene's audio timeline. Blocks for the clip's
     * duration — `yield* stage.playSound(...)`.
     */
    playSound(src: string | Sound, opts?: Omit<SoundProps, "src">): FrameGenerator;
}
