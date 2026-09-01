import type { Color } from "@/attributes/shape/fill/color/parser";
import type { Passthrough3D } from "./geometry";
import type { Shadow3D } from "./transform";
import type { Vector3Input } from "./vector3";

/**
 * Every light shares its colour, its strength, and what it does about shadows.
 *
 * `shadow` is the same {@link Shadow3D} an object carries — see that type for why
 * one name covers both, and for the two knobs its object form exposes in place of
 * three's seven.
 */
interface LightCommon3D extends Passthrough3D {
    color?: Color;
    intensity?: number;
}

/** Uniform light from every direction. Cheap fill; casts no shadows. */
export interface AmbientLightData3D extends LightCommon3D {
    type: "ambient";
}

/**
 * Two-tone ambient — one colour from above, another from below. A cheap and
 * surprisingly effective stand-in for a sky/ground environment.
 */
export interface HemisphereLightData3D extends Passthrough3D {
    type: "hemisphere";
    /** Colour from above. */
    sky?: Color;
    /** Colour from below. */
    ground?: Color;
    intensity?: number;
}

/**
 * Parallel rays from an infinitely distant source — sunlight. Only the light's
 * *direction* matters, which is the vector from its `position` to {@link target}.
 */
export interface DirectionalLightData3D extends LightCommon3D {
    type: "directional";
    /** World-space point the light aims at. Default origin. */
    target?: Vector3Input;
    shadow?: Shadow3D;
}

/**
 * Light radiating from a point in every direction — a bare bulb.
 *
 * `intensity` is on the same scale as a directional light's: 1 is a normal light,
 * not one candela. three measures point and spot lights in candela and
 * directional lights in lux, which is physically correct and means the same
 * number produces wildly different results on the two — a scene ends up written
 * with `intensity={2.4}` on one light beside `intensity={40}` on another. The
 * renderer applies the steradian conversion so the numbers are comparable.
 */
export interface PointLightData3D extends LightCommon3D {
    type: "point";
    /** Cutoff range. 0 (default) means no cutoff. */
    distance?: number;
    /** Falloff exponent. 2 is physically correct. */
    decay?: number;
    shadow?: Shadow3D;
}

/** A cone of light — a lamp, a torch, a stage spot. */
export interface SpotLightData3D extends LightCommon3D {
    type: "spot";
    target?: Vector3Input;
    /** Cone half-angle in **degrees**. */
    angle?: number;
    /** 0 hard edge → 1 fully feathered. */
    penumbra?: number;
    distance?: number;
    decay?: number;
    shadow?: Shadow3D;
}

/**
 * A glowing rectangle — softboxes, strip lights, windows. Physically the nicest
 * soft light, but it only works with `standard`/`physical` materials and casts no
 * shadows.
 *
 * Named for what it is rather than for the three class behind it: "rectArea" put
 * a renderer's internal name in the authoring surface, and `Rect` already means
 * something else here.
 */
export interface AreaLightData3D extends LightCommon3D {
    type: "area";
    width?: number;
    height?: number;
}

/** Every light a scene can contain. Discriminated on `type`. */
export type LightData3D =
    | AmbientLightData3D
    | HemisphereLightData3D
    | DirectionalLightData3D
    | PointLightData3D
    | SpotLightData3D
    | AreaLightData3D;
