import { AssetCatalog } from "@/assets/catalog";
import { AssetTracker } from "@/assets/tracker";
import { AudioRequest } from "@/attributes/audio/request";
import { Sound } from "@/attributes/audio/sound";
import { BoxBounds } from "@/attributes/layout/bounds";
import { Size2D } from "@/attributes/layout/size";
import { Node } from "@/nodes/base/node";
import { RootNode } from "@/nodes/scene/root-node";
import type {
    AudioTrack,
    GlobalLayer,
    GlobalLayerConfig,
    SceneSelector,
} from "@/project/config";
import { MeasureScope } from "@/render/measure-scope";
import { RenderContext } from "@/render/render-context";
import { ContextMap } from "@/util/context";

/**
 * Where a global layer sits relative to the scene. Only used to key the
 * structural paths audio requests are attributed by, so a layer's clip can
 * never be mistaken for a scene node's (see {@link LayerStack.prepareAudioAssets}).
 */
export type LayerKind = "background" | "overlay";

/** One configured layer, resolved to a live node inside its own viewport frame. */
interface LayerEntry {
    /** Position in the configured stack; part of the audio owner path. */
    readonly index: number;
    /**
     * Viewport-sized frame the author's node is laid out inside — the same
     * {@link RootNode} a {@link Scene} builds into, so a layer positions itself
     * exactly as it would if `stage.add(...)`ed to a scene. Minus the camera: a
     * layer lives outside the scene root, so `zoom`/`origin`/`heading` never
     * reach it.
     */
    readonly frame: RootNode;
    /** True when {@link LayerStack} built the node from a factory and therefore owns it. */
    readonly owned: boolean;
    readonly include?: SceneSelector;
    readonly exclude?: SceneSelector;
    /** Whether this entry's subtree has had its one-time context resolve run. */
    initialized: boolean;
}

/**
 * Fold a scene name to its comparison form: lower-case, separators removed.
 *
 * A scene's `name` is PascalCase, derived from its filename by the `?scene`
 * transform (`intro.tsx` → `Intro`, `cross-fade.tsx` → `CrossFade`) — but an
 * author writing a selector reaches for the filename they typed. Normalizing
 * both sides makes `'cross-fade'`, `'CrossFade'` and `'cross fade'` all select
 * the same scene, the same forgiveness `AssetCatalog` extends to an asset `src`.
 */
function normalizeSceneName(name: string): string {
    return name.toLowerCase().replace(/[-_.\s]+/g, "");
}

/** True when `selector` names `index` or `name`. An absent selector matches nothing. */
function selectorMatches(selector: SceneSelector | undefined, index: number, name: string): boolean {
    if (selector === undefined) return false;
    const normalized = normalizeSceneName(name);
    const hit = (item: string | number): boolean =>
        typeof item === "number" ? item === index : normalizeSceneName(item) === normalized;
    if (Array.isArray(selector)) {
        for (const item of selector) if (hit(item)) return true;
        return false;
    }
    return hit(selector as string | number);
}

/** Normalize the loose config form into `{ node, include, exclude }`. */
function toLayer(config: GlobalLayerConfig): GlobalLayer {
    if (typeof config === "function") return { node: config };
    if (config instanceof Node) return { node: config };
    return config;
}

/**
 * The selection rule itself: an `include` allow-list (absent → every scene),
 * then an `exclude` deny-list applied after it.
 */
function matchesScene(
    include: SceneSelector | undefined,
    exclude: SceneSelector | undefined,
    sceneIndex: number,
    sceneName: string,
): boolean {
    if (include !== undefined && !selectorMatches(include, sceneIndex, sceneName)) return false;
    return !selectorMatches(exclude, sceneIndex, sceneName);
}

/**
 * Whether a configured layer appears on the scene at `sceneIndex` named
 * `sceneName`.
 *
 * Exported because the player's timeline draws each layer's bar over exactly the
 * scenes it is active on, and a second implementation of the matching rule would
 * sooner or later disagree with the one that decides what actually renders.
 * Takes the raw config entry, so a caller needs no live {@link LayerStack}.
 */
export function layerAppliesTo(config: GlobalLayerConfig, sceneIndex: number, sceneName: string): boolean {
    const layer = toLayer(config);
    return matchesScene(layer.include, layer.exclude, sceneIndex, sceneName);
}

