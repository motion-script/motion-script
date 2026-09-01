import type { Color } from "@/attributes/shape/fill/color/parser";
import type {
    BoxGeometry3D, CapsuleGeometry3D, CircleGeometry3D, ConeGeometry3D,
    CylinderGeometry3D, ExtrudeGeometry3D, Geometry3D, LatheGeometry3D,
    PlaneGeometry3D, PolyhedronGeometry3D, RingGeometry3D, SphereGeometry3D,
    TorusGeometry3D, TorusKnotGeometry3D, TubeGeometry3D,
} from "./geometry";
import type { Material3D, Shading3D } from "./material";
import type { Texture3D } from "./texture";
import { resolveFill3D, type Fill3D } from "./fill3d";
import { type Transform3D, type Blend3D, type Faces3D } from "./transform";
import type { Vector3Input } from "./vector3";

// ─── Ops ─────────────────────────────────────────────────────────────────────

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
 * How a `line` op connects its points: in order, or as disjoint start/end pairs,
 * or in order and closed back to the start.
 */
export type LineMode3D = "strip" | "segments" | "loop";

/**
 * One recorded operation in a {@link Graphics3D} command list.
 *
 * Every op draws something. Hierarchy, lights and the camera are *scene*
 * concerns, recorded by the `Node3D` tree into a `Scene3D` — this is only ever
 * "what one node paints", which is exactly what a `Graphics2D` is in 2D.
 *
 * A drawable's geometry and material are *inline sub-descriptors*, not ops,
 * because in a 3D scene graph they are properties of an object rather than
 * children of it.
 */
export type Graphics3DOp =
    | { kind: "mesh"; geometry: Geometry3D; material: Material3D | readonly Material3D[]; transform?: Transform3D }
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

/**
 * Op kinds that put something in the scene (as opposed to shaping the tree).
 *
 * Shared with `Scene3D`, whose op list is this one plus `push`/`pop`/`light`/
 * `camera` — so "is anything actually drawn here" has a single definition.
 */
/** @internal */
export const DRAWABLE_KINDS: ReadonlySet<string> = new Set([
    "mesh", "light", "instances", "points", "line", "sprite", "model",
]);

// ─── Shorthand ───────────────────────────────────────────────────────────────

/**
 * Material fields promoted onto the geometry sugar methods, so the common case is
 * one flat call: `.box({ width: 2, fill: "red", roughness: 0.3 })`.
 *
 * `fill` is the whole 2D fill vocabulary — see {@link Fill3D} — and is what a
 * flat `color` plus a `map` slot used to be. The rest is surface *response*
 * (how light behaves on it) rather than colour, which is the line Spline's
 * material panel draws too and the reason those stay separate fields.
 *
 * These desugar at record time into a full {@link Material3D} — `standard` by
 * default, `basic` when {@link unlit} is set — so the recorded op list stays
 * canonical. Pass {@link material} to bypass the shorthand entirely; every
 * renderer-level knob that is not a design decision (`depthWrite`, `alphaTest`,
 * `toneMapped`, `polygonOffset`, …) lives there and only there.
 */
export interface MaterialShorthand3D {
    /** A full descriptor (or an array, for multi-material). Wins over the rest. */
    material?: Material3D | readonly Material3D[];
    /** What the surface is made of: a colour, a texture, a gradient, 2D content. */
    fill?: Fill3D;
    opacity?: number;
    roughness?: number;
    metalness?: number;
    /** Self-illumination. Bloom in the post chain is what makes it glow. */
    emission?: Color;
    emissionStrength?: number;
    normalMap?: Texture3D;
    roughnessMap?: Texture3D;
    metalnessMap?: Texture3D;
    aoMap?: Texture3D;
    alphaMap?: Texture3D;
    envMapIntensity?: number;
    wireframe?: boolean;
    /** Facet or smooth shading. Default `"smooth"`. */
    shading?: Shading3D;
    /** Which faces to rasterize. Default `"front"`. */
    faces?: Faces3D;
    vertexColors?: boolean;
    blend?: Blend3D;
    /** Shade with an unlit `basic` material instead of `standard`. */
    unlit?: boolean;
}

