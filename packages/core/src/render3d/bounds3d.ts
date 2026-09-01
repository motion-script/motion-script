import { cylinderRadii, type Geometry3D } from "./geometry";
import { applyMatrix4, type Matrix4 } from "./matrix4";
import { resolveVector3, type Vector3 } from "./vector3";

/**
 * Axis-aligned bounds for the 3D descriptors — the "how big is it, and where" an
 * editor needs in order to put a box round a mesh it did not build.
 *
 * **Analytic, not sampled.** Every primitive's extent falls straight out of its
 * parameters, so this is a table of formulas rather than a walk over vertices,
 * and it costs nothing to ask per pointer move. The defaults each one falls back
 * to are *three's* defaults, not invented here, because a descriptor that omits
 * `radius` renders at three's 1 and a box drawn round a different number would
 * be a box in the wrong place — see the note on each.
 *
 * **Conservative where it is not exact.** A partial sweep (`thetaLength` on a
 * sphere, `arc` on a torus) is bounded by the full figure rather than by the
 * wedge actually drawn: the exact answer is an arc-endpoint problem per shape
 * per axis, and the cost of getting it wrong is a selection box that *cuts
 * through* the mesh, where the cost of over-reporting is one that sits a little
 * loose. Over-reporting is the safe direction, and it is the direction taken
 * everywhere here.
 *
 * **`null` means "no answer", not "empty".** Three descriptors genuinely cannot
 * be measured without something this package does not have: a loaded model file,
 * a rasterized path, or a user callback that may read the frame clock. A caller
 * that gets `null` draws no box, which is the honest outcome — a wrong box is
 * worse than none.
 */

/** An axis-aligned box. `min` is corner-wise minimum, not a point on the mesh. */
export interface Box3 {
    min: Vector3;
    max: Vector3;
}

/** @internal A box centred on the origin with the given half-extents. */
export function centeredBox3(hx: number, hy: number, hz: number): Box3 {
    return { min: { x: -hx, y: -hy, z: -hz }, max: { x: hx, y: hy, z: hz } };
}

/** @internal The union of two boxes; either may be `null`. */
export function unionBox3(a: Box3 | null, b: Box3 | null): Box3 | null {
    if (!a) return b;
    if (!b) return a;
    return {
        min: { x: Math.min(a.min.x, b.min.x), y: Math.min(a.min.y, b.min.y), z: Math.min(a.min.z, b.min.z) },
        max: { x: Math.max(a.max.x, b.max.x), y: Math.max(a.max.y, b.max.y), z: Math.max(a.max.z, b.max.z) },
    };
}

/** @internal The box's eight corners, in no particular order. */
export function corners3(box: Box3): Vector3[] {
    const { min, max } = box;
    return [
        { x: min.x, y: min.y, z: min.z },
        { x: max.x, y: min.y, z: min.z },
        { x: min.x, y: max.y, z: min.z },
        { x: max.x, y: max.y, z: min.z },
        { x: min.x, y: min.y, z: max.z },
        { x: max.x, y: min.y, z: max.z },
        { x: min.x, y: max.y, z: max.z },
        { x: max.x, y: max.y, z: max.z },
    ];
}

/**
 * `box` mapped through `m` and re-bounded — the AABB of the transformed AABB.
 *
 * Not the AABB of the transformed *mesh*: a rotated box's corner-bounds are
 * larger than the shape inside them. That slack is the price of not carrying
 * vertex data around, and it errs in the safe direction (see the module note).
 */
/** @internal */
export function transformBox3(box: Box3, m: Matrix4): Box3 {
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (const corner of corners3(box)) {
        const p = applyMatrix4(m, corner);
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.z < minZ) minZ = p.z;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
        if (p.z > maxZ) maxZ = p.z;
    }
    return { min: { x: minX, y: minY, z: minZ }, max: { x: maxX, y: maxY, z: maxZ } };
}

/**
 * The local-space bounds of a geometry descriptor, or `null` when it cannot be
 * measured from the descriptor alone. See the module note for both halves of
 * that sentence.
 */