/**
 * The ordered stack of project-wide nodes drawn either under or over every
 * scene ({@link ProjectConfig.backgrounds} / {@link ProjectConfig.overlays}).
 *
 * A layer is **not** part of any scene's node tree. Scenes are torn down and
 * rebuilt from their generator on every pass ({@link Scene.reset}), so a node
 * parked in one would be disposed the first time that scene replayed and never
 * come back — there is no generator to re-add it. Instead each layer keeps its
 * own viewport frame here, for the whole life of the runtime, and the engine
 * draws the active ones around the scene: backgrounds, scene, overlays.
 *
 * Living outside the scene also gives layers the semantics the name implies:
 * they are unaffected by the scene camera (`zoom`/`origin`/`heading`), they sit
 * outside the scene's `clip`, and an overlay covers the scene's own `overlay`
 * fill rather than being covered by it.
 *
 * ### Selection
 * {@link select} resolves which entries apply to the scene about to be
 * drawn; every other method acts on that selection. Both the precomp pass and
 * the playback evaluator call it as they enter a scene, so the two agree on
 * which layers a given scene's frames contain.
 */
export class LayerStack {
    private readonly entries: LayerEntry[];
    private _active: LayerEntry[];
    private readonly kind: LayerKind;

    constructor(kind: LayerKind, config: readonly GlobalLayerConfig[] | undefined, viewport: Size2D) {
        this.kind = kind;
        this.entries = (config ?? []).map((item, index) => {
            const layer = toLayer(item);
            const owned = typeof layer.node === "function";
            const node = owned ? (layer.node as () => Node)() : (layer.node as Node);
            // Recover a node the *previous* controller disposed: a config-provided
            // instance outlives any single runtime (StrictMode double-mount, HMR)
            // and would otherwise be left with freed signals. Mirrors what
            // `Scene.reset` does for a reused scene root.
            node.reinit();
            const frame = new RootNode({
                width: viewport.width,
                height: viewport.height,
                group: "stack",
            });
            frame.addChild(node);
            return { index, frame, owned, include: layer.include, exclude: layer.exclude, initialized: false };
        });
        // Every layer is active until the first `select`, so a caller that renders
        // without selecting (no scenes at all) still gets the unfiltered stack.
        this._active = this.entries.slice();
    }

    /** True when the project declared no layers of this kind — the common case. */
    get isEmpty(): boolean {
        return this.entries.length === 0;
    }

    /** Resize every layer frame (the viewport is fixed per run, but set once up front). */
    setViewport(viewport: Size2D): void {
        for (const entry of this.entries) {
            entry.frame.set({ width: viewport.width, height: viewport.height });
        }
    }

    /**
     * Narrow the stack to the layers that apply to a scene. `include` is an
     * allow-list (absent → every scene); `exclude` is a deny-list applied after
     * it. Call on entering a scene, before the per-frame methods below.
     */
    select(sceneIndex: number, sceneName: string): void {
        if (this.entries.length === 0) return;
        this._active = this.entries.filter(
            entry => matchesScene(entry.include, entry.exclude, sceneIndex, sceneName),
        );
    }

    /** Bind the asset catalog to every active layer's subtree. */
    bindAssets(catalog: AssetCatalog): void {
        for (const entry of this._active) entry.frame.bindAssets(catalog);
    }

    /**
     * Push inherited context down every active layer.
     *
     * `resolveContext` must fire exactly once per node instance, and a layer is
     * never rebuilt, so the run-init flag is tracked per entry rather than taken
     * from the caller: an entry first selected by scene 3 still gets its one
     * init there, and one bound at scene 0 only gets the structural re-push
     * afterwards.
     */
    bindContext(context: ContextMap): void {
        for (const entry of this._active) {
            entry.frame.bindContext(context, !entry.initialized);
            entry.initialized = true;
        }
    }

    /** Advance every active layer's clock (and its per-frame sampling). */
    ellapse(totalTime: number): void {
        for (const entry of this._active) entry.frame.ellapse(totalTime);
    }

    /** Seed per-frame derived state without a full ellapse (see `Node.sample`). */
    sample(): void {
        for (const entry of this._active) entry.frame.sample();
    }

    /** Fire every active layer's pre-layout async setup. */
    prepareLayoutAssets(): void {
        for (const entry of this._active) entry.frame.prepareLayoutAssets();
    }

    /** Fire every active layer's pre-render async setup. */
    prepareRenderAssets(): void {
        for (const entry of this._active) entry.frame.prepareRenderAssets();
    }

    /**
     * Collect audio requests from every active layer (e.g. a `Video` overlay's
     * own track).
     *
     * The owner path is prefixed with the layer's kind and index rather than
     * starting at `""`: paths are how the timeline attributes a waveform to a
     * node in the *scene* tree, and an unprefixed layer path would land a
     * layer's clip on whichever scene node happened to occupy the same slot.
     * A prefixed path matches nothing, so the clip plays without being drawn on
     * someone else's bar.
     */
    prepareAudioAssets(tracker: AssetTracker): void {
        for (const entry of this._active) {
            entry.frame.prepareAudioAssets(tracker, `@${this.kind}:${entry.index}`);
        }
    }

