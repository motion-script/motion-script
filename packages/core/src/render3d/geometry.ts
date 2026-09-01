import type { PathData } from "@/render/descriptors/path";
import type { PathBuilder } from "@/render/descriptors/path-builder";
import { type Color, parseColor } from "@/attributes/shape/fill/color/parser";
import type { Vector3, Vector3Input } from "./vector3";
import type { Segments3D } from "./segments";

/**
 * Anything not modelled by a named field, assigned straight onto the constructed
 * object. The documented last resort — unsafe by construction (it bypasses the
 * type system, and the renderer treats any change to it as a full rebuild since
 * it cannot know what a given key affects), but it means no author is ever
 * blocked waiting for a field to be modelled here.
 */
export interface Passthrough3D {
    params?: Record<string, unknown>;
}

/**
 * A partial revolution, shared by every shape that has one.
 *
 * `Ellipse` has said `startAngle` / `sweep` in degrees since the beginning, so 3D
 * says it too. It replaces three's five spellings of the same idea —
 * `thetaStart`, `thetaLength`, `phiStart`, `phiLength` and `arc` — which differ
 * per shape for reasons that are about three's own history rather than about
 * anything an author is trying to draw.
 */
export interface Sweep3D {
    /** Where the revolution begins, in **degrees**. Default 0. */
    startAngle?: number;
    /** How far it runs, in **degrees**. Default 360 (or 180 for a half sweep). */
    sweep?: number;
}

// ─── Primitives ──────────────────────────────────────────────────────────────

/**
 * A box.
 *
 * `cornerRadius` is the same control `Rect` carries in 2D and rounds all twelve
 * edges; it is most of the difference between a scene that reads as designed and
 * one that reads as a renderer test. See `evaluateRoundedBox` for how the
 * surface is built.
 */
export interface BoxGeometry3D extends Passthrough3D {
    type: "box";
    width?: number;
    height?: number;
    depth?: number;
    /** Rounds every edge and corner. Clamped to the smallest half-extent. */
    cornerRadius?: number;
    /** Face subdivision, as `[x, y, z]`. Default 1. */
    segments?: Segments3D;
}

/** A sphere, or a wedge/band of one via {@link Sweep3D} and the latitude pair. */
export interface SphereGeometry3D extends Passthrough3D, Sweep3D {
    type: "sphere";
    radius?: number;
    /** `[longitude, latitude]`. Default `[32, 16]`. */
    segments?: Segments3D;
    /** Vertical band start, in **degrees** from the north pole. Default 0. */
    startLatitude?: number;
    /** Vertical band extent, in **degrees**. Default 180 (pole to pole). */
    latitudeSweep?: number;
}

export interface PlaneGeometry3D extends Passthrough3D {
    type: "plane";
    width?: number;
    height?: number;
    /** `[width, height]`. Raise to subdivide for per-vertex displacement. */
    segments?: Segments3D;
}

/**
 * A cylinder, or any tapered tube.
 *
 * `radius` takes `[top, bottom]` for a taper, which is what `radiusTop` and
 * `radiusBottom` were — one field, and the pair reads as the thing it describes.
 */
export interface CylinderGeometry3D extends Passthrough3D, Sweep3D {
    type: "cylinder";
    /** A scalar, or `[top, bottom]` to taper. Default 1. */
    radius?: number | readonly [number, number];
    height?: number;
    /** `[radial, height]`. Default `[32, 1]`. */
    segments?: Segments3D;
    /** Draw the end caps. Default true. */
    capped?: boolean;
}

export interface ConeGeometry3D extends Passthrough3D, Sweep3D {
    type: "cone";
    radius?: number;
    height?: number;
    /** `[radial, height]`. Default `[32, 1]`. */
    segments?: Segments3D;
    /** Draw the base cap. Default true. */
    capped?: boolean;
}

export interface TorusGeometry3D extends Passthrough3D, Sweep3D {
    type: "torus";
    /** Distance from the centre to the middle of the ring. */
    radius?: number;
    /** Thickness of the ring itself. Default 0.4. */
    thickness?: number;
    /** `[radial, tubular]`. Default `[16, 48]`. */
    segments?: Segments3D;
}

export interface TorusKnotGeometry3D extends Passthrough3D {
    type: "torusKnot";
    radius?: number;
    /** Thickness of the strand. Default 0.4. */
    thickness?: number;
    /** `[tubular, radial]`. Default `[64, 8]`. */
    segments?: Segments3D;
    /** Winding counts as `[around the axis, around the torus]`. Default `[2, 3]`. */
    windings?: readonly [number, number];
}