export function geometryBounds3D(geometry: Geometry3D | undefined): Box3 | null {
    if (!geometry) return null;

    switch (geometry.type) {
        // three centres a box on its origin; the defaults are 1 on every axis.
        case "box":
            return centeredBox3(
                (geometry.width ?? 1) / 2,
                (geometry.height ?? 1) / 2,
                (geometry.depth ?? 1) / 2,
            );

        // Full sphere even for a wedge — see the module note on partial sweeps.
        case "sphere":
            return centeredBox3(geometry.radius ?? 1, geometry.radius ?? 1, geometry.radius ?? 1);

        // Flat in XY, facing +Z. Zero depth is correct rather than degenerate:
        // the projected box of a plane seen edge-on genuinely is a line.
        case "plane":
            return centeredBox3((geometry.width ?? 1) / 2, (geometry.height ?? 1) / 2, 0);

        // A cone is a cylinder with one radius zeroed, and three models it as its
        // own type — so the two share nothing here but the shape of the answer.
        case "cylinder": {
            const [top, bottom] = cylinderRadii(geometry.radius);
            const radius = Math.max(top, bottom);
            return centeredBox3(radius, (geometry.height ?? 1) / 2, radius);
        }
        case "cone": {
            const radius = geometry.radius ?? 1;
            return centeredBox3(radius, (geometry.height ?? 1) / 2, radius);
        }

        // The ring lies in XY and the tube swells it in Z by its own radius.
        case "torus": {
            const radius = geometry.radius ?? 1;
            const tube = geometry.thickness ?? 0.4;
            return centeredBox3(radius + tube, radius + tube, tube);
        }

        // three's knot curve is `radius * (2 + cos(qu/p)) / 2` in XY and
        // `radius * sin(qu/p) / 2` in Z, so it reaches 1.5·radius across and
        // 0.5·radius deep before the tube is added.
        case "torusKnot": {
            const radius = geometry.radius ?? 1;
            const tube = geometry.thickness ?? 0.4;
            return centeredBox3(radius * 1.5 + tube, radius * 1.5 + tube, radius * 0.5 + tube);
        }

        case "circle":
            return centeredBox3(geometry.radius ?? 1, geometry.radius ?? 1, 0);

        case "ring": {
            const outer = geometry.radius ?? 1;
            return centeredBox3(outer, outer, 0);
        }

        // `height` is the straight mid-section only, so the caps add a radius at
        // each end — the one place three's naming would mislead a reader here.
        case "capsule": {
            const radius = geometry.radius ?? 1;
            return centeredBox3(radius, (geometry.height ?? 1) / 2 + radius, radius);
        }

        // Every platonic solid is inscribed in its radius, so the sphere bounds
        // it — loosely for a tetrahedron, exactly for a subdivided icosahedron.
        case "polyhedron": {
            const radius = geometry.radius ?? 1;
            return centeredBox3(radius, radius, radius);
        }

        // A profile revolved about Y: the widest |x| becomes the radius in both
        // ground axes, and the profile's own y range carries straight over.
        case "lathe": {
            let radius = 0;
            let minY = Infinity;
            let maxY = -Infinity;
            for (const point of geometry.points) {
                const p = resolveVector3(point);
                radius = Math.max(radius, Math.abs(p.x));
                minY = Math.min(minY, p.y);
                maxY = Math.max(maxY, p.y);
            }
            if (!Number.isFinite(minY)) return null;
            return { min: { x: -radius, y: minY, z: -radius }, max: { x: radius, y: maxY, z: radius } };
        }

        // The path's own extent, swollen by the tube radius on every axis. The
        // curve bulges outside its control points, so this is a lower bound made
        // safe by the radius rather than an exact one.
        case "tube": {
            const points = geometry.points.map((point) => resolveVector3(point));
            const box = pointsBounds3(points);
            if (!box) return null;
            return expandBox3(box, geometry.radius ?? 1);
        }

        // Raw vertex data — the one case that is a walk, because there is nothing
        // else to read it off.
        case "buffer":
            return positionBounds3(geometry.position);

        // A derived geometry has its source's extent: an outline of a shape is
        // the same size as the shape.
        case "edges":
        case "wireframe":
            return geometryBounds3D(geometry.source);

        // Three that need what this package hasn't got: a rasterized 2D path, a
        // callback that may read the clock, and a file off the network.
        case "extrude":
        case "parametric":
        case "modelGeometry":
        default:
            return null;
    }
}

/** Bounds of a point list, or `null` when it is empty. */
function pointsBounds3(points: readonly Vector3[]): Box3 | null {
    if (points.length === 0) return null;
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (const p of points) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.z < minZ) minZ = p.z;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
        if (p.z > maxZ) maxZ = p.z;
    }
    return { min: { x: minX, y: minY, z: minZ }, max: { x: maxX, y: maxY, z: maxZ } };
}

/** Bounds of a flat `[x, y, z, …]` position buffer. */
function positionBounds3(position: ArrayLike<number>): Box3 | null {
    if (position.length < 3) return null;
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i + 2 < position.length; i += 3) {
        const x = position[i], y = position[i + 1], z = position[i + 2];
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (z < minZ) minZ = z;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
        if (z > maxZ) maxZ = z;
    }
    return { min: { x: minX, y: minY, z: minZ }, max: { x: maxX, y: maxY, z: maxZ } };
}

/** `box` grown by `by` on every axis. */
function expandBox3(box: Box3, by: number): Box3 {
    return {
        min: { x: box.min.x - by, y: box.min.y - by, z: box.min.z - by },
        max: { x: box.max.x + by, y: box.max.y + by, z: box.max.z + by },
    };
}