    /** Lay every active layer out against the full viewport. */
    layout(bounds: BoxBounds, scope: MeasureScope): void {
        for (const entry of this._active) entry.frame.layout(bounds, scope);
    }

    /** Draw every active layer, in config order. */
    render(context: RenderContext): void {
        for (const entry of this._active) entry.frame.render(context);
    }

    /**
     * Release the frames this stack built.
     *
     * A node handed in as a live instance is owned by the project config and
     * outlives the runtime (StrictMode double-mount, HMR), so it is detached
     * before the frame is freed: disposing it would free signals that nothing
     * rebuilds — unlike a scene root, whose children come back from the
     * generator — leaving the next mount with a hollow layer. A factory-built
     * node belongs to this stack and goes down with its frame.
     */
    dispose(): void {
        for (const entry of this.entries) {
            if (!entry.owned) entry.frame.clearChildren();
            entry.frame.dispose();
            entry.initialized = false;
        }
        this._active = this.entries.slice();
    }
}

/** The project-level content {@link ProjectGlobals} is built from. */
export interface GlobalsConfig {
    audioTracks?: readonly AudioTrack[];
    overlays?: readonly GlobalLayerConfig[];
    backgrounds?: readonly GlobalLayerConfig[];
}

/**
 * Everything a project declares **outside** its scenes: audio beds laid on the
 * project timeline, and the node layers drawn under and over every scene.
 *
 * One instance is shared by the {@link Precomp} pass and the
 * {@link StateEvaluator}, exactly as the `Scene` instances are — the same
 * sequential invariant keeps them from colliding, and sharing is what makes the
 * measured asset windows describe the nodes that actually draw.
 */
export class ProjectGlobals {
    readonly backgrounds: LayerStack;
    readonly overlays: LayerStack;
    readonly audioTracks: readonly AudioTrack[];

    constructor(config: GlobalsConfig, viewport: Size2D) {
        this.backgrounds = new LayerStack("background", config.backgrounds, viewport);
        this.overlays = new LayerStack("overlay", config.overlays, viewport);
        this.audioTracks = config.audioTracks ?? [];
    }

    /** True when there is neither a background nor an overlay to draw. */
    get hasLayers(): boolean {
        return !this.backgrounds.isEmpty || !this.overlays.isEmpty;
    }

    setViewport(viewport: Size2D): void {
        this.backgrounds.setViewport(viewport);
        this.overlays.setViewport(viewport);
    }

    /** Narrow both stacks to the layers that apply to a scene (see {@link LayerStack.select}). */
    select(sceneIndex: number, sceneName: string): void {
        this.backgrounds.select(sceneIndex, sceneName);
        this.overlays.select(sceneIndex, sceneName);
    }

    bindAssets(catalog: AssetCatalog): void {
        this.backgrounds.bindAssets(catalog);
        this.overlays.bindAssets(catalog);
    }

    bindContext(context: ContextMap): void {
        this.backgrounds.bindContext(context);
        this.overlays.bindContext(context);
    }

    ellapse(totalTime: number): void {
        this.backgrounds.ellapse(totalTime);
        this.overlays.ellapse(totalTime);
    }

    sample(): void {
        this.backgrounds.sample();
        this.overlays.sample();
    }

    prepareLayoutAssets(): void {
        this.backgrounds.prepareLayoutAssets();
        this.overlays.prepareLayoutAssets();
    }

    prepareRenderAssets(): void {
        this.backgrounds.prepareRenderAssets();
        this.overlays.prepareRenderAssets();
    }

    prepareAudioAssets(tracker: AssetTracker): void {
        this.backgrounds.prepareAudioAssets(tracker);
        this.overlays.prepareAudioAssets(tracker);
    }

    layout(bounds: BoxBounds, scope: MeasureScope): void {
        this.backgrounds.layout(bounds, scope);
        this.overlays.layout(bounds, scope);
    }

    dispose(): void {
        this.backgrounds.dispose();
        this.overlays.dispose();
    }
}

/** One resolved audio bed plus any error raised resolving it. */
export interface GlobalAudioResolution {
    requests: AudioRequest[];
    /** Human-readable problems (an unknown `src`, a track past the project end). */
    errors: string[];
}

