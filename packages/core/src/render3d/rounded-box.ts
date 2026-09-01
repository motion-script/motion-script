import type { BufferGeometry3D } from "./geometry";

/**
 * A box with rounded edges and corners, evaluated into vertex buffers.
 *
 * `Rect` has had `cornerRadius` since the beginning and it is most of what makes
 * 2D content read as designed rather than as debug output; the same is true in
 * 3D, and it is the one thing a Spline scene has that a bare three scene does
 * not. three has no rounded box in core — its `RoundedBoxGeometry` is an addon,
 * and importing addons would defeat the lazy `import("three")` boundary — so the
 * surface is built here: in core, as plain data, backend-agnostic and testable
 * without a GPU, exactly like `evaluateParametric`.
 *
 * The surface is the Minkowski sum of an inner box (each half-extent reduced by
 * `radius`) and a sphere of that radius, which decomposes into 26 patches: 6 flat
 * faces, 12 quarter-cylinder edges and 8 spherical-octant corners. Each patch is
 * a grid of `core + radius * direction`, where `direction` is also the vertex
 * normal — so lighting is exact rather than interpolated off a deformed box.
 */
export interface RoundedBoxOptions {
    width: number;
    height: number;
    depth: number;
    radius: number;
    /** Face subdivision per axis, as `[x, y, z]`. */
    segments: readonly [number, number, number];
}

type Vec3 = readonly [number, number, number];

/** A patch grid, before it is tessellated into the output buffers. */
interface Grid {
    /** Position at grid coordinate `(u, v)`, both in `[0, 1]`. */
    position: (u: number, v: number) => Vec3;
    /** Unit normal at `(u, v)`. */
    normal: (u: number, v: number) => Vec3;
    uSteps: number;
    vSteps: number;
}

/**
 * Arc resolution for the rounded regions, derived from how round the box
 * actually is rather than exposed as a knob.
 *
 * `segments` means face subdivision on every other shape and has to keep meaning
 * that here; a second count just for the arcs would be a field whose right value
 * is always "enough that it looks smooth". That is a function of the radius
 * relative to the box, so it is computed — a barely-rounded edge gets the
 * minimum, a nearly-spherical one gets a full sweep.
 */
function arcSegmentsFor(radius: number, maxHalf: number): number {
    if (maxHalf <= 0) return 3;
    return Math.max(3, Math.min(16, Math.round((radius / maxHalf) * 40)));
}

/**
 * Build the rounded box's vertex buffers.
 *
 * Returns a plain {@link BufferGeometry3D}, so the renderer's existing buffer
 * path uploads it with no new code, and `Geo.edges`/`Geo.wireframe` derive from
 * it like any other geometry.
 */
export function evaluateRoundedBox(options: RoundedBoxOptions): BufferGeometry3D {
    const half: Vec3 = [options.width / 2, options.height / 2, options.depth / 2];
    const maxHalf = Math.max(half[0], half[1], half[2]);
    const radius = Math.max(0, Math.min(options.radius, half[0], half[1], half[2]));

    // The inner box the sphere is swept around. Clamped at zero so a radius equal
    // to a half-extent (a fully rounded axis) degenerates to a line rather than
    // folding the surface inside out.
    const box: Vec3 = [
        Math.max(0, half[0] - radius),
        Math.max(0, half[1] - radius),
        Math.max(0, half[2] - radius),
    ];

    const arc = arcSegmentsFor(radius, maxHalf);

    const position: number[] = [];
    const normal: number[] = [];
    const uv: number[] = [];
    const index: number[] = [];

    for (const grid of patches(half, box, radius, options.segments, arc)) {
        emit(grid, half, position, normal, uv, index);
    }

    return {
        type: "buffer",
        position: new Float32Array(position),
        normal: new Float32Array(normal),
        uv: new Float32Array(uv),
        index: new Uint32Array(index),
        staticData: true,
    };
}

