import type { Euler3, Quaternion, Vector3Input } from "./vector3";

/**
 * Placement of a single 3D object. Every field is optional; an omitted field
 * means identity, so `{}` is a valid no-op transform.
 *
 * Rotation is in **degrees** — motion-script's 2D `rotation` is degrees, so 3D
 * matches and authors never write `Math.PI`. The renderer converts.
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
    castShadow?: boolean;
    receiveShadow?: boolean;
    /** Draw-order override, for tuning transparent sorting. */
    renderOrder?: number;
    /**
     * Explicit reconciler identity.
     *
     * By default the renderer caches one live 3D object per op, keyed by the op's
     * **structural path** — its `group()` nesting plus its index within that
     * group. That is stable for a builder that emits the same ops in the same
     * order every frame, which is the normal case.
     *
     * Set `key` when your builder emits ops *conditionally*, so a slot's meaning
     * shifts between frames (`if (t > 2) g.box(...)`). Without it, inserting an
     * op renumbers every later slot and forces the tail of the cache to rebuild.
     */
    key?: string;
}

/** Which faces of a surface are rasterized. */
export type Side3D = "front" | "back" | "double";

/** How a drawn colour combines with what is already in the framebuffer. */
export type Blending3D = "normal" | "additive" | "subtractive" | "multiply" | "none";
