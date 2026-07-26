import type { Color } from "@/attributes/shape/fill/color/parser";
import type { Passthrough3D } from "./geometry";
import type { Vector3Input } from "./vector3";

/**
 * Shadow-map settings for one light.
 *
 * Enabling shadows on a light is **structural** — it recompiles every material
 * the light touches — so set it up once rather than toggling it mid-timeline.
 * `bias` exists to fight shadow acne (self-shadowing stripes on lit surfaces);
 * a small negative value is the usual fix.
 */
export interface LightShadow3D {
    /** Square shadow-map resolution. Powers of two. Default 1024. */
    mapSize?: number;
    near?: number;
    far?: number;
    /** Depth offset to suppress self-shadowing artefacts. Try `-0.0005`. */
    bias?: number;
    /** Slope-scaled bias, for grazing angles. */
    normalBias?: number;
    /** Blur radius, for the soft (`pcfSoft`/`vsm`) shadow types. */
    radius?: number;
}

/**
 * Shadow settings for a directional light. Its shadow camera is orthographic, so
 * it needs an explicit world-space extent — too large and the shadow is blocky,
 * too small and it clips. Size it to the subject, not the whole scene.
 */
export interface DirectionalLightShadow3D extends LightShadow3D {
    /** Half-extent of the orthographic shadow frustum, in world units. */
    extent?: number;
}

/** Uniform light from every direction. Cheap fill; casts no shadows. */
export interface AmbientLight3D extends Passthrough3D {
    type: "ambient";
    color?: Color;
    intensity?: number;
}

/**
 * Two-tone ambient — one colour from above, another from below. A cheap and
 * surprisingly effective stand-in for a sky/ground environment.
 */
export interface HemisphereLight3D extends Passthrough3D {
    type: "hemisphere";
    skyColor?: Color;
    groundColor?: Color;
    intensity?: number;
}

/**
 * Parallel rays from an infinitely distant source — sunlight. Only the light's
 * *direction* matters, which is the vector from its `position` to {@link target}.
 */
export interface DirectionalLight3D extends Passthrough3D {
    type: "directional";
    color?: Color;
    intensity?: number;
    /** World-space point the light aims at. Default origin. */
    target?: Vector3Input;
    shadow?: DirectionalLightShadow3D;
}

/** Light radiating from a point in every direction — a bare bulb. */
export interface PointLight3D extends Passthrough3D {
    type: "point";
    color?: Color;
    intensity?: number;
    /** Cutoff range. 0 (default) means no cutoff. */
    distance?: number;
    /** Falloff exponent. 2 is physically correct. */
    decay?: number;
    shadow?: LightShadow3D;
}

/** A cone of light — a lamp, a torch, a stage spot. */
export interface SpotLight3D extends Passthrough3D {
    type: "spot";
    color?: Color;
    intensity?: number;
    target?: Vector3Input;
    /** Cone half-angle in **degrees**. */
    angle?: number;
    /** 0 hard edge → 1 fully feathered. */
    penumbra?: number;
    distance?: number;
    decay?: number;
    shadow?: LightShadow3D;
}

/**
 * A glowing rectangle — softboxes, strip lights, windows. Physically the nicest
 * soft light, but it only works with `standard`/`physical` materials and casts no
 * shadows.
 */
export interface RectAreaLight3D extends Passthrough3D {
    type: "rectArea";
    color?: Color;
    intensity?: number;
    width?: number;
    height?: number;
}

/** Every light a scene can contain. Discriminated on `type`. */
export type Light3D =
    | AmbientLight3D
    | HemisphereLight3D
    | DirectionalLight3D
    | PointLight3D
    | SpotLight3D
    | RectAreaLight3D;
