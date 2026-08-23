import type { Graphics3D } from "./graphics3d";
import type { CameraData3D } from "./camera";
import type { LightData3D } from "./light";
import type {
    BackgroundData3D, EnvironmentData3D, FogData3D,
    PostEffectData3D, ShadowSettingsData3D, ToneMappingData3D,
} from "./scene-settings";
import type { Transform3D } from "./transform";
import type { Color } from "@/attributes/shape/fill/color/parser";

/**
 * Per-node state supplied to {@link RenderContext3D.begin} for the duration of a
 * `Node3D`'s draw scope — the 3D counterpart of `NodeRenderState`.
 *
 * There is no layout rect and no motion here, because neither means anything for
 * an object in space: a 3D node's whole placement *is* its `transform`.
 */
export interface Node3DRenderState {
    /**
     * Stable node identifier.
     *
     * This is what gives the renderer's cache real identity: keyed by the node
     * that recorded it, a drawable survives a conditional sibling appearing or
     * disappearing, where a positional index would renumber and rebuild the tail.
     */
    id: string;
    /** This node's placement relative to its parent. */
    transform?: Transform3D;
}

/**
 * The rendering context passed to every `Node3D` when it draws itself.
 *
 * The 3D sibling of `RenderContext2D`, and deliberately not its subclass: the two
 * share no members, because a 3D scene is described with a camera, lights and
 * meshes rather than with paths, paint and clips.
 *
 * The division of labour mirrors 2D exactly. A {@link Graphics3D} is *what one
 * node draws* — geometry and material, nothing else — the way a `Graphics2D` is
 * shapes and paint. Everything that belongs to the scene rather than to a thing
 * in it is a call on the context:
 *
 *   protected renderSelf(ctx: RenderContext3D): void {
 *       ctx.light({ type: "ambient", intensity: 0.4 });
 *   }
 *
 * `begin(state)` / `end()` bracket each node's draw call and carry its identity
 * and placement, so nesting is the node tree's nesting and the renderer can
 * cache per node rather than per slot.
 *
 * `Scene3D` is the implementation core ships; it records the calls into a value a
 * backend replays.
 */
export abstract class RenderContext3D {
    /**
     * Open a node draw scope. Must be paired with {@link end}. Everything
     * recorded until then is nested under this node and inherits its transform.
     */
    abstract begin(state: Node3DRenderState): void;

    /** Close the innermost scope opened by {@link begin}. */
    abstract end(): void;

    /** Draw what this node paints. */
    abstract draw(graphics: Graphics3D): void;

    /** Add a light at the current scope. */
    abstract light(light: LightData3D, transform?: Transform3D): void;

    /**
     * Place the scene camera at the current scope.
     *
     * Recorded in the hierarchy rather than set as a scene-wide field, so a camera
     * nested inside a moving group is carried by that group — the renderer
     * composes its world transform the same way it does for a mesh. A scene with
     * no camera gets a default framing; a scene that declares more than one keeps
     * the last, since there is only ever one view.
     */
    abstract camera(camera: CameraData3D): void;

    // ── Scene-wide settings ──────────────────────────────────────────────────
    //
    // Unlike a light or a camera these have no position, so they are not
    // hierarchical: a scene has exactly one fog and one background, and the last
    // node to set one wins.

    /** Set the scene fog. A bare colour is sugar for linear fog; `null` clears it. */
    abstract fog(fog: FogData3D | Color | null): void;
    /** Set what is drawn behind the scene, or `null` for transparent. */
    abstract background(background: BackgroundData3D | null): void;
    /** Set the image-based lighting environment, or `null` for none. */
    abstract environment(environment: EnvironmentData3D | null): void;
    /** Enable/configure shadow casting for the whole scene. */
    abstract shadows(settings?: ShadowSettingsData3D | boolean): void;
    /** Set tone mapping and exposure. */
    abstract tone(settings: ToneMappingData3D): void;
    /** Append post-processing passes, applied in order after the scene renders. */
    abstract post(effects: PostEffectData3D | readonly PostEffectData3D[]): void;
}