export interface CircleGeometry3D extends Passthrough3D, Sweep3D {
    type: "circle";
    radius?: number;
    /** Default 32. */
    segments?: Segments3D;
}

/** A flat annulus — a disc with a hole. */
export interface RingGeometry3D extends Passthrough3D, Sweep3D {
    type: "ring";
    /** Outer radius. Default 1. */
    radius?: number;
    /** Inner radius — the size of the hole. Default 0.5. */
    innerRadius?: number;
    /** `[around, radial]`. Default `[32, 1]`. */
    segments?: Segments3D;
}

export interface CapsuleGeometry3D extends Passthrough3D {
    type: "capsule";
    radius?: number;
    /** Length of the straight mid-section, excluding the caps. */
    height?: number;
    /** `[radial, cap]`. Default `[16, 8]`. */
    segments?: Segments3D;
}

export interface PolyhedronGeometry3D extends Passthrough3D {
    type: "polyhedron";
    shape: "tetrahedron" | "octahedron" | "icosahedron" | "dodecahedron";
    radius?: number;
    /** Subdivision. Raising this on an icosahedron approximates a sphere. */
    segments?: Segments3D;
}

// ─── Path-derived (reuses core's own 2D path vocabulary) ─────────────────────

/** How an extrusion's edge is chamfered. A bare number is the bevel's size. */
export interface Bevel3D {
    size?: number;
    thickness?: number;
    offset?: number;
    segments?: number;
}

/**
 * A 2D outline swept into a solid. `path` accepts the same `PathData` (SVG
 * string or command list) or {@link PathBuilder} the 2D `Path` node takes — same
 * name, same value — so an existing 2D outline becomes an extruded solid with no
 * new vocabulary.
 */
export interface ExtrudeGeometry3D extends Passthrough3D {
    type: "extrude";
    path: PathData | PathBuilder;
    depth?: number;
    /** Curve flattening resolution. Default 12. */
    segments?: Segments3D;
    /** A number is the bevel size; an object tunes the rest. Omit for no bevel. */
    bevel?: number | Bevel3D;
}

/** A profile revolved about the Y axis — vases, bowls, turned shapes. */
export interface LatheGeometry3D extends Passthrough3D, Sweep3D {
    type: "lathe";
    /** Profile points in the XY plane; `x` is the radius, `y` the height. */
    points: readonly Vector3Input[];
    /** Default 12. */
    segments?: Segments3D;
}

/** A circular cross-section swept along a 3D curve. */
export interface TubeGeometry3D extends Passthrough3D {
    type: "tube";
    points: readonly Vector3Input[];
    radius?: number;
    /** `[along the curve, around it]`. Default `[64, 8]`. */
    segments?: Segments3D;
    closed?: boolean;
}

// ─── Arbitrary vertex data ───────────────────────────────────────────────────

/**
 * Raw vertex buffers — the general escape hatch that makes *any* computable mesh
 * expressible without leaving pure data.
 *
 * `position` is required and holds `[x, y, z, x, y, z, …]`. `index` lets vertices
 * be shared between faces. Omit `normal` and set {@link computeNormals} to have
 * them derived.
 */
export interface BufferGeometry3D extends Passthrough3D {
    type: "buffer";
    /** Flat `xyz` triples. */
    position: ArrayLike<number>;
    /** Flat `xyz` triples. Omit and set {@link computeNormals} to derive them. */
    normal?: ArrayLike<number>;
    /** Flat `uv` pairs. */
    uv?: ArrayLike<number>;
    /** Flat linear `rgb` triples. Needs `vertexColors: true` on the material. */
    color?: ArrayLike<number>;
    /** Triangle indices into the arrays above. */
    index?: ArrayLike<number>;
    /** Derive vertex normals after upload — needed for correct lighting. */
    computeNormals?: boolean;
    /**
     * Bump after mutating an array **in place** to force a re-upload.
     *
     * Reusing one `Float32Array` across frames and writing into it is the fast
     * way to animate a mesh, but it defeats identity comparison — the renderer
     * sees the same array object and cannot tell the contents changed. Bumping
     * `revision` tells it explicitly.
     *
     * With `revision` omitted the renderer re-uploads every frame, which is
     * correct-by-default for a buffer you built deliberately. Set
     * {@link staticData} once the data stops changing.
     */
    revision?: number;
    /**
     * Declare the arrays immutable, so the renderer compares by identity alone
     * and skips the per-frame re-upload. Only safe when you never mutate in place.
     */
    staticData?: boolean;
}

