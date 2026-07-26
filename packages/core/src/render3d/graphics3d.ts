import type { Color } from "@/attributes/shape/fill/color/parser";
import type { Camera3D, OrthographicCamera3D, PerspectiveCamera3D } from "./camera";
import type {
    BoxGeometry3D, CapsuleGeometry3D, CircleGeometry3D, ConeGeometry3D,
    CylinderGeometry3D, ExtrudeGeometry3D, Geometry3D, LatheGeometry3D,
    PlaneGeometry3D, PolyhedronGeometry3D, RingGeometry3D, SphereGeometry3D,
    TorusGeometry3D, TorusKnotGeometry3D, TubeGeometry3D,
} from "./geometry";
import type {
    AmbientLight3D, DirectionalLight3D, HemisphereLight3D, Light3D,
    PointLight3D, RectAreaLight3D, SpotLight3D,
} from "./light";
import type { Material3D } from "./material";
import type {
    Background3D, Environment3D, Fog3D, PostEffect3D, ShadowSettings3D, ToneMapping3D,
} from "./scene-settings";
import type { Texture3D } from "./texture";
import { type Transform3D, type Blending3D, type Side3D } from "./transform";
import type { Vector3Input } from "./vector3";

// ─── Ops ─────────────────────────────────────────────────────────────────────

/** How a `line` op connects its points. */
export type LineMode3D = "strip" | "segments" | "loop";

/** One clip of a model's baked animation, sampled at an explicit time. */
export interface ModelAnimation3D {
    /** Clip name, or its index in the file. Defaults to the first clip. */
    clip?: string | number;
    /**
     * Seconds into the clip. **Explicit by design** — the renderer seeks to this
     * time rather than advancing by a delta, which is what keeps a model's
     * animation identical whether the frame was reached by playing forward or by
     * scrubbing backwards.
     */
    time: number;
    /** Blend weight, for cross-fading clips. Default 1. */
    weight?: number;
}

/**
 * One recorded operation in a {@link Graphics3D} command list.
 *
 * Hierarchy is expressed with `push`/`pop`; a drawable's geometry and material
 * are *inline sub-descriptors*, not ops, because in a 3D scene graph they are
 * properties of an object rather than children of it.
 */
export type Graphics3DOp =
    // Hierarchy
    | { kind: "push"; transform?: Transform3D }
    | { kind: "pop" }
    // Drawables
    | { kind: "mesh"; geometry: Geometry3D; material: Material3D | readonly Material3D[]; transform?: Transform3D }
    | { kind: "light"; light: Light3D; transform?: Transform3D }
    | {
        kind: "instances";
        geometry: Geometry3D;
        material: Material3D;
        /** Per-instance placement. Length drives the instance count. */
        instances: readonly Transform3D[];
        /** Per-instance tint. Needs a material that reads instance colour. */
        colors?: readonly Color[];
        transform?: Transform3D;
    }
    | { kind: "points"; geometry: Geometry3D; material: Material3D; transform?: Transform3D }
    | {
        kind: "line";
        geometry: Geometry3D;
        material: Material3D;
        mode: LineMode3D;
        transform?: Transform3D;
    }
    | { kind: "sprite"; material: Material3D; transform?: Transform3D }
    | {
        kind: "model";
        src: string;
        animation?: readonly ModelAnimation3D[];
        /** Replace materials on the loaded graph, keyed by mesh or material name. */
        override?: Readonly<Record<string, Material3D>>;
        transform?: Transform3D;
    };

/** Op kinds that put something in the scene (as opposed to shaping the tree). */
const DRAWABLE_KINDS: ReadonlySet<Graphics3DOp["kind"]> = new Set([
    "mesh", "light", "instances", "points", "line", "sprite", "model",
]);

// ─── Shorthand ───────────────────────────────────────────────────────────────

/**
 * Material fields promoted onto the geometry sugar methods, so the common case is
 * one flat call: `.box({ width: 2, color: "red", roughness: 0.3 })`.
 *
 * These desugar at record time into a full {@link Material3D} — `standard` by
 * default, `basic` when {@link unlit} is set — so the recorded op list stays
 * canonical. Pass {@link material} to bypass the shorthand entirely.
 */