/**
 * Turn the project's {@link AudioTrack} declarations into absolute-time
 * {@link AudioRequest}s bounded by the project.
 *
 * Unlike a scene's audio these carry no scene offset — `startAt`/`endAt` are
 * already project seconds, so consumers schedule them with a zero offset.
 *
 * Bounding rules, in order:
 * - `trimEnd` defaults to the source's full length (from the catalog);
 * - the clip occupies `sceneDurationFor(trimEnd - trimStart)` seconds of
 *   timeline, so a `speed` filter shortens/lengthens it exactly as it does for
 *   a scene {@link Sound};
 * - a looping track runs to the project end;
 * - every track is clipped to `[0, totalDuration]`. A bed never lengthens the
 *   project, and one starting past the end is dropped.
 *
 * Pure and cheap: re-run from scratch on every timeline assembly, so a bed
 * resolved against a partial duration while the background precomp is still
 * measuring is simply re-resolved, correctly, once the rest lands.
 */
/**
 * One track's geometry before any timeline bounds it: where it starts, where it
 * reads from in the source, and how much timeline the trimmed source occupies.
 *
 * Shared by {@link resolveGlobalAudio} and {@link audioTimelineDuration} so the
 * two cannot disagree about a track's footprint — a duration derived by one rule
 * and clipped by another silently drops the tail of the longest bed.
 */
type TrackGeometry =
    | { ok: true; startAt: number; trimStart: number; length: number; sound: Sound }
    | { ok: false; error: string };

function resolveTrack(track: AudioTrack, index: number, catalog: AssetCatalog): TrackGeometry {
    const startAt = Math.max(0, track.startAt ?? 0);

    let sourceLength: number;
    try {
        sourceLength = catalog.getMediaDuration(track.src);
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }

    const trimStart = Math.max(0, track.trimStart ?? 0);
    const trimEnd = Math.min(track.trimEnd ?? sourceLength, sourceLength);
    const trimmed = Math.max(0, trimEnd - trimStart);
    if (trimmed <= 0) {
        return {
            ok: false,
            error: `audioTracks[${index}] ("${track.src}"): trimEnd (${trimEnd}s) must be greater than trimStart (${trimStart}s).`,
        };
    }

    // Borrow `Sound` purely for its resolved filter chain and its
    // source-length → timeline-length conversion, so a global bed and a
    // scene's `playSound` agree on how a speed filter (scalar or curve)
    // changes a clip's footprint.
    const sound = new Sound({
        src: track.src,
        volume: track.volume,
        loop: track.loop,
        trimStart,
        trimEnd,
        filters: track.filters,
    });

    return { ok: true, startAt, trimStart, length: sound.sceneDurationFor(trimmed), sound };
}

/**
 * The natural length of a set of {@link AudioTrack}s standing on their own: the
 * furthest point any non-looping track reaches.
 *
 * {@link resolveGlobalAudio} clips every track to a duration the caller already
 * knows, because a project bed must never lengthen the project. A timeline made
 * *only* of audio has no scenes to take that duration from, so it needs this
 * first — resolving against a duration of 0 yields nothing at all.
 *
 * A looping track contributes nothing here: it runs until the timeline ends, so
 * it can't be what decides where the timeline ends. If every track loops the
 * result is 0 and the caller must supply a duration of its own.
 *
 * Tracks that fail to resolve (unknown `src`, inverted trim) are skipped —
 * {@link resolveGlobalAudio} is where those surface as errors, and reporting
 * them twice for one bad track would double every message.
 */
export function audioTimelineDuration(
    tracks: readonly AudioTrack[],
    catalog: AssetCatalog,
): number {
    let end = 0;
    for (let i = 0; i < tracks.length; i++) {
        if (tracks[i].loop) continue;
        const geometry = resolveTrack(tracks[i], i, catalog);
        if (!geometry.ok) continue;
        end = Math.max(end, geometry.startAt + geometry.length);
    }
    return end;
}

export function resolveGlobalAudio(
    tracks: readonly AudioTrack[],
    catalog: AssetCatalog,
    totalDuration: number,
): GlobalAudioResolution {
    const requests: AudioRequest[] = [];
    const errors: string[] = [];

    for (let i = 0; i < tracks.length; i++) {
        const track = tracks[i];
        const geometry = resolveTrack(track, i, catalog);
        if (!geometry.ok) {
            errors.push(geometry.error);
            continue;
        }
        const { startAt, trimStart, length, sound } = geometry;

        const naturalEnd = track.loop ? totalDuration : startAt + length;
        const endAt = Math.min(naturalEnd, totalDuration);
        // A bed that begins at or after the project's end contributes nothing.
        // Silent, not an error: the timeline grows scene by scene during the
        // background precomp, so this is the normal state of a late bed until
        // the scenes before it have been measured.
        if (endAt <= startAt) continue;

        requests.push({
            id: `@global:${i}|${track.src}|${startAt}`,
            src: track.src,
            startAt,
            endAt,
            trimStart,
            volume: sound.volume,
            loop: sound.loop,
            filters: sound.filters.length > 0 ? sound.filters : undefined,
        });
    }

    return { requests, errors };
}
