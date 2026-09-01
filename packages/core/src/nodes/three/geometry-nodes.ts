import { property } from "@/attributes/properties/decorator";
import type { PathBuilder } from "@/render/descriptors/path-builder";
import type { PathData } from "@/render/descriptors/path";
import type {
    Bevel3D, BoxGeometry3D, CapsuleGeometry3D, CircleGeometry3D, ConeGeometry3D,
    CylinderGeometry3D, ExtrudeGeometry3D, Geometry3D, LatheGeometry3D,
    PlaneGeometry3D, PolyhedronGeometry3D, RingGeometry3D, SphereGeometry3D,
    TorusGeometry3D, TorusKnotGeometry3D, TubeGeometry3D,
} from "@/render3d/geometry";
import type { Segments3D } from "@/render3d/segments";
import type { Vector3Input } from "@/render3d/vector3";
import { Mesh3D, type Mesh3DProps } from "./mesh3d";

/**
 * The geometry nodes: one per shape `Graphics3D` has sugar for, so a scene reads
 * as a tree of things rather than as a builder chain.
 *
 *   <Box3D width={2} cornerRadius={0.15} fill="tomato" roughness={0.3} />
 *   <Torus3D radius={1.4} thickness={0.08} position={[3, 0, 0]} />
 *
 * Each is a {@link Mesh3D}, so it carries the whole material vocabulary and the
 * whole `Node3D` transform. The only thing a subclass adds is its geometry's own
 * parameters — every one optional, so an unset parameter stays *absent* from the
 * descriptor and the renderer's own default applies rather than one invented here.
 *
 * ── Two names, everywhere ─────────────────────────────────────────────────────
 * Subdivision is always `segments` (a number, or a per-axis tuple whose order
 * each shape documents), replacing the ten spellings three has for it. A partial
 * revolution is always `startAngle` + `sweep` in degrees — the pair `Ellipse` has
 * used since the beginning — replacing `thetaStart`, `thetaLength`, `phiStart`,
 * `phiLength` and `arc`.
 *
 * A shape without sugar (a buffer, a parametric surface, a loaded model's mesh)
 * goes through the base directly: `<Mesh3D geometry={Geo.parametric({ … })} />`.
 *
 * **Geometry parameters are expensive to animate.** Three's geometries are
 * immutable, so tweening `radius` reallocates the mesh every frame. Tween
 * `scale` (or one of `scaleX`/`scaleY`/`scaleZ`) instead — those are in-place
 * writes on the object's matrix.
 */

/** Params of a geometry descriptor, minus its discriminant. */
type ParamsOf<G extends { type: string }> = Omit<G, "type">;

/**
 * Gather the set parameters off a node into a geometry descriptor.
 *
 * Reads through the signal accessors, so every parameter is reactive and a
 * `to()` on one rebuilds the geometry on the next frame.
 */
function geometryFrom(type: Geometry3D["type"], node: object, keys: readonly string[]): Geometry3D {
    const out: Record<string, unknown> = { type };
    for (const key of keys) {
        const value = (node as Record<string, unknown>)[key];
        if (value !== undefined) out[key] = value;
    }
    return out as unknown as Geometry3D;
}

/** The two sweep props every partially-revolvable shape carries. */
const SWEEP_KEYS = ["startAngle", "sweep"] as const;

// ─── box ─────────────────────────────────────────────────────────────────────

export interface Box3DProps extends Mesh3DProps, Partial<ParamsOf<BoxGeometry3D>> { }

const BOX_KEYS = ["width", "height", "depth", "cornerRadius", "segments"] as const;

/**
 * A box — and, with `cornerRadius`, the rounded box that most of a designed 3D
 * scene is made of. Same prop name and same meaning as `Rect`'s.
 */
export class Box3D<P extends Box3DProps = Box3DProps> extends Mesh3D<P> {
    @property({ default: undefined }) declare width: number | undefined;
    @property({ default: undefined }) declare height: number | undefined;
    @property({ default: undefined }) declare depth: number | undefined;
    @property({ default: undefined }) declare cornerRadius: number | undefined;
    @property({ default: undefined }) declare segments: Segments3D | undefined;