export interface MaterialShorthand3D {
    /** A full descriptor (or an array, for multi-material). Wins over the rest. */
    material?: Material3D | readonly Material3D[];
    color?: Color;
    opacity?: number;
    transparent?: boolean;
    roughness?: number;
    metalness?: number;
    emissive?: Color;
    emissiveIntensity?: number;
    map?: Texture3D;
    normalMap?: Texture3D;
    roughnessMap?: Texture3D;
    metalnessMap?: Texture3D;
    aoMap?: Texture3D;
    alphaMap?: Texture3D;
    envMapIntensity?: number;
    wireframe?: boolean;
    flatShading?: boolean;
    side?: Side3D;
    vertexColors?: boolean;
    depthWrite?: boolean;
    depthTest?: boolean;
    blending?: Blending3D;
    alphaTest?: number;
    toneMapped?: boolean;
    /** Shade with an unlit `basic` material instead of `standard`. */
    unlit?: boolean;
}

/** Transform + material shorthand, accepted by every geometry sugar method. */
export type MeshShorthand3D = Transform3D & MaterialShorthand3D;

const TRANSFORM_KEYS = [
    "position", "rotation", "quaternion", "scale", "lookAt",
    "visible", "castShadow", "receiveShadow", "renderOrder", "key",
] as const;

const MATERIAL_SHORTHAND_KEYS = [
    "color", "opacity", "transparent", "roughness", "metalness",
    "emissive", "emissiveIntensity", "map", "normalMap", "roughnessMap",
    "metalnessMap", "aoMap", "alphaMap", "envMapIntensity", "wireframe",
    "flatShading", "side", "vertexColors", "depthWrite", "depthTest",
    "blending", "alphaTest", "toneMapped",
] as const;

/**
 * Pull the {@link Transform3D} fields out of a shorthand bag. Takes `object` so
 * the concrete option types at each call site pass without a cast, and returns
 * `undefined` rather than `{}` when there is nothing to apply — an absent
 * transform lets the renderer skip the matrix write entirely.
 */
function pickTransform(source: object): Transform3D | undefined {
    const bag = source as Record<string, unknown>;
    let out: Record<string, unknown> | undefined;
    for (const key of TRANSFORM_KEYS) {
        if (bag[key] !== undefined) (out ??= {})[key] = bag[key];
    }
    return out as Transform3D | undefined;
}

/**
 * Build the material a shorthand bag describes. Always returns one, so a recorded
 * drawable op never has to be interpreted with "…or the default" in mind.
 */
function pickMaterial(source: MaterialShorthand3D): Material3D | readonly Material3D[] {
    if (source.material !== undefined) return source.material;

    const material: Record<string, unknown> = { type: source.unlit ? "basic" : "standard" };
    for (const key of MATERIAL_SHORTHAND_KEYS) {
        const value = (source as Record<string, unknown>)[key];
        if (value !== undefined) material[key] = value;
    }
    return material as unknown as Material3D;
}

/** Drop the shorthand/transform keys, leaving only a geometry's own params. */
function pickGeometry<T>(source: object, type: string): T {
    const bag = source as Record<string, unknown>;
    const out: Record<string, unknown> = { type };
    for (const key in bag) {
        if (key === "material" || key === "unlit") continue;
        if ((TRANSFORM_KEYS as readonly string[]).includes(key)) continue;
        if ((MATERIAL_SHORTHAND_KEYS as readonly string[]).includes(key)) continue;
        if (bag[key] !== undefined) out[key] = bag[key];
    }
    return out as T;
}

/** Geometry params only, with `type` and the inherited passthrough removed. */
type ParamsOf<G> = Omit<G, "type">;

// ─── Recorder ────────────────────────────────────────────────────────────────