/** One evaluated vertex of a {@link ParametricGeometry3D} surface. */
export type ParametricVertex3D = Vector3 | readonly [number, number, number];

/**
 * A surface sampled over a `[0,1] × [0,1]` grid — the ergonomic form of
 * {@link BufferGeometry3D} for procedural meshes (waves, terrain, ribbons).
 *
 * Core evaluates the callbacks into vertex buffers at record time, so the
 * descriptor handed to the renderer is still plain data. Re-evaluated every
 * frame, so read signals and the frame time inside `vertex`.
 *
 *   Geo.parametric({
 *       segments: [70, 70],
 *       vertex: (u, v) => ({ x: (u - 0.5) * 20, y: wave(u, v, t), z: (v - 0.5) * 20 }),
 *       computeNormals: true,
 *   })
 */
export interface ParametricGeometry3D extends Passthrough3D {
    type: "parametric";
    /** Grid resolution as `[u, v]`, or one number for both. */
    segments: Segments3D;
    /** Position for grid coordinate `(u, v)`, both in `[0, 1]`. */
    vertex: (u: number, v: number) => ParametricVertex3D;
    /** Optional per-vertex colour. Needs `vertexColors: true` on the material. */
    color?: (u: number, v: number, position: Vector3) => Color;
    /** Derive vertex normals. Almost always wanted for a lit surface. */
    computeNormals?: boolean;
    /**
     * A value that changes exactly when {@link vertex} would return something
     * different — supply it and the surface is re-evaluated only when it moves.
     *
     * Omitted (the default) the surface is re-evaluated **every frame**, which is
     * what makes the `read signals and the frame time inside vertex` contract
     * above work without any bookkeeping. It is also expensive: `segments: 80` is
     * ~6.6k calls to `vertex`, plus normals and a full buffer re-upload, and a
     * frame draws for any reason at all — an unrelated node being dragged, the
     * camera orbiting, a tween elsewhere in the scene. A surface whose shape did
     * not change pays all of that for an identical result.
     *
     * `vertex` is a closure, so the renderer cannot inspect what it captured;
     * only the author knows. Derive this from exactly those captures — the
     * domain, the amplitude, the identity of the function being plotted — and
     * leave it out for a surface that genuinely varies with time.
     *
     * Same name and same role as {@link BufferGeometry3D.revision}: the explicit
     * "this is what changed" signal. `segments` needs no help here, being plain
     * data the renderer already compares.
     */
    revision?: number;
}

// ─── Derived ─────────────────────────────────────────────────────────────────

/**
 * The hard edges of another geometry, as line segments — a clean wireframe
 * outline without the diagonals of a triangulated one. Draw it with
 * `Graphics3D.line({ segments: true })`.
 */
export interface EdgesGeometry3D extends Passthrough3D {
    type: "edges";
    source: Geometry3D;
    /** Minimum dihedral angle in **degrees** for an edge to count. Default 1. */
    thresholdAngle?: number;
}

/** Every triangle edge of another geometry, as line segments. */
export interface WireframeGeometry3D extends Passthrough3D {
    type: "wireframe";
    source: Geometry3D;
}

/** Geometry taken from a loaded model file, by node name. */
export interface ModelGeometry3D extends Passthrough3D {
    type: "modelGeometry";
    src: string;
    /** Which node of the model to take. Defaults to the first mesh found. */
    node?: string;
}

/** Normalize {@link CylinderGeometry3D.radius} to its `[top, bottom]` pair. */
export function cylinderRadii(
    radius: number | readonly [number, number] | undefined,
): [number, number] {
    if (radius === undefined) return [1, 1];
    if (typeof radius === "number") return [radius, radius];
    return [radius[0] ?? 1, radius[1] ?? radius[0] ?? 1];
}

/** Normalize {@link ExtrudeGeometry3D.bevel} to its full option set, or `null`. */
export function resolveBevel3D(bevel: number | Bevel3D | undefined): Required<Bevel3D> | null {
    if (bevel === undefined) return null;
    const options = typeof bevel === "number" ? { size: bevel } : bevel;
    const size = options.size ?? 0.1;
    return {
        size,
        // Scaled off `size` rather than defaulted independently, so the one-number
        // form produces a bevel with sane proportions instead of a sliver.
        thickness: options.thickness ?? size * 2,
        offset: options.offset ?? 0,
        segments: options.segments ?? 3,
    };
}

