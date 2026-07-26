import { lerpNumber } from "@/tween/lerp";

/**
 * A 3D point or offset. The 3D counterpart to core's {@link Vector2}
 * (`attributes/layout/vector2.ts`), kept structurally identical so the same
 * plain-object idiom works in both dimensions.
 */
export interface Vector3 {
    x: number;
    y: number;
    z: number;
}

/**
 * Loose forms accepted anywhere a {@link Vector3} is expected:
 *
 *  - an object — `{ x: 1, y: 2, z: 3 }`
 *  - a 3-tuple — `[1, 2, 3]`
 *  - a scalar, broadcast to all three axes — `0` means the origin, `2` means
 *    `{ x: 2, y: 2, z: 2 }` (handy for uniform scale and `lookAt: 0`)
 */
export type Vector3Input = Vector3 | readonly [number, number, number] | number;

const ZERO: Vector3 = { x: 0, y: 0, z: 0 };

/** Normalize any {@link Vector3Input} to a concrete {@link Vector3}. */
export function resolveVector3(input: Vector3Input | undefined): Vector3 {
    if (input === undefined) return { ...ZERO };
    if (typeof input === "number") return { x: input, y: input, z: input };
    if (Array.isArray(input)) return { x: input[0] ?? 0, y: input[1] ?? 0, z: input[2] ?? 0 };
    const v = input as Vector3;
    return { x: v.x ?? 0, y: v.y ?? 0, z: v.z ?? 0 };
}

/**
 * Component-wise lerp between two positions. `t=0` returns `from`, `t=1`
 * returns `to`.
 *
 * Pass this to a signal so 3D vectors actually animate:
 * `createSignal<Vector3>({ x: 0, y: 0, z: 0 }, lerpVector3)`. Without a lerp a
 * non-numeric signal **snaps at `t === 1`** rather than interpolating — see
 * `createSignal`'s `tweenRunner`.
 */
export function lerpVector3(from: Vector3, to: Vector3, t: number): Vector3 {
    return {
        x: lerpNumber(from.x, to.x, t),
        y: lerpNumber(from.y, to.y, t),
        z: lerpNumber(from.z, to.z, t),
    };
}

/** The order Euler angles are applied in. Matches three's own naming. */
export type EulerOrder = "XYZ" | "YXZ" | "ZXY" | "ZYX" | "YZX" | "XZY";

/**
 * An Euler rotation in **degrees**, to match motion-script's 2D `rotation`.
 * The renderer converts to radians — authors never write `Math.PI`.
 */
export interface Euler3 extends Vector3 {
    order?: EulerOrder;
}

/**
 * Component-wise lerp of two Euler rotations, in degrees. `order` is discrete,
 * so it snaps at the halfway point rather than blending.
 *
 * Euler interpolation gimbals near the poles and takes the "wrong" path for
 * rotations past 180°. For a tumble, hold a {@link Quaternion} signal and use
 * {@link slerpQuaternion} instead.
 */
export function lerpEuler3(from: Euler3, to: Euler3, t: number): Euler3 {
    return {
        x: lerpNumber(from.x, to.x, t),
        y: lerpNumber(from.y, to.y, t),
        z: lerpNumber(from.z, to.z, t),
        order: t < 0.5 ? from.order : to.order,
    };
}

/** A rotation as a unit quaternion. */
export interface Quaternion {
    x: number;
    y: number;
    z: number;
    w: number;
}

/** The identity rotation. */
export const IDENTITY_QUATERNION: Quaternion = { x: 0, y: 0, z: 0, w: 1 };

/**
 * Shortest-arc spherical linear interpolation — the correct tween for a
 * quaternion. A component-wise lerp is *not* correct: it leaves the unit
 * hypersphere, so the rotation speed varies and the result needs renormalizing.
 *
 * Negates `to` when the pair points away from each other (`dot < 0`) so the
 * rotation always takes the short way round; falls back to a normalized linear
 * blend when the two are nearly parallel and `sin(theta)` would underflow.
 */
export function slerpQuaternion(from: Quaternion, to: Quaternion, t: number): Quaternion {
    let { x, y, z, w } = to;
    let dot = from.x * x + from.y * y + from.z * z + from.w * w;

    // Both q and -q describe the same rotation; pick the nearer representative.
    if (dot < 0) {
        x = -x; y = -y; z = -z; w = -w;
        dot = -dot;
    }

    // Nearly parallel — slerp's sin(theta) denominator underflows, and a linear
    // blend is indistinguishable at this angle anyway.
    if (dot > 0.9995) {
        return normalizeQuaternion({
            x: lerpNumber(from.x, x, t),
            y: lerpNumber(from.y, y, t),
            z: lerpNumber(from.z, z, t),
            w: lerpNumber(from.w, w, t),
        });
    }

    const theta = Math.acos(dot);
    const sinTheta = Math.sin(theta);
    const a = Math.sin((1 - t) * theta) / sinTheta;
    const b = Math.sin(t * theta) / sinTheta;

    return {
        x: from.x * a + x * b,
        y: from.y * a + y * b,
        z: from.z * a + z * b,
        w: from.w * a + w * b,
    };
}

/** Scale a quaternion back to unit length. Returns identity for a zero quat. */
export function normalizeQuaternion(q: Quaternion): Quaternion {
    const length = Math.hypot(q.x, q.y, q.z, q.w);
    if (length === 0) return { ...IDENTITY_QUATERNION };
    return { x: q.x / length, y: q.y / length, z: q.z / length, w: q.w / length };
}

/** Convert an {@link Euler3} (degrees) to a {@link Quaternion}. */
export function quaternionFromEuler(euler: Euler3): Quaternion {
    const half = Math.PI / 360; // deg → rad, then halved for the half-angle form
    const cx = Math.cos(euler.x * half), sx = Math.sin(euler.x * half);
    const cy = Math.cos(euler.y * half), sy = Math.sin(euler.y * half);
    const cz = Math.cos(euler.z * half), sz = Math.sin(euler.z * half);

    switch (euler.order ?? "XYZ") {
        case "YXZ":
            return {
                x: sx * cy * cz + cx * sy * sz,
                y: cx * sy * cz - sx * cy * sz,
                z: cx * cy * sz - sx * sy * cz,
                w: cx * cy * cz + sx * sy * sz,
            };
        case "ZXY":
            return {
                x: sx * cy * cz - cx * sy * sz,
                y: cx * sy * cz + sx * cy * sz,
                z: cx * cy * sz + sx * sy * cz,
                w: cx * cy * cz - sx * sy * sz,
            };
        case "ZYX":
            return {
                x: sx * cy * cz - cx * sy * sz,
                y: cx * sy * cz + sx * cy * sz,
                z: cx * cy * sz - sx * sy * cz,
                w: cx * cy * cz + sx * sy * sz,
            };
        case "YZX":
            return {
                x: sx * cy * cz + cx * sy * sz,
                y: cx * sy * cz + sx * cy * sz,
                z: cx * cy * sz - sx * sy * cz,
                w: cx * cy * cz - sx * sy * sz,
            };
        case "XZY":
            return {
                x: sx * cy * cz - cx * sy * sz,
                y: cx * sy * cz - sx * cy * sz,
                z: cx * cy * sz + sx * sy * cz,
                w: cx * cy * cz + sx * sy * sz,
            };
        case "XYZ":
        default:
            return {
                x: sx * cy * cz + cx * sy * sz,
                y: cx * sy * cz - sx * cy * sz,
                z: cx * cy * sz + sx * sy * cz,
                w: cx * cy * cz - sx * sy * sz,
            };
    }
}