/**
 * A renderer-agnostic, chainable 3D scene builder — the `Graphics` of 3D.
 *
 * Records an ordered op list describing an object graph, plus scene-level
 * settings (camera, fog, background, environment, shadows, tone mapping, post
 * chain) held as fields and read back through query methods, exactly as
 * `Graphics` holds `opacity`/`rotation`/`scale`. Nothing here touches a renderer:
 * a built `Graphics3D` is handed to a `Graphics` via `g.scene3D(g3, state)`, and
 * the backend replays it.
 *
 *   const g3 = new Graphics3D()
 *       .perspective({ position: [0, 2, 6], lookAt: 0, fov: 45 })
 *       .background("#0b0d12")
 *       .ambient({ intensity: 0.35 })
 *       .directional({ intensity: 2.4, position: [4, 6, 3], castShadow: true })
 *       .box({ width: 2, height: 2, depth: 2, color: "#e0533d", roughness: 0.3 })
 *       .group({ position: [3, 0, 0] }, g =>
 *           g.sphere({ radius: 0.8, color: "cyan" })
 *            .torus({ radius: 1.4, tube: 0.08, unlit: true, color: "white" }));
 *
 * ── Angles are DEGREES ────────────────────────────────────────────────────────
 * Every angle here — Euler rotations, spot cone angles, sweep arcs, UV rotation —
 * is in degrees, matching motion-script's 2D `rotation`. The renderer converts.
 *
 * ── Animation ─────────────────────────────────────────────────────────────────
 * A `Graphics3D` is rebuilt from scratch every frame, so animation is just
 * reading signals while building:
 *
 *   const spin = createSignal(0);
 *   const pos  = createSignal({ x: 0, y: 0, z: 0 }, lerpVector3);
 *   // in the builder: .box({ rotation: [0, spin(), 0], position: pos() })
 *   yield* spin(360, 2, easeInOut());
 *
 * Note the second argument to `createSignal`. A signal holding a non-number needs
 * an explicit lerp (`lerpVector3`, `lerpEuler3`, `slerpQuaternion`) or it will
 * **snap at the end of the tween instead of interpolating** — the same trap as an
 * object node attribute declared without a `tween` function.
 *
 * ── Reconciliation identity ───────────────────────────────────────────────────
 * The renderer caches one live 3D object per op and mutates it between frames
 * rather than rebuilding. Identity is the op's **structural path**: its `group()`
 * nesting plus its index within that group. That is stable for a builder emitting
 * the same ops in the same order every frame, which is the normal case. When a
 * builder emits ops *conditionally*, set `key` on the transform so identity
 * follows the logical object rather than the slot — otherwise inserting an op
 * renumbers every later slot and rebuilds the tail.
 *
 * ── What is cheap to animate ──────────────────────────────────────────────────
 * Transforms and most material/light values are in-place writes, so they cost
 * nothing per frame. **Geometry parameters are not** — three geometries are
 * immutable, so tweening `.box({ width: signal() })` reallocates the mesh every
 * frame. Scale the object instead: `.box({ width: 1, scale: [signal(), 1, 1] })`.
 * The fields marked "structural" on `MaterialCommon3D` recompile the shader
 * program and should be set once, not tweened.
 */
export class Graphics3D {
    private _ops: Graphics3DOp[] = [];
    private _camera: Camera3D | null = null;
    private _fog: Fog3D | null = null;
    private _background: Background3D | null = null;
    private _environment: Environment3D | null = null;
    private _shadows: ShadowSettings3D | null = null;
    private _tone: ToneMapping3D | null = null;
    private _post: PostEffect3D[] = [];
    /** Open `push` count, so {@link assertBalanced} can report a leak. */
    private _depth = 0;

    // ─── Hierarchy ───────────────────────────────────────────────────────────

    /**
     * Open a child group. Everything recorded until the matching {@link pop} is
     * nested inside it and inherits `transform`.
     *
     * Prefer the callback form of {@link group}, which cannot be left unbalanced.
     */
    push(transform?: Transform3D): this {
        this._ops.push({ kind: "push", transform });
        this._depth++;
        return this;
    }

    /** Close the group opened by the matching {@link push}. */
    pop(): this {
        this._ops.push({ kind: "pop" });
        this._depth--;
        return this;
    }

    /**
     * Record a nested group — `push`, run `build`, `pop`. The preferred form: the
     * nesting is visible in the source and can't be left open.
     *
     *   g.group({ position: [0, 2, 0] }, g => g.sphere({ radius: 0.5 }))
     */
    group(transform: Transform3D, build: (g: this) => unknown): this;
    group(build: (g: this) => unknown): this;
    group(
        transformOrBuild: Transform3D | ((g: this) => unknown),
        maybeBuild?: (g: this) => unknown,
    ): this {
        const isCallback = typeof transformOrBuild === "function";
        const transform = isCallback ? undefined : transformOrBuild;
        const build = isCallback ? transformOrBuild : maybeBuild;
        this.push(transform);
        build?.(this);
        return this.pop();
    }