/** Transform + material shorthand, accepted by every geometry sugar method. */
export type MeshShorthand3D = Transform3D & MaterialShorthand3D;

const TRANSFORM_KEYS = [
    "position", "rotation", "quaternion", "scale", "lookAt",
    "visible", "shadow", "renderOrder",
] as const;

/**
 * Shorthand keys copied straight onto the built descriptor.
 *
 * `fill` is deliberately absent: it resolves into `color` *and* `map` rather than
 * being one field, so it is handled on its own in {@link resolveMaterialShorthand3D}.
 */
const MATERIAL_SHORTHAND_KEYS = [
    "opacity", "roughness", "metalness",
    "emission", "emissionStrength", "normalMap", "roughnessMap",
    "metalnessMap", "aoMap", "alphaMap", "envMapIntensity", "wireframe",
    "shading", "faces", "vertexColors", "blend",
] as const;

/** Every key the shorthand owns, for stripping a geometry bag. */
const SHORTHAND_KEYS: readonly string[] = [...MATERIAL_SHORTHAND_KEYS, "fill", "material", "unlit"];

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
 *
 * Exported because `Mesh3D` desugars the identical bag from its own props: this
 * is where `fill` becomes `color`-or-`map`, and two copies of that decision is
 * two chances for a node and a builder call to paint differently.
 *
 * @internal
 */
export function resolveMaterialShorthand3D(source: MaterialShorthand3D): Material3D | readonly Material3D[] {
    if (source.material !== undefined) return source.material;

    const material: Record<string, unknown> = { type: source.unlit ? "basic" : "standard" };

    const fill = resolveFill3D(source.fill);
    if (fill.color !== undefined) material.color = fill.color;
    if (fill.map !== undefined) material.map = fill.map;

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
        if (SHORTHAND_KEYS.includes(key)) continue;
        if ((TRANSFORM_KEYS as readonly string[]).includes(key)) continue;
        if (bag[key] !== undefined) out[key] = bag[key];
    }
    return out as T;
}

/** Geometry params only, with `type` and the inherited passthrough removed. */
type ParamsOf<G> = Omit<G, "type">;

// ─── Recorder ────────────────────────────────────────────────────────────────

/**
 * What one 3D node draws — the `Graphics2D` of 3D.
 *
 * Records an ordered list of drawables (meshes, instanced meshes, points, lines,
 * sprites, models), each with its own geometry, material and local transform.
 * That is the whole surface: it holds no camera, no lights and no hierarchy,
 * because those are properties of a *scene* rather than of a thing in one, and
 * the `Node3D` tree owns them. The exact division `Graphics2D` and
 * `RenderContext2D` already make in 2D.
 *
 *   protected renderSelf(ctx: RenderContext3D): void {
 *       ctx.draw(new Graphics3D()
 *           .box({ width: 2, cornerRadius: 0.15, fill: "#e0533d", roughness: 0.3 }));
 *   }
 *
 * Nothing here touches a renderer: a built `Graphics3D` is handed to a
 * {@link RenderContext3D}, which splices its ops into the scene being recorded.
 *
 * ── One flat bag, deliberately ────────────────────────────────────────────────
 * `Graphics2D` paints with a *chained* `.rect(…).fill(…)`, and this does not,
 * which is the one place the two recorders diverge on purpose. In 2D a `fill` is
 * a **group-scoped op** covering the shapes recorded before it; in 3D a material
 * belongs to exactly one object, because a mesh *is* geometry plus material.
 * A chained `.box().fill()` would imply a group material that has nothing to
 * scope over, so the shape and what it is made of are stated together instead.
 *
 * ── Angles are DEGREES ────────────────────────────────────────────────────────
 * Every angle here — Euler rotations, sweep arcs, UV rotation — is in degrees,
 * matching motion-script's 2D `rotation`. The renderer converts.
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
 * rather than rebuilding. Identity is **derived**: it comes from the owning
 * `Node3D` plus a signature of what the op actually draws, so a builder that
 * emits ops conditionally reuses the right cache entry with nothing written by
 * hand. There is no `key` to set.
 *
 * ── What is cheap to animate ──────────────────────────────────────────────────
 * Transforms and most material values are in-place writes, so they cost nothing
 * per frame. **Geometry parameters are not** — three geometries are immutable, so
 * tweening `.box({ width: signal() })` reallocates the mesh every frame. Scale the
 * object instead: `.box({ width: 1, scale: [signal(), 1, 1] })`. The fields marked
 * "structural" on `MaterialCommon3D` recompile the shader program and should be
 * set once, not tweened.
 */