/** The 26 patches, in face then edge then corner order. */
function* patches(
    half: Vec3,
    box: Vec3,
    radius: number,
    segments: readonly [number, number, number],
    arc: number,
): Generator<Grid> {
    const AXES = [0, 1, 2] as const;
    const SIGNS = [-1, 1] as const;

    // 6 faces: flat, spanning the inner box on the two free axes and pinned at
    // the full half-extent on its own. Subdivided by `segments`, which is what a
    // displacement map reads.
    for (const axis of AXES) {
        const u = (axis + 1) % 3;
        const v = (axis + 2) % 3;
        for (const sign of SIGNS) {
            const face = axisVector(axis, sign);
            yield {
                uSteps: segments[u],
                vSteps: segments[v],
                normal: () => face,
                position: (a, b) => {
                    const point: number[] = [0, 0, 0];
                    point[axis] = sign * half[axis];
                    point[u] = lerp(-box[u], box[u], a);
                    point[v] = lerp(-box[v], box[v], b);
                    return point as unknown as Vec3;
                },
            };
        }
    }

    if (radius <= 0) return;

    // 12 edges: a quarter cylinder. The direction sweeps 90 degrees in the plane
    // of the two pinned axes while the core slides along the third.
    for (const axis of AXES) {
        const a = (axis + 1) % 3;
        const b = (axis + 2) % 3;
        for (const signA of SIGNS) {
            for (const signB of SIGNS) {
                yield {
                    uSteps: arc,
                    vSteps: segments[axis],
                    normal: (t) => {
                        const angle = (t * Math.PI) / 2;
                        const dir: number[] = [0, 0, 0];
                        dir[a] = signA * Math.cos(angle);
                        dir[b] = signB * Math.sin(angle);
                        return dir as unknown as Vec3;
                    },
                    position: (t, s) => {
                        const angle = (t * Math.PI) / 2;
                        const point: number[] = [0, 0, 0];
                        point[a] = signA * (box[a] + radius * Math.cos(angle));
                        point[b] = signB * (box[b] + radius * Math.sin(angle));
                        point[axis] = lerp(-box[axis], box[axis], s);
                        return point as unknown as Vec3;
                    },
                };
            }
        }
    }

    // 8 corners: a spherical octant around a fixed corner of the inner box.
    for (const signX of SIGNS) {
        for (const signY of SIGNS) {
            for (const signZ of SIGNS) {
                const corner: Vec3 = [signX * box[0], signY * box[1], signZ * box[2]];
                const direction = (u: number, v: number): Vec3 => {
                    const polar = (u * Math.PI) / 2;
                    const azimuth = (v * Math.PI) / 2;
                    return [
                        signX * Math.sin(polar) * Math.cos(azimuth),
                        signY * Math.cos(polar),
                        signZ * Math.sin(polar) * Math.sin(azimuth),
                    ];
                };
                yield {
                    uSteps: arc,
                    vSteps: arc,
                    normal: direction,
                    position: (u, v) => {
                        const dir = direction(u, v);
                        return [
                            corner[0] + radius * dir[0],
                            corner[1] + radius * dir[1],
                            corner[2] + radius * dir[2],
                        ];
                    },
                };
            }
        }
    }
}

/**
 * Tessellate one patch into the output buffers.
 *
 * Winding is decided per triangle by comparing its own normal against the
 * surface normal at that vertex, rather than by reasoning about the sign
 * combination that produced the patch: 26 patches is 26 chances to get a
 * handedness backwards, and one inverted face on a `faces: "front"` mesh is a
 * hole you can see through. Degenerate triangles — the pole of a corner octant,
 * and every quad of a patch whose extent collapsed to zero — are dropped rather
 * than emitted with an undefined normal.
 */
function emit(
    grid: Grid,
    half: Vec3,
    position: number[],
    normal: number[],
    uv: number[],
    index: number[],
): void {
    const base = position.length / 3;
    const uCount = grid.uSteps + 1;
    const vCount = grid.vSteps + 1;

    for (let vi = 0; vi < vCount; vi++) {
        for (let ui = 0; ui < uCount; ui++) {
            const u = grid.uSteps === 0 ? 0 : ui / grid.uSteps;
            const v = grid.vSteps === 0 ? 0 : vi / grid.vSteps;
            const point = grid.position(u, v);
            const dir = grid.normal(u, v);
            position.push(point[0], point[1], point[2]);
            normal.push(dir[0], dir[1], dir[2]);
            const [s, t] = planarUv(point, dir, half);
            uv.push(s, t);
        }
    }

    for (let vi = 0; vi < grid.vSteps; vi++) {
        for (let ui = 0; ui < grid.uSteps; ui++) {
            const a = base + vi * uCount + ui;
            const b = a + 1;
            const c = a + uCount;
            const d = c + 1;
            pushTriangle(position, normal, index, a, c, b);
            pushTriangle(position, normal, index, b, c, d);
        }
    }
}

/** Emit one triangle, flipped if its winding faces away from the surface normal. */
function pushTriangle(
    position: number[],
    normal: number[],
    index: number[],
    a: number,
    b: number,
    c: number,
): void {
    const ax = position[a * 3], ay = position[a * 3 + 1], az = position[a * 3 + 2];
    const bx = position[b * 3], by = position[b * 3 + 1], bz = position[b * 3 + 2];
    const cx = position[c * 3], cy = position[c * 3 + 1], cz = position[c * 3 + 2];

    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;

    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;

    // A collapsed quad — a pole, or a patch with no extent. No orientation to
    // decide and no area to shade.
    if (nx * nx + ny * ny + nz * nz < 1e-20) return;

    const facing = nx * normal[a * 3] + ny * normal[a * 3 + 1] + nz * normal[a * 3 + 2];

    if (facing >= 0) index.push(a, b, c);
    else index.push(a, c, b);
}

/**
 * A planar UV, projected along whichever axis the normal points most strongly
 * down.
 *
 * Deliberately approximate, and documented as such: the faces get an exact
 * box-projected UV, which is what a texture on a rounded box is almost always
 * for, and the arcs get a continuous projection that meets those faces without a
 * seam. An exact arc-length unwrap would need a per-patch atlas, which is a
 * texturing feature rather than a shape one.
 */
function planarUv(point: Vec3, dir: Vec3, half: Vec3): [number, number] {
    const ax = Math.abs(dir[0]);
    const ay = Math.abs(dir[1]);
    const az = Math.abs(dir[2]);

    const axis = ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2;
    const u = (axis + 1) % 3;
    const v = (axis + 2) % 3;

    return [
        half[u] === 0 ? 0.5 : 0.5 + point[u] / (2 * half[u]),
        half[v] === 0 ? 0.5 : 0.5 + point[v] / (2 * half[v]),
    ];
}

function axisVector(axis: number, sign: number): Vec3 {
    const out: number[] = [0, 0, 0];
    out[axis] = sign;
    return out as unknown as Vec3;
}

function lerp(from: number, to: number, t: number): number {
    return from + (to - from) * t;
}
