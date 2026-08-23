import { DRAWABLE_KINDS, Graphics3D, type Graphics3DOp } from "./graphics3d";
import { RenderContext3D, type Node3DRenderState } from "./render-context3d";
import type { CameraData3D, OrthographicCameraData3D, PerspectiveCameraData3D } from "./camera";
import type { LightData3D } from "./light";
import type {
    BackgroundData3D, EnvironmentData3D, FogData3D,
    PostEffectData3D, ShadowSettingsData3D, ToneMappingData3D,
} from "./scene-settings";
import type { Transform3D } from "./transform";
import type { Color } from "@/attributes/shape/fill/color/parser";

/** Options accepted by every `Camera3D` node and by {@link Scene3D.perspective}. */
type ParamsOf<T extends { type: string }> = Omit<T, "type">;

/**
 * One recorded operation in a {@link Scene3D}.
 *
 * A superset of {@link Graphics3DOp}: everything a node draws, plus the four
 * things that describe the scene around it — the `push`/`pop` nesting the node
 * tree produces, the lights in it, and where it is viewed from.
 */
export type Scene3DOp =
    | { kind: "push"; transform?: Transform3D }
    | { kind: "pop" }
    | { kind: "light"; light: LightData3D; transform?: Transform3D }
    | { kind: "camera"; camera: CameraData3D }
    | Graphics3DOp;

/**
 * A recorded 3D scene — and the {@link RenderContext3D} that records it.
 *
 * One value plays both parts, exactly as `Graphics2D` is both the builder and the
 * thing handed to a backend. A `Node3D` tree draws into it, and the result is a
 * flat op list plus a handful of scene-wide settings that a renderer replays.
 *
 * Almost always produced for you: a `Canvas3D` opens one per frame, walks its
 * `Node3D` children through it and paints the result through its own path. The
 * builder surface below is the escape hatch — it is what lets a scene be shaded
 * through *any* 2D shape rather than only a rect:
 *
 *   const scene = new Scene3D()
 *       .perspective({ position: [0, 2, 6], lookAt: 0 })
 *       .light({ type: "ambient", intensity: 0.4 })
 *       .draw(new Graphics3D().box({ width: 2, color: "tomato" }));
 *
 *   <Text text="DEPTH" fontSize={320} fill={scene} />
 *
 * A bare `Scene3D` coerces to a `canvas3D` fill the way a bare CSS string coerces
 * to a solid one, so `fill={scene}` and `fill={["#0b0d12", scene]}` both work.
 */
export class Scene3D extends RenderContext3D {
    private _ops: Scene3DOp[] = [];
    private _camera: CameraData3D | null = null;
    private _fog: FogData3D | null = null;
    private _background: BackgroundData3D | null = null;
    private _environment: EnvironmentData3D | null = null;
    private _shadows: ShadowSettingsData3D | null = null;
    private _tone: ToneMappingData3D | null = null;
    private _post: PostEffectData3D[] = [];
    /** Open `push` count, so {@link assertBalanced} can report a leak. */
    private _depth = 0;

    // ─── Node scopes ─────────────────────────────────────────────────────────

    override begin(state: Node3DRenderState): void {
        // The node's id rides on the transform's `key`, which is the renderer's
        // identity slot — so a group is cached against the node that opened it
        // rather than against its index among its siblings.
        this._ops.push({ kind: "push", transform: { ...state.transform, key: state.id } });
        this._depth++;
    }

    override end(): void {
        this._ops.push({ kind: "pop" });
        this._depth--;
    }

    // ─── Drawables ───────────────────────────────────────────────────────────

    /**
     * Splice what a node draws into the scene at the current scope.
     *
     * The ops are copied rather than referenced: a `Graphics3D` is rebuilt every
     * frame, so there is nothing to share, and a flat list is what the renderer
     * walks.
     */
    override draw(graphics: Graphics3D): this {
        const ops = graphics.ops();
        for (let i = 0; i < ops.length; i++) this._ops.push(ops[i]);
        return this;
    }