/**
 * Evaluate a {@link ParametricGeometry3D} into concrete vertex buffers.
 *
 * Lives in core rather than the renderer so the grid/winding maths is
 * backend-agnostic and unit-testable without a GPU. Called by the renderer at
 * draw time (not at record time) so the cost is only paid when the frame is
 * actually rasterized, and never during the asset-tracking replay.
 *
 * The grid is `(segments + 1)²` vertices wound counter-clockwise, so front faces
 * point along +Y for a surface authored in the XZ plane.
 */
export function evaluateParametric(geometry: ParametricGeometry3D): BufferGeometry3D {
    const resolved = geometry.segments;
    const [uSegments, vSegments] = typeof resolved === "number"
        ? [resolved, resolved]
        : [resolved[0] ?? 1, resolved[1] ?? resolved[0] ?? 1];

    const uCount = Math.max(1, Math.floor(uSegments)) + 1;
    const vCount = Math.max(1, Math.floor(vSegments)) + 1;

    const position = new Float32Array(uCount * vCount * 3);
    const uv = new Float32Array(uCount * vCount * 2);
    const color = geometry.color ? new Float32Array(uCount * vCount * 3) : undefined;

    const scratch: Vector3 = { x: 0, y: 0, z: 0 };

    for (let vi = 0; vi < vCount; vi++) {
        const v = vi / (vCount - 1);
        for (let ui = 0; ui < uCount; ui++) {
            const u = ui / (uCount - 1);
            const index = vi * uCount + ui;

            const vertex = geometry.vertex(u, v);
            if (Array.isArray(vertex)) {
                scratch.x = vertex[0]; scratch.y = vertex[1]; scratch.z = vertex[2];
            } else {
                const p = vertex as Vector3;
                scratch.x = p.x; scratch.y = p.y; scratch.z = p.z;
            }

            position[index * 3] = scratch.x;
            position[index * 3 + 1] = scratch.y;
            position[index * 3 + 2] = scratch.z;

            uv[index * 2] = u;
            uv[index * 2 + 1] = v;

            if (color && geometry.color) {
                const rgba = resolveLinearRgb(geometry.color(u, v, scratch));
                color[index * 3] = rgba[0];
                color[index * 3 + 1] = rgba[1];
                color[index * 3 + 2] = rgba[2];
            }
        }
    }

    // Two triangles per cell. Uint32 because a 256² grid already exceeds Uint16.
    const index = new Uint32Array((uCount - 1) * (vCount - 1) * 6);
    let cursor = 0;
    for (let vi = 0; vi < vCount - 1; vi++) {
        for (let ui = 0; ui < uCount - 1; ui++) {
            const a = vi * uCount + ui;
            const b = a + 1;
            const c = a + uCount;
            const d = c + 1;
            index[cursor++] = a; index[cursor++] = c; index[cursor++] = b;
            index[cursor++] = b; index[cursor++] = c; index[cursor++] = d;
        }
    }

    return {
        type: "buffer",
        position,
        uv,
        color,
        index,
        computeNormals: geometry.computeNormals,
        params: geometry.params,
    };
}

/**
 * A {@link Color} as **linear-light** RGB, which is what a vertex-colour buffer
 * must hold: a renderer samples that attribute directly into its linear working
 * space, with no decode step of its own.
 *
 * `parseColor` returns gamma-encoded sRGB (hex is `byte / 255`), so the sRGB
 * transfer function has to be inverted here. Skipping this renders vertex-coloured
 * surfaces visibly washed out.
 */
function resolveLinearRgb(color: Color): readonly [number, number, number] {
    const [r, g, b] = typeof color === "string" ? parseColor(color) : color;
    return [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)];
}

/** Inverse sRGB transfer function (IEC 61966-2-1), per channel. */
function srgbToLinear(channel: number): number {
    return channel <= 0.04045
        ? channel / 12.92
        : Math.pow((channel + 0.055) / 1.055, 2.4);
}

/**
 * Every geometry a mesh can be built from. Discriminated on `type`, so new
 * shapes are additive.
 */
export type Geometry3D =
    | BoxGeometry3D
    | SphereGeometry3D
    | PlaneGeometry3D
    | CylinderGeometry3D
    | ConeGeometry3D
    | TorusGeometry3D
    | TorusKnotGeometry3D
    | CircleGeometry3D
    | RingGeometry3D
    | CapsuleGeometry3D
    | PolyhedronGeometry3D
    | ExtrudeGeometry3D
    | LatheGeometry3D
    | TubeGeometry3D
    | BufferGeometry3D
    | ParametricGeometry3D
    | EdgesGeometry3D
    | WireframeGeometry3D
    | ModelGeometry3D;
