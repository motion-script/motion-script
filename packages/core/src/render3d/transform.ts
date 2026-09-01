import type { Euler3, Quaternion, Vector3Input } from "./vector3";

/**
 * Tuning for the shadow a *light* casts.
 *
 * Two knobs where three has seven: `mapSize`, `near`, `far`, `bias` and
 * `normalBias` are all derived by the renderer. `bias` in particular existed only
 * to fight shadow acne, its right value is a function of the scene's scale, and
 * `-0.0005` is not a number any author should be asked to discover.
 * {@link params} is applied straight onto the light's own `shadow` object for the
 * rare scene that needs to override one.
 */
export interface ShadowOptions3D {
    /** 0 hard-edged → 1 very soft. Default 0.5. */
    softness?: number;
    /**
     * Half-extent of a directional light's orthographic shadow frustum, in world
     * units. Sized to the scene's own bounds when omitted — too large and the
     * shadow is blocky, too small and it clips.
     */
    extent?: number;
    /** Escape hatch, assigned onto the renderer's shadow object. */
    params?: Record<string, unknown>;
}

/**
 * A node's relationship to shadows.
 *
 * One control rather than the two booleans three has, because for an *object*
 * "casts" and "receives" are almost never wanted apart, and defaulting both to
 * `false` (as three does) means a scene with shadows enabled and a light casting
 * them still renders nothing until every mesh is tagged. Here the default is
 * `true` and the viewport's own `shadows` switch is what decides — so turning
 * shadows on turns shadows on.
 *
 * For a *light* the same prop says whether it casts a shadow map, and the object
 * form carries that map's tuning. One name, because it is one question — "what
 * does this node do about shadows" — asked of two kinds of node.
 *
 * Note that every light casting by default is a real cost once shadows are on: a
 * point light needs a six-face cube map. Turn the fill lights off with
 * `shadow={false}` and leave the key light casting, which is what a lighting
 * setup does anyway.
 */
export type Shadow3D = boolean | "cast" | "receive" | ShadowOptions3D;

/** True when this mode casts. */
export function shadowCasts(mode: Shadow3D | undefined): boolean {
    if (mode === undefined || mode === true) return true;
    if (mode === false) return false;
    return mode === "cast" || typeof mode === "object";
}

/** True when this mode receives. */
export function shadowReceives(mode: Shadow3D | undefined): boolean {
    if (mode === undefined || mode === true) return true;
    if (mode === false) return false;
    return mode === "receive" || typeof mode === "object";
}

/** A light's shadow tuning, or `null` when it casts none. */
export function resolveShadowOptions3D(mode: Shadow3D | undefined): ShadowOptions3D | null {
    if (!shadowCasts(mode)) return null;
    return typeof mode === "object" ? mode : {};
}

/**
 * Placement of a single 3D object. Every field is optional; an omitted field
 * means identity, so `{}` is a valid no-op transform.
 *
 * Rotation is in **degrees** — motion-script's 2D `rotation` is degrees, so 3D
 * matches and authors never write `Math.PI`. The renderer converts.
 *
 * There is no `key` here. Reconciler identity is derived: a node stamps its own
 * id on the scope it opens, and a drawable is keyed by that id plus a content
 * signature, so a builder that emits ops conditionally reuses the right cache
 * entry without anything being written by hand. See the reconciler.
 */
export interface Transform3D {
    /** Position in the parent's local space. Default origin. */
    position?: Vector3Input;
    /**
     * Euler rotation in **degrees**, applied in `order` (default `"XYZ"`).
     * Ignored when {@link quaternion} is set.
     */
    rotation?: Vector3Input | Euler3;
    /**
     * Rotation as a unit quaternion. Wins over {@link rotation} — use it (with
     * `slerpQuaternion`) for tumbles where Euler interpolation would gimbal.
     */
    quaternion?: Quaternion;
    /** Per-axis scale; a scalar scales uniformly. Default 1. */
    scale?: Vector3Input;
    /**
     * World-space point to orient toward, applied after {@link position}.
     * Wins over both {@link rotation} and {@link quaternion}.
     */
    lookAt?: Vector3Input;
    /** Hide without removing (keeps the cached object alive). Default true. */
    visible?: boolean;
    /** Shadow participation. Default `true` — see {@link Shadow3D}. */
    shadow?: Shadow3D;
    /** Draw-order override, for tuning transparent sorting. */
    renderOrder?: number;
    /**
     * Node identity, stamped by the scene recorder rather than by an author.
     *
     * `Scene3D.begin` writes the recording node's id here so the renderer caches
     * a group against the node that opened it. Nothing an author writes goes in
     * this field.
     *
     * @internal
     */
    key?: string;
}

/** Which faces of a surface are rasterized. */
export type Faces3D = "front" | "back" | "both";

/** How a drawn colour combines with what is already in the framebuffer. */
export type Blend3D = "normal" | "additive" | "subtractive" | "multiply" | "none";