    protected override buildGeometry(): Geometry3D {
        return geometryFrom("box", this, BOX_KEYS);
    }
}

// ─── sphere ──────────────────────────────────────────────────────────────────

export interface Sphere3DProps extends Mesh3DProps, Partial<ParamsOf<SphereGeometry3D>> { }

const SPHERE_KEYS = ["radius", "segments", "startLatitude", "latitudeSweep", ...SWEEP_KEYS] as const;

/** A sphere. `segments` is `[longitude, latitude]`. */
export class Sphere3D<P extends Sphere3DProps = Sphere3DProps> extends Mesh3D<P> {
    @property({ default: undefined }) declare radius: number | undefined;
    @property({ default: undefined }) declare segments: Segments3D | undefined;
    @property({ default: undefined }) declare startAngle: number | undefined;
    @property({ default: undefined }) declare sweep: number | undefined;
    @property({ default: undefined }) declare startLatitude: number | undefined;
    @property({ default: undefined }) declare latitudeSweep: number | undefined;

    protected override buildGeometry(): Geometry3D {
        return geometryFrom("sphere", this, SPHERE_KEYS);
    }
}

// ─── plane ───────────────────────────────────────────────────────────────────

export interface Plane3DProps extends Mesh3DProps, Partial<ParamsOf<PlaneGeometry3D>> { }

const PLANE_KEYS = ["width", "height", "segments"] as const;

/** A flat quad. `segments` is `[width, height]`. */
export class Plane3D<P extends Plane3DProps = Plane3DProps> extends Mesh3D<P> {
    @property({ default: undefined }) declare width: number | undefined;
    @property({ default: undefined }) declare height: number | undefined;
    @property({ default: undefined }) declare segments: Segments3D | undefined;

    protected override buildGeometry(): Geometry3D {
        return geometryFrom("plane", this, PLANE_KEYS);
    }
}

// ─── cylinder ────────────────────────────────────────────────────────────────

export interface Cylinder3DProps extends Mesh3DProps, Partial<ParamsOf<CylinderGeometry3D>> { }

const CYLINDER_KEYS = ["radius", "height", "segments", "capped", ...SWEEP_KEYS] as const;

/**
 * A cylinder, or any tapered tube: `radius={[top, bottom]}`. `segments` is
 * `[radial, height]`.
 */
export class Cylinder3D<P extends Cylinder3DProps = Cylinder3DProps> extends Mesh3D<P> {
    @property({ default: undefined }) declare radius: number | readonly [number, number] | undefined;
    @property({ default: undefined }) declare height: number | undefined;
    @property({ default: undefined }) declare segments: Segments3D | undefined;
    @property({ default: undefined }) declare capped: boolean | undefined;
    @property({ default: undefined }) declare startAngle: number | undefined;
    @property({ default: undefined }) declare sweep: number | undefined;

    protected override buildGeometry(): Geometry3D {
        return geometryFrom("cylinder", this, CYLINDER_KEYS);
    }
}

// ─── cone ────────────────────────────────────────────────────────────────────

export interface Cone3DProps extends Mesh3DProps, Partial<ParamsOf<ConeGeometry3D>> { }

const CONE_KEYS = ["radius", "height", "segments", "capped", ...SWEEP_KEYS] as const;

/** A cone. `segments` is `[radial, height]`. */
export class Cone3D<P extends Cone3DProps = Cone3DProps> extends Mesh3D<P> {
    @property({ default: undefined }) declare radius: number | undefined;
    @property({ default: undefined }) declare height: number | undefined;
    @property({ default: undefined }) declare segments: Segments3D | undefined;
    @property({ default: undefined }) declare capped: boolean | undefined;
    @property({ default: undefined }) declare startAngle: number | undefined;
    @property({ default: undefined }) declare sweep: number | undefined;

    protected override buildGeometry(): Geometry3D {
        return geometryFrom("cone", this, CONE_KEYS);
    }
}