    // ─── Meshes ──────────────────────────────────────────────────────────────

    /**
     * Record a mesh from an explicit geometry and material. The geometry sugar
     * methods below all funnel here.
     */
    mesh(
        geometry: Geometry3D,
        material?: Material3D | readonly Material3D[],
        transform?: Transform3D,
    ): this {
        this._ops.push({
            kind: "mesh",
            geometry,
            material: material ?? { type: "standard" },
            transform,
        });
        return this;
    }

    /** Record a mesh from a geometry `type` plus a flat shorthand bag. */
    private sugar(type: Geometry3D["type"], options?: MeshShorthand3D): this {
        const source: MeshShorthand3D = options ?? {};
        return this.mesh(
            pickGeometry<Geometry3D>(source, type),
            pickMaterial(source),
            pickTransform(source),
        );
    }

    box(options?: ParamsOf<BoxGeometry3D> & MeshShorthand3D): this {
        return this.sugar("box", options);
    }
    sphere(options?: ParamsOf<SphereGeometry3D> & MeshShorthand3D): this {
        return this.sugar("sphere", options);
    }
    plane(options?: ParamsOf<PlaneGeometry3D> & MeshShorthand3D): this {
        return this.sugar("plane", options);
    }
    cylinder(options?: ParamsOf<CylinderGeometry3D> & MeshShorthand3D): this {
        return this.sugar("cylinder", options);
    }
    cone(options?: ParamsOf<ConeGeometry3D> & MeshShorthand3D): this {
        return this.sugar("cone", options);
    }
    torus(options?: ParamsOf<TorusGeometry3D> & MeshShorthand3D): this {
        return this.sugar("torus", options);
    }
    torusKnot(options?: ParamsOf<TorusKnotGeometry3D> & MeshShorthand3D): this {
        return this.sugar("torusKnot", options);
    }
    circle(options?: ParamsOf<CircleGeometry3D> & MeshShorthand3D): this {
        return this.sugar("circle", options);
    }
    ring(options?: ParamsOf<RingGeometry3D> & MeshShorthand3D): this {
        return this.sugar("ring", options);
    }
    capsule(options?: ParamsOf<CapsuleGeometry3D> & MeshShorthand3D): this {
        return this.sugar("capsule", options);
    }
    polyhedron(options: ParamsOf<PolyhedronGeometry3D> & MeshShorthand3D): this {
        return this.sugar("polyhedron", options);
    }
    extrude(options: ParamsOf<ExtrudeGeometry3D> & MeshShorthand3D): this {
        return this.sugar("extrude", options);
    }
    lathe(options: ParamsOf<LatheGeometry3D> & MeshShorthand3D): this {
        return this.sugar("lathe", options);
    }
    tube(options: ParamsOf<TubeGeometry3D> & MeshShorthand3D): this {
        return this.sugar("tube", options);
    }

    // ─── Lights ──────────────────────────────────────────────────────────────

    /** Record a light from an explicit descriptor. */
    light(light: Light3D, transform?: Transform3D): this {
        this._ops.push({ kind: "light", light, transform });
        return this;
    }

    /**
     * Record a light from a flat bag mixing the light's own params with its
     * placement — `.directional({ intensity: 2, position: [4, 6, 3] })`. The
     * transform keys are split out; everything else belongs to the light.
     */
    private sugarLight(type: Light3D["type"], options?: object): this {
        const source = options ?? {};
        const bag = source as Record<string, unknown>;
        const light: Record<string, unknown> = { type };
        for (const key in bag) {
            if ((TRANSFORM_KEYS as readonly string[]).includes(key)) continue;
            if (bag[key] !== undefined) light[key] = bag[key];
        }
        return this.light(light as unknown as Light3D, pickTransform(source));
    }

    ambient(options?: ParamsOf<AmbientLight3D> & Transform3D): this {
        return this.sugarLight("ambient", options);
    }
    hemisphere(options?: ParamsOf<HemisphereLight3D> & Transform3D): this {
        return this.sugarLight("hemisphere", options);
    }
    directional(options?: ParamsOf<DirectionalLight3D> & Transform3D): this {
        return this.sugarLight("directional", options);
    }
    point(options?: ParamsOf<PointLight3D> & Transform3D): this {
        return this.sugarLight("point", options);
    }
    spot(options?: ParamsOf<SpotLight3D> & Transform3D): this {
        return this.sugarLight("spot", options);
    }
    rectArea(options?: ParamsOf<RectAreaLight3D> & Transform3D): this {
        return this.sugarLight("rectArea", options);
    }

