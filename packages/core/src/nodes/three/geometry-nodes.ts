import { property } from "@/attributes/properties/decorator";
import type {
    BoxGeometry3D, CapsuleGeometry3D, CircleGeometry3D, ConeGeometry3D,
    CylinderGeometry3D, ExtrudeGeometry3D, Geometry3D, LatheGeometry3D,
    PlaneGeometry3D, PolyhedronGeometry3D, RingGeometry3D, SphereGeometry3D,
    TorusGeometry3D, TorusKnotGeometry3D, TubeGeometry3D,
} from "@/render3d/geometry";
import { Mesh3D, type Mesh3DProps } from "./mesh3d";

/**
 * The geometry nodes: one per shape `Graphics3D` has sugar for, so a scene reads
 * as a tree of things rather than as a builder chain.
 *
 *   <Box3D width={2} color="tomato" roughness={0.3} />
 *   <Torus3D radius={1.4} tube={0.08} position={[3, 0, 0]} />
 *
 * Each is a {@link Mesh3D}, so it carries the whole material vocabulary and the
 * whole `Node3D` transform. The only thing a subclass adds is its geometry's own
 * parameters — every one optional, so an unset parameter stays *absent* from the
 * descriptor and the renderer's own default applies rather than one invented here.
 *
 * A shape without sugar (a buffer, a parametric surface, a loaded model's mesh)
 * goes through the base directly: `<Mesh3D geometry={Geo.parametric({ … })} />`.
 *
 * **Geometry parameters are expensive to animate.** Three's geometries are
 * immutable, so tweening `radius` reallocates the mesh every frame. Tween
 * `scale` instead — it is an in-place write on the object's matrix.
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

// ─── box ─────────────────────────────────────────────────────────────────────

export interface Box3DProps extends Mesh3DProps, Partial<ParamsOf<BoxGeometry3D>> { }

const BOX_KEYS = ["width", "height", "depth", "widthSegments", "heightSegments", "depthSegments"] as const;

export class Box3D<P extends Box3DProps = Box3DProps> extends Mesh3D<P> {
    @property({ default: undefined }) declare width: number | undefined;
    @property({ default: undefined }) declare height: number | undefined;
    @property({ default: undefined }) declare depth: number | undefined;
    @property({ default: undefined }) declare widthSegments: number | undefined;
    @property({ default: undefined }) declare heightSegments: number | undefined;
    @property({ default: undefined }) declare depthSegments: number | undefined;

    protected override buildGeometry(): Geometry3D {
        return geometryFrom("box", this, BOX_KEYS);
    }
}

// ─── sphere ──────────────────────────────────────────────────────────────────

export interface Sphere3DProps extends Mesh3DProps, Partial<ParamsOf<SphereGeometry3D>> { }

const SPHERE_KEYS = ["radius", "widthSegments", "heightSegments", "phiStart", "phiLength", "thetaStart", "thetaLength"] as const;

export class Sphere3D<P extends Sphere3DProps = Sphere3DProps> extends Mesh3D<P> {
    @property({ default: undefined }) declare radius: number | undefined;
    @property({ default: undefined }) declare widthSegments: number | undefined;
    @property({ default: undefined }) declare heightSegments: number | undefined;
    @property({ default: undefined }) declare phiStart: number | undefined;
    @property({ default: undefined }) declare phiLength: number | undefined;
    @property({ default: undefined }) declare thetaStart: number | undefined;
    @property({ default: undefined }) declare thetaLength: number | undefined;

    protected override buildGeometry(): Geometry3D {
        return geometryFrom("sphere", this, SPHERE_KEYS);
    }
}

// ─── plane ───────────────────────────────────────────────────────────────────

export interface Plane3DProps extends Mesh3DProps, Partial<ParamsOf<PlaneGeometry3D>> { }

const PLANE_KEYS = ["width", "height", "widthSegments", "heightSegments"] as const;

export class Plane3D<P extends Plane3DProps = Plane3DProps> extends Mesh3D<P> {
    @property({ default: undefined }) declare width: number | undefined;
    @property({ default: undefined }) declare height: number | undefined;
    @property({ default: undefined }) declare widthSegments: number | undefined;
    @property({ default: undefined }) declare heightSegments: number | undefined;

    protected override buildGeometry(): Geometry3D {
        return geometryFrom("plane", this, PLANE_KEYS);
    }
}

// ─── cylinder ────────────────────────────────────────────────────────────────

export interface Cylinder3DProps extends Mesh3DProps, Partial<ParamsOf<CylinderGeometry3D>> { }

const CYLINDER_KEYS = ["radiusTop", "radiusBottom", "height", "radialSegments", "heightSegments", "openEnded", "thetaStart", "thetaLength"] as const;

export class Cylinder3D<P extends Cylinder3DProps = Cylinder3DProps> extends Mesh3D<P> {
    @property({ default: undefined }) declare radiusTop: number | undefined;
    @property({ default: undefined }) declare radiusBottom: number | undefined;
    @property({ default: undefined }) declare height: number | undefined;
    @property({ default: undefined }) declare radialSegments: number | undefined;
    @property({ default: undefined }) declare heightSegments: number | undefined;
    @property({ default: undefined }) declare openEnded: boolean | undefined;
    @property({ default: undefined }) declare thetaStart: number | undefined;
    @property({ default: undefined }) declare thetaLength: number | undefined;

    protected override buildGeometry(): Geometry3D {
        return geometryFrom("cylinder", this, CYLINDER_KEYS);
    }
}

// ─── cone ────────────────────────────────────────────────────────────────────

export interface Cone3DProps extends Mesh3DProps, Partial<ParamsOf<ConeGeometry3D>> { }

const CONE_KEYS = ["radius", "height", "radialSegments", "heightSegments", "openEnded", "thetaStart", "thetaLength"] as const;

export class Cone3D<P extends Cone3DProps = Cone3DProps> extends Mesh3D<P> {
    @property({ default: undefined }) declare radius: number | undefined;
    @property({ default: undefined }) declare height: number | undefined;
    @property({ default: undefined }) declare radialSegments: number | undefined;
    @property({ default: undefined }) declare heightSegments: number | undefined;
    @property({ default: undefined }) declare openEnded: boolean | undefined;
    @property({ default: undefined }) declare thetaStart: number | undefined;
    @property({ default: undefined }) declare thetaLength: number | undefined;

    protected override buildGeometry(): Geometry3D {
        return geometryFrom("cone", this, CONE_KEYS);
    }
}

// ─── torus ───────────────────────────────────────────────────────────────────

export interface Torus3DProps extends Mesh3DProps, Partial<ParamsOf<TorusGeometry3D>> { }

const TORUS_KEYS = ["radius", "tube", "radialSegments", "tubularSegments", "arc"] as const;

export class Torus3D<P extends Torus3DProps = Torus3DProps> extends Mesh3D<P> {
    @property({ default: undefined }) declare radius: number | undefined;
    @property({ default: undefined }) declare tube: number | undefined;
    @property({ default: undefined }) declare radialSegments: number | undefined;
    @property({ default: undefined }) declare tubularSegments: number | undefined;
    @property({ default: undefined }) declare arc: number | undefined;

    protected override buildGeometry(): Geometry3D {
        return geometryFrom("torus", this, TORUS_KEYS);
    }
}

// ─── torus knot ──────────────────────────────────────────────────────────────

export interface TorusKnot3DProps extends Mesh3DProps, Partial<ParamsOf<TorusKnotGeometry3D>> { }

const TORUS_KNOT_KEYS = ["radius", "tube", "tubularSegments", "radialSegments", "p", "q"] as const;

export class TorusKnot3D<P extends TorusKnot3DProps = TorusKnot3DProps> extends Mesh3D<P> {
    @property({ default: undefined }) declare radius: number | undefined;
    @property({ default: undefined }) declare tube: number | undefined;
    @property({ default: undefined }) declare tubularSegments: number | undefined;
    @property({ default: undefined }) declare radialSegments: number | undefined;
    @property({ default: undefined }) declare p: number | undefined;
    @property({ default: undefined }) declare q: number | undefined;

    protected override buildGeometry(): Geometry3D {
        return geometryFrom("torusKnot", this, TORUS_KNOT_KEYS);
    }
}

// ─── circle ──────────────────────────────────────────────────────────────────

export interface Circle3DProps extends Mesh3DProps, Partial<ParamsOf<CircleGeometry3D>> { }

const CIRCLE_KEYS = ["radius", "segments", "thetaStart", "thetaLength"] as const;

export class Circle3D<P extends Circle3DProps = Circle3DProps> extends Mesh3D<P> {
    @property({ default: undefined }) declare radius: number | undefined;
    @property({ default: undefined }) declare segments: number | undefined;
    @property({ default: undefined }) declare thetaStart: number | undefined;
    @property({ default: undefined }) declare thetaLength: number | undefined;

    protected override buildGeometry(): Geometry3D {
        return geometryFrom("circle", this, CIRCLE_KEYS);
    }
}

// ─── ring ────────────────────────────────────────────────────────────────────

export interface Ring3DProps extends Mesh3DProps, Partial<ParamsOf<RingGeometry3D>> { }

const RING_KEYS = ["innerRadius", "outerRadius", "thetaSegments", "phiSegments", "thetaStart", "thetaLength"] as const;

export class Ring3D<P extends Ring3DProps = Ring3DProps> extends Mesh3D<P> {
    @property({ default: undefined }) declare innerRadius: number | undefined;
    @property({ default: undefined }) declare outerRadius: number | undefined;
    @property({ default: undefined }) declare thetaSegments: number | undefined;
    @property({ default: undefined }) declare phiSegments: number | undefined;
    @property({ default: undefined }) declare thetaStart: number | undefined;
    @property({ default: undefined }) declare thetaLength: number | undefined;

    protected override buildGeometry(): Geometry3D {
        return geometryFrom("ring", this, RING_KEYS);
    }
}

// ─── capsule ─────────────────────────────────────────────────────────────────

export interface Capsule3DProps extends Mesh3DProps, Partial<ParamsOf<CapsuleGeometry3D>> { }

const CAPSULE_KEYS = ["radius", "height", "capSegments", "radialSegments"] as const;

export class Capsule3D<P extends Capsule3DProps = Capsule3DProps> extends Mesh3D<P> {
    @property({ default: undefined }) declare radius: number | undefined;
    @property({ default: undefined }) declare height: number | undefined;
    @property({ default: undefined }) declare capSegments: number | undefined;
    @property({ default: undefined }) declare radialSegments: number | undefined;

    protected override buildGeometry(): Geometry3D {
        return geometryFrom("capsule", this, CAPSULE_KEYS);
    }
}

// ─── polyhedron ──────────────────────────────────────────────────────────────

export interface Polyhedron3DProps extends Mesh3DProps, Partial<ParamsOf<PolyhedronGeometry3D>> { }

const POLYHEDRON_KEYS = ["shape", "radius", "detail"] as const;

export class Polyhedron3D<P extends Polyhedron3DProps = Polyhedron3DProps> extends Mesh3D<P> {
    @property({ default: "icosahedron" }) declare shape: PolyhedronGeometry3D["shape"];
    @property({ default: undefined }) declare radius: number | undefined;
    @property({ default: undefined }) declare detail: number | undefined;

    protected override buildGeometry(): Geometry3D {
        return geometryFrom("polyhedron", this, POLYHEDRON_KEYS);
    }
}

// ─── extrude ─────────────────────────────────────────────────────────────────

export interface Extrude3DProps extends Mesh3DProps, Partial<ParamsOf<ExtrudeGeometry3D>> { }

const EXTRUDE_KEYS = ["shape", "depth", "curveSegments", "bevel", "bevelThickness", "bevelSize", "bevelOffset", "bevelSegments"] as const;

export class Extrude3D<P extends Extrude3DProps = Extrude3DProps> extends Mesh3D<P> {
    @property({ default: undefined }) declare shape: ExtrudeGeometry3D["shape"];
    @property({ default: undefined }) declare curveSegments: number | undefined;
    @property({ default: undefined }) declare bevel: boolean | undefined;
    @property({ default: undefined }) declare bevelThickness: number | undefined;
    @property({ default: undefined }) declare bevelSize: number | undefined;
    @property({ default: undefined }) declare bevelOffset: number | undefined;
    @property({ default: undefined }) declare bevelSegments: number | undefined;

    protected override buildGeometry(): Geometry3D {
        return geometryFrom("extrude", this, EXTRUDE_KEYS);
    }
}

// ─── lathe ───────────────────────────────────────────────────────────────────

export interface Lathe3DProps extends Mesh3DProps, Partial<ParamsOf<LatheGeometry3D>> { }

const LATHE_KEYS = ["points", "segments", "phiStart", "phiLength"] as const;

export class Lathe3D<P extends Lathe3DProps = Lathe3DProps> extends Mesh3D<P> {
    @property({ default: undefined }) declare points: LatheGeometry3D["points"];
    @property({ default: undefined }) declare segments: number | undefined;
    @property({ default: undefined }) declare phiStart: number | undefined;
    @property({ default: undefined }) declare phiLength: number | undefined;

    protected override buildGeometry(): Geometry3D {
        return geometryFrom("lathe", this, LATHE_KEYS);
    }
}

// ─── tube ────────────────────────────────────────────────────────────────────

export interface Tube3DProps extends Mesh3DProps, Partial<ParamsOf<TubeGeometry3D>> { }

const TUBE_KEYS = ["points", "tubularSegments", "radius", "radialSegments", "closed"] as const;

export class Tube3D<P extends Tube3DProps = Tube3DProps> extends Mesh3D<P> {
    @property({ default: undefined }) declare points: TubeGeometry3D["points"];
    @property({ default: undefined }) declare tubularSegments: number | undefined;
    @property({ default: undefined }) declare radialSegments: number | undefined;
    @property({ default: undefined }) declare closed: boolean | undefined;

    protected override buildGeometry(): Geometry3D {
        return geometryFrom("tube", this, TUBE_KEYS);
    }
}