// ─── torus ───────────────────────────────────────────────────────────────────

export interface Torus3DProps extends Mesh3DProps, Partial<ParamsOf<TorusGeometry3D>> { }

const TORUS_KEYS = ["radius", "thickness", "segments", ...SWEEP_KEYS] as const;

/** A ring. `thickness` is the strand; `segments` is `[radial, tubular]`. */
export class Torus3D<P extends Torus3DProps = Torus3DProps> extends Mesh3D<P> {
    @property({ default: undefined }) declare radius: number | undefined;
    @property({ default: undefined }) declare thickness: number | undefined;
    @property({ default: undefined }) declare segments: Segments3D | undefined;
    @property({ default: undefined }) declare startAngle: number | undefined;
    @property({ default: undefined }) declare sweep: number | undefined;

    protected override buildGeometry(): Geometry3D {
        return geometryFrom("torus", this, TORUS_KEYS);
    }
}

// ─── torus knot ──────────────────────────────────────────────────────────────

export interface TorusKnot3DProps extends Mesh3DProps, Partial<ParamsOf<TorusKnotGeometry3D>> { }

const TORUS_KNOT_KEYS = ["radius", "thickness", "segments", "windings"] as const;

/** A knotted ring. `windings` is `[p, q]`; `segments` is `[tubular, radial]`. */
export class TorusKnot3D<P extends TorusKnot3DProps = TorusKnot3DProps> extends Mesh3D<P> {
    @property({ default: undefined }) declare radius: number | undefined;
    @property({ default: undefined }) declare thickness: number | undefined;
    @property({ default: undefined }) declare segments: Segments3D | undefined;
    @property({ default: undefined }) declare windings: readonly [number, number] | undefined;

    protected override buildGeometry(): Geometry3D {
        return geometryFrom("torusKnot", this, TORUS_KNOT_KEYS);
    }
}

// ─── circle ──────────────────────────────────────────────────────────────────

export interface Circle3DProps extends Mesh3DProps, Partial<ParamsOf<CircleGeometry3D>> { }

const CIRCLE_KEYS = ["radius", "segments", ...SWEEP_KEYS] as const;

/** A flat disc, or a pie slice via `startAngle`/`sweep` — exactly as `Ellipse`. */
export class Circle3D<P extends Circle3DProps = Circle3DProps> extends Mesh3D<P> {
    @property({ default: undefined }) declare radius: number | undefined;
    @property({ default: undefined }) declare segments: Segments3D | undefined;
    @property({ default: undefined }) declare startAngle: number | undefined;
    @property({ default: undefined }) declare sweep: number | undefined;

    protected override buildGeometry(): Geometry3D {
        return geometryFrom("circle", this, CIRCLE_KEYS);
    }
}

// ─── ring ────────────────────────────────────────────────────────────────────

export interface Ring3DProps extends Mesh3DProps, Partial<ParamsOf<RingGeometry3D>> { }

const RING_KEYS = ["radius", "innerRadius", "segments", ...SWEEP_KEYS] as const;

/** A flat annulus. `radius` is the outer edge; `segments` is `[around, radial]`. */
export class Ring3D<P extends Ring3DProps = Ring3DProps> extends Mesh3D<P> {
    @property({ default: undefined }) declare radius: number | undefined;
    @property({ default: undefined }) declare innerRadius: number | undefined;
    @property({ default: undefined }) declare segments: Segments3D | undefined;
    @property({ default: undefined }) declare startAngle: number | undefined;
    @property({ default: undefined }) declare sweep: number | undefined;

    protected override buildGeometry(): Geometry3D {
        return geometryFrom("ring", this, RING_KEYS);
    }
}

// ─── capsule ─────────────────────────────────────────────────────────────────

export interface Capsule3DProps extends Mesh3DProps, Partial<ParamsOf<CapsuleGeometry3D>> { }

const CAPSULE_KEYS = ["radius", "height", "segments"] as const;