export class Graphics3D {
    private _ops: Graphics3DOp[] = [];

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
            resolveMaterialShorthand3D(source),
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

    // ─── Other drawables ─────────────────────────────────────────────────────

    /**
     * Record many copies of one geometry in a single draw call. The way to put
     * thousands of objects on screen — a plain `mesh` per copy would not keep up.
     *
     *   g3.instances(Geo.box({ width: 0.2 }), Mat.standard({ color: "cyan" }),
     *               positions.map(p => ({ position: p })))
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
     * `closed` joins the last point back to the first, matching the 2D `Line`
     * node's own prop. `segments` treats the points as disjoint start/end pairs
     * instead — the form `Geo.edges(...)` produces. (There is no subdivision to
     * confuse it with: a line is drawn from the points it is given.)
     */
    line(options: {
        points?: readonly Vector3Input[];
        geometry?: Geometry3D;
        material?: Material3D;
        /** Join the last point back to the first. */
        closed?: boolean;
        /** Treat the points as disjoint start/end pairs. */
        segments?: boolean;
        /** The line's paint. Cap and join have no meaning on a GL line. */
        stroke?: LineStroke3D;
        opacity?: number;
        transform?: Transform3D;
    } & Transform3D): this {
        const { points, geometry, material, closed, segments, stroke, opacity } = options;

        if (!points && !geometry) {
            throw new Error("Graphics3D.line() needs either `points` or `geometry`.");
        }

        const resolved: Material3D = material ?? {
            type: stroke?.dash !== undefined ? "lineDashed" : "lineBasic",
            ...(stroke?.fill !== undefined ? { color: stroke.fill } : {}),
            ...(stroke?.weight !== undefined ? { width: stroke.weight } : {}),
            ...(stroke?.dash !== undefined
                ? { dashSize: stroke.dash[0], gapSize: stroke.dash[1] ?? stroke.dash[0] }
                : {}),
            ...(opacity !== undefined ? { opacity } : {}),
        } as Material3D;

        this._ops.push({
            kind: "line",
            geometry: geometry ?? { type: "buffer", position: flattenPoints(points!) },
            material: resolved,
            mode: segments ? "segments" : closed ? "loop" : "strip",
            transform: pickTransform(options),
        });
        return this;
    }

    /** Record a camera-facing textured quad. */
    sprite(options: { fill?: Fill3D; material?: Material3D; opacity?: number } & Transform3D): this {
        const { fill, material, opacity } = options;
        const paint = resolveFill3D(fill);
        const resolved: Material3D = material ?? {
            type: "sprite",
            ...(paint.map !== undefined ? { map: paint.map } : {}),
            ...(paint.color !== undefined ? { color: paint.color } : {}),
            ...(opacity !== undefined ? { opacity } : {}),
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

    // ─── Consumption ─────────────────────────────────────────────────────────

    /** The recorded ops, in order. Replayed by the renderer. */
    ops(): readonly Graphics3DOp[] {
        return this._ops;
    }

    /** True when this node draws nothing. */
    isEmpty(): boolean {
        return this._ops.length === 0;
    }
}

/**
 * A 3D line's paint, named after the 2D `Stroke` it mirrors.
 *
 * `cap`, `join` and the rest of the 2D stroke vocabulary are deliberately absent:
 * they describe a stroked *path*, and a GL line has no outline to cap. Note that
 * `weight` above 1 is ignored by most WebGL implementations — for a genuinely
 * thick line, draw a `tube`.
 */
export interface LineStroke3D {
    /** The line's colour. Named `fill` to match the 2D `Stroke`. */
    fill?: Color;
    weight?: number;
    /** Dash and gap lengths, in world units. */
    dash?: readonly [number, number?];
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