    // ─── Other drawables ─────────────────────────────────────────────────────

    /**
     * Record many copies of one geometry in a single draw call. The way to put
     * thousands of objects on screen — a plain `mesh` per copy would not keep up.
     *
     *   g.instances(Geo.box({ width: 0.2 }), Mat.standard({ color: "cyan" }),
     *              positions.map(p => ({ position: p })))
     */
    instances(
        geometry: Geometry3D,
        material: Material3D,
        instances: readonly Transform3D[],
        options?: { colors?: readonly Color[]; transform?: Transform3D },
    ): this {
        this._ops.push({
            kind: "instances",
            geometry,
            material,
            instances,
            colors: options?.colors,
            transform: options?.transform,
        });
        return this;
    }

    /** Record a point cloud — one sprite-like dot per vertex of `geometry`. */
    points(
        geometry: Geometry3D,
        material?: Material3D,
        transform?: Transform3D,
    ): this {
        this._ops.push({
            kind: "points",
            geometry,
            material: material ?? { type: "points" },
            transform,
        });
        return this;
    }

    /**
     * Record a line. Give it either explicit `points` or a `geometry` (typically
     * `Geo.edges(...)` for a wireframe outline).
     *
     * `mode` — `"strip"` (default) connects the points in order, `"segments"`
     * treats them as disjoint pairs, `"loop"` closes back to the start.
     */
    line(options: {
        points?: readonly Vector3Input[];
        geometry?: Geometry3D;
        material?: Material3D;
        mode?: LineMode3D;
        /** Sugar for `material: Mat.lineBasic({ color })`. */
        color?: Color;
        width?: number;
        opacity?: number;
        dashed?: boolean;
        transform?: Transform3D;
    } & Transform3D): this {
        const { points, geometry, material, mode, color, width, opacity, dashed } = options;

        if (!points && !geometry) {
            throw new Error("Graphics3D.line() needs either `points` or `geometry`.");
        }

        const resolved: Material3D = material ?? {
            type: dashed ? "lineDashed" : "lineBasic",
            ...(color !== undefined ? { color } : {}),
            ...(width !== undefined ? { width } : {}),
            ...(opacity !== undefined ? { opacity, transparent: true } : {}),
        } as Material3D;

        this._ops.push({
            kind: "line",
            geometry: geometry ?? { type: "buffer", position: flattenPoints(points!) },
            material: resolved,
            mode: mode ?? "strip",
            transform: pickTransform(options),
        });
        return this;
    }

    /** Record a camera-facing textured quad. */
    sprite(options: { map?: Texture3D; material?: Material3D; color?: Color; opacity?: number } & Transform3D): this {
        const { map, material, color, opacity } = options;
        const resolved: Material3D = material ?? {
            type: "sprite",
            ...(map !== undefined ? { map } : {}),
            ...(color !== undefined ? { color } : {}),
            ...(opacity !== undefined ? { opacity, transparent: true } : {}),
        } as Material3D;
        this._ops.push({
            kind: "sprite",
            material: resolved,
            transform: pickTransform(options),
        });
        return this;
    }

    /**
     * Record a loaded model (glTF/GLB, OBJ).
     *
     * Baked animation is sampled by explicit `time`, never advanced by a delta, so
     * a model stays frame-identical under scrubbing.
     */
    model(options: {
        src: string;
        animation?: ModelAnimation3D | readonly ModelAnimation3D[];
        override?: Readonly<Record<string, Material3D>>;
    } & Transform3D): this {
        const { src, animation, override } = options;
        this._ops.push({
            kind: "model",
            src,
            animation: animation === undefined
                ? undefined
                : Array.isArray(animation) ? animation : [animation as ModelAnimation3D],
            override,
            transform: pickTransform(options),
        });
        return this;
    }

    // ─── Scene settings ──────────────────────────────────────────────────────
    //
    // These are graphics-level fields rather than ops: a scene has exactly one
    // camera, one fog, one background. Recording them positionally would imply an
    // ordering that doesn't exist. Last writer wins.