    // ─── Lights ──────────────────────────────────────────────────────────────

    override light(light: LightData3D, transform?: Transform3D): this {
        this._ops.push({ kind: "light", light, transform });
        return this;
    }

    // ─── Camera ──────────────────────────────────────────────────────────────

    override camera(camera: CameraData3D): this {
        this._camera = camera;
        this._ops.push({ kind: "camera", camera });
        return this;
    }

    /** Set a perspective camera. The usual choice. */
    perspective(options?: ParamsOf<PerspectiveCameraData3D>): this {
        return this.camera({ type: "perspective", ...options } as PerspectiveCameraData3D);
    }

    /** Set an orthographic camera — parallel projection, for isometric looks. */
    orthographic(options?: ParamsOf<OrthographicCameraData3D>): this {
        return this.camera({ type: "orthographic", ...options } as OrthographicCameraData3D);
    }

    // ─── Scene settings ──────────────────────────────────────────────────────
    //
    // Fields rather than ops: a scene has exactly one fog, one background, one
    // environment. Recording them positionally would imply an ordering that
    // doesn't exist. Last writer wins.

    override fog(fog: FogData3D | Color | null): this {
        if (fog === null) {
            this._fog = null;
        } else if (typeof fog === "object" && "type" in (fog as object)) {
            this._fog = fog as FogData3D;
        } else {
            this._fog = { type: "linear", color: fog as Color };
        }
        return this;
    }

    override background(background: BackgroundData3D | null): this {
        this._background = background;
        return this;
    }

    override environment(environment: EnvironmentData3D | null): this {
        this._environment = environment;
        return this;
    }

    override shadows(settings?: ShadowSettingsData3D | boolean): this {
        if (settings === undefined || settings === true) this._shadows = { enabled: true };
        else if (settings === false) this._shadows = { enabled: false };
        else this._shadows = settings;
        return this;
    }

    override tone(settings: ToneMappingData3D): this {
        this._tone = settings;
        return this;
    }

    override post(effects: PostEffectData3D | readonly PostEffectData3D[]): this {
        if (Array.isArray(effects)) this._post.push(...(effects as PostEffectData3D[]));
        else this._post.push(effects as PostEffectData3D);
        return this;
    }

    // ─── Consumption ─────────────────────────────────────────────────────────

    /** The recorded ops, in order. Replayed by the renderer. */
    ops(): readonly Scene3DOp[] {
        return this._ops;
    }

    /** The camera, or `null` to let the renderer supply a default framing. */
    cameraDescriptor(): CameraData3D | null {
        return this._camera;
    }
    fogDescriptor(): FogData3D | null {
        return this._fog;
    }
    backgroundDescriptor(): BackgroundData3D | null {
        return this._background;
    }
    environmentDescriptor(): EnvironmentData3D | null {
        return this._environment;
    }
    shadowSettings(): ShadowSettingsData3D | null {
        return this._shadows;
    }
    toneSettings(): ToneMappingData3D | null {
        return this._tone;
    }
    postEffects(): readonly PostEffectData3D[] {
        return this._post;
    }

    /**
     * True when nothing would be drawn — no mesh, light or other drawable. The
     * node skips the whole 3D pass (and the WebGL context entirely) in that case.
     */
    isEmpty(): boolean {
        return !this._ops.some((op) => DRAWABLE_KINDS.has(op.kind));
    }

    /**
     * Throw if `push` and `pop` are unbalanced. Called once by the consumer before
     * replay, so a mismatched scope fails loudly rather than silently reparenting
     * everything after it.
     *
     * A `Node3D` tree cannot get this wrong — `begin`/`end` are bracketed by the
     * walk — so in practice this catches a hand-built scene.
     */
    assertBalanced(): void {
        if (this._depth !== 0) {
            const verb = this._depth > 0 ? "unclosed begin()" : "extra end()";
            throw new Error(
                `Scene3D has ${Math.abs(this._depth)} ${verb}.`,
            );
        }
    }
}