/** A pill. `height` is the straight mid-section; `segments` is `[radial, cap]`. */
export class Capsule3D<P extends Capsule3DProps = Capsule3DProps> extends Mesh3D<P> {
    @property({ default: undefined }) declare radius: number | undefined;
    @property({ default: undefined }) declare height: number | undefined;
    @property({ default: undefined }) declare segments: Segments3D | undefined;

    protected override buildGeometry(): Geometry3D {
        return geometryFrom("capsule", this, CAPSULE_KEYS);
    }
}

// ─── polyhedron ──────────────────────────────────────────────────────────────

export interface Polyhedron3DProps extends Mesh3DProps, Partial<ParamsOf<PolyhedronGeometry3D>> { }

const POLYHEDRON_KEYS = ["shape", "radius", "segments"] as const;

/** A platonic solid. `segments` subdivides it toward a sphere. */
export class Polyhedron3D<P extends Polyhedron3DProps = Polyhedron3DProps> extends Mesh3D<P> {
    @property({ default: "icosahedron" }) declare shape: PolyhedronGeometry3D["shape"];
    @property({ default: undefined }) declare radius: number | undefined;
    @property({ default: undefined }) declare segments: Segments3D | undefined;

    protected override buildGeometry(): Geometry3D {
        return geometryFrom("polyhedron", this, POLYHEDRON_KEYS);
    }
}

// ─── extrude ─────────────────────────────────────────────────────────────────

export interface Extrude3DProps extends Mesh3DProps, Partial<ParamsOf<ExtrudeGeometry3D>> { }

const EXTRUDE_KEYS = ["path", "depth", "segments", "bevel"] as const;

/**
 * A 2D outline swept into a solid. `path` takes the same value the 2D `Path`
 * node's own `path` prop does — same name, same vocabulary.
 */
export class Extrude3D<P extends Extrude3DProps = Extrude3DProps> extends Mesh3D<P> {
    @property({ default: undefined }) declare path: PathData | PathBuilder | undefined;
    @property({ default: undefined }) declare depth: number | undefined;
    @property({ default: undefined }) declare segments: Segments3D | undefined;
    @property({ default: undefined }) declare bevel: number | Bevel3D | undefined;

    protected override buildGeometry(): Geometry3D {
        return geometryFrom("extrude", this, EXTRUDE_KEYS);
    }
}

// ─── lathe ───────────────────────────────────────────────────────────────────

export interface Lathe3DProps extends Mesh3DProps, Partial<ParamsOf<LatheGeometry3D>> { }

const LATHE_KEYS = ["points", "segments", ...SWEEP_KEYS] as const;

/** A profile revolved about Y — vases, bowls, turned shapes. */
export class Lathe3D<P extends Lathe3DProps = Lathe3DProps> extends Mesh3D<P> {
    @property({ default: undefined }) declare points: readonly Vector3Input[] | undefined;
    @property({ default: undefined }) declare segments: Segments3D | undefined;
    @property({ default: undefined }) declare startAngle: number | undefined;
    @property({ default: undefined }) declare sweep: number | undefined;

    protected override buildGeometry(): Geometry3D {
        return geometryFrom("lathe", this, LATHE_KEYS);
    }
}

// ─── tube ────────────────────────────────────────────────────────────────────

export interface Tube3DProps extends Mesh3DProps, Partial<ParamsOf<TubeGeometry3D>> { }

const TUBE_KEYS = ["points", "radius", "segments", "closed"] as const;

/**
 * A circular cross-section swept along a curve. `closed` joins the ends, the
 * same prop the 2D `Line` node carries; `segments` is `[along, around]`.
 */
export class Tube3D<P extends Tube3DProps = Tube3DProps> extends Mesh3D<P> {
    @property({ default: undefined }) declare points: readonly Vector3Input[] | undefined;
    @property({ default: undefined }) declare radius: number | undefined;
    @property({ default: undefined }) declare segments: Segments3D | undefined;
    @property({ default: undefined }) declare closed: boolean | undefined;

    protected override buildGeometry(): Geometry3D {
        return geometryFrom("tube", this, TUBE_KEYS);
    }
}