    /** Set the camera from an explicit descriptor. */
    camera(camera: Camera3D): this {
        this._camera = camera;
        return this;
    }

    /** Set a perspective camera. The usual choice. */
    perspective(options?: ParamsOf<PerspectiveCamera3D>): this {
        return this.camera({ type: "perspective", ...options } as PerspectiveCamera3D);
    }

    /** Set an orthographic camera — parallel projection, for isometric looks. */
    orthographic(options?: ParamsOf<OrthographicCamera3D>): this {
        return this.camera({ type: "orthographic", ...options } as OrthographicCamera3D);
    }

    /** Set depth fog. A bare {@link Color} is sugar for linear fog in that colour. */
    fog(fog: Fog3D | Color | null): this {
        if (fog === null) {
            this._fog = null;
        } else if (typeof fog === "string" || Array.isArray(fog)) {
            this._fog = { type: "linear", color: fog as Color };
        } else {
            this._fog = fog as Fog3D;
        }
        return this;
    }

    /**
     * Set what fills the uncovered pixels. Defaults to transparent, so the 2D
     * scene behind the node shows through. A bare {@link Color} is a solid clear.
     */
    background(background: Background3D | null): this {
        this._background = background;
        return this;
    }

    /**
     * Light the scene with an environment image. Needed for metals to read as
     * metal — without something to reflect, a metallic surface renders black.
     * `{ type: "room" }` needs no asset and is the quickest fix.
     */
    environment(environment: Environment3D | null): this {
        this._environment = environment;
        return this;
    }

    /** Enable and configure shadow mapping. `true` is shorthand for `{ enabled: true }`. */
    shadows(settings?: ShadowSettings3D | boolean): this {
        if (settings === undefined || settings === true) this._shadows = { enabled: true };
        else if (settings === false) this._shadows = { enabled: false };
        else this._shadows = settings;
        return this;
    }

    /** Set tone mapping and exposure. */
    tone(settings: ToneMapping3D): this {
        this._tone = settings;
        return this;
    }

    /** Append post-processing passes, applied in order after the scene renders. */
    post(effects: PostEffect3D | readonly PostEffect3D[]): this {
        if (Array.isArray(effects)) this._post.push(...(effects as PostEffect3D[]));
        else this._post.push(effects as PostEffect3D);
        return this;
    }

    // ─── Consumption ─────────────────────────────────────────────────────────

    /** The recorded ops, in order. Replayed by the renderer. */
    ops(): readonly Graphics3DOp[] {
        return this._ops;
    }

    /** The camera, or `null` to let the renderer supply a default framing. */
    cameraDescriptor(): Camera3D | null {
        return this._camera;
    }
    fogDescriptor(): Fog3D | null {
        return this._fog;
    }
    backgroundDescriptor(): Background3D | null {
        return this._background;
    }
    environmentDescriptor(): Environment3D | null {
        return this._environment;
    }
    shadowSettings(): ShadowSettings3D | null {
        return this._shadows;
    }
    toneSettings(): ToneMapping3D | null {
        return this._tone;
    }
    postEffects(): readonly PostEffect3D[] {
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
     * replay, so a mismatched group fails loudly at the source rather than
     * silently reparenting everything after it.
     */
    assertBalanced(): void {
        if (this._depth !== 0) {
            const verb = this._depth > 0 ? "unclosed push()" : "extra pop()";
            throw new Error(
                `Graphics3D has ${Math.abs(this._depth)} ${verb}. ` +
                `Prefer group(transform, g => …), which cannot be left unbalanced.`,
            );
        }
    }
}

/** Flatten `Vector3Input`s into the packed `[x, y, z, …]` a buffer wants. */
function flattenPoints(points: readonly Vector3Input[]): number[] {
    const out: number[] = [];
    for (const point of points) {
        if (typeof point === "number") {
            out.push(point, point, point);
        } else if (Array.isArray(point)) {
            out.push(point[0] ?? 0, point[1] ?? 0, point[2] ?? 0);
        } else {
            const v = point as { x: number; y: number; z: number };
            out.push(v.x ?? 0, v.y ?? 0, v.z ?? 0);
        }
    }
    return out;
}
