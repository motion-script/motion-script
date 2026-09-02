import { property } from "@/attributes/properties/decorator";
import { colorProperty } from "@/attributes/properties/typed";
import type { Color } from "@/attributes/shape/fill/color/parser";
import type {
    AmbientLightData3D, AreaLightData3D, DirectionalLightData3D,
    HemisphereLightData3D, LightData3D, PointLightData3D, SpotLightData3D,
} from "@/render3d/light";
import type { RenderContext3D } from "@/render3d/render-context3d";

import { Node3D, type Node3DProps } from "./node3d";
import type { NodeConfig } from "@/nodes/node/node";

/**
 * The light nodes.
 *
 * A light is a thing in the scene with a position, so it is a `Node3D` like any
 * other — it can sit inside a `Group3D` and be carried by it, be held by a ref,
 * and have its `intensity` or `color` tweened:
 *
 *   <DirectionalLight3D ref={key} intensity={2.4} position={[4, 6, 3]} shadow />
 *   key().to({ intensity: 0.2 }, 1);
 *
 * `AmbientLight3D` and `HemisphereLight3D` have no position — they light the
 * whole scene evenly — but are still nodes, so they read the same way in a tree.
 *
 * ── Intensity is one scale ────────────────────────────────────────────────────
 * A point or spot light's `intensity` means the same thing a directional light's
 * does: 1 is a normal light. three measures the first two in candela and the
 * third in lux, which is physically correct and is why scenes ended up written
 * with `intensity={2.4}` beside `intensity={40}`. The renderer converts.
 */

/** Params of a light descriptor, minus its discriminant. */
// `shadow` is dropped because `Node3DProps` already declares it, as the broader
// `Shadow3D` a mesh also takes — one prop, one type, asked of both kinds of node.
type ParamsOf<L extends { type: string }> = Omit<L, "type" | "shadow">;

/**
 * A light's own parameters, gathered off the props that were actually set.
 *
 * Omitted keys stay absent so the renderer's default applies, exactly as the
 * `Graphics3D` light sugar does.
 */
function lightFrom(type: LightData3D["type"], node: object, keys: readonly string[]): LightData3D {
    const out: Record<string, unknown> = { type };
    for (const key of keys) {
        const value = (node as Record<string, unknown>)[key];
        if (value !== undefined) out[key] = value;
    }
    return out as unknown as LightData3D;
}

/** Shared base: every light draws itself by declaring itself to the context. */
abstract class Light3DNode<P extends Node3DProps> extends Node3D<P> {
    /** The descriptor this node contributes. */
    protected abstract buildLight(): LightData3D;

    protected override renderSelf(ctx: RenderContext3D): void {
        ctx.light(this.buildLight());
    }
}

/**
 * A light that can cast a shadow map.
 *
 * `shadow` is the {@link Shadow3D} every node carries, and it defaults to `true`
 * there because that is right for a *mesh* — turning shadows on should make
 * meshes cast and receive without tagging each one. A light is the other half of
 * that trade: every light casting is N shadow maps, and a point light's is six
 * faces. So the default is flipped here, in the constructor rather than by
 * redeclaring the prop, because the property registry keeps the base class's
 * metadata for a key and a subclass decorator would be silently ignored.
 */
abstract class ShadowCastingLight3D<P extends Node3DProps> extends Light3DNode<P> {
    constructor(props?: NodeConfig<any, P>) {
        super(props);
        // Only when the author said nothing: an explicit `shadow` — including
        // `shadow={false}` — has already been written by `initProps`.
        if (props?.shadow === undefined) this.applyProp("shadow", false);
    }
}

// ─── ambient ─────────────────────────────────────────────────────────────────

export interface AmbientLight3DProps extends Node3DProps, Partial<ParamsOf<AmbientLightData3D>> { }

const AMBIENT_KEYS = ["color", "intensity"] as const;

/** Flat, directionless fill light. The cheapest way to stop shadows being black. */
export class AmbientLight3D<P extends AmbientLight3DProps = AmbientLight3DProps> extends Light3DNode<P> {
    @colorProperty({ default: undefined }) declare color: Color | undefined;
    @property({ default: undefined }) declare intensity: number | undefined;

    protected override buildLight(): LightData3D {
        return lightFrom("ambient", this, AMBIENT_KEYS);
    }
}

// ─── hemisphere ──────────────────────────────────────────────────────────────

export interface HemisphereLight3DProps extends Node3DProps, Partial<ParamsOf<HemisphereLightData3D>> { }

const HEMISPHERE_KEYS = ["sky", "ground", "intensity"] as const;

/**
 * Sky-to-ground gradient fill — ambient light with a sense of up.
 *
 * The two colours are `sky` and `ground`. They were `color` and `groundColor`,
 * and the node's `color` was silently dropped: the descriptor and the renderer
 * both read `skyColor`, which nothing ever wrote.
 */
export class HemisphereLight3D<P extends HemisphereLight3DProps = HemisphereLight3DProps> extends Light3DNode<P> {
    @colorProperty({ default: undefined }) declare sky: Color | undefined;
    @colorProperty({ default: undefined }) declare ground: Color | undefined;
    @property({ default: undefined }) declare intensity: number | undefined;

    protected override buildLight(): LightData3D {
        return lightFrom("hemisphere", this, HEMISPHERE_KEYS);
    }
}

// ─── directional ─────────────────────────────────────────────────────────────

export interface DirectionalLight3DProps extends Node3DProps, Partial<ParamsOf<DirectionalLightData3D>> { }

const DIRECTIONAL_KEYS = ["color", "intensity", "target", "shadow"] as const;

/**
 * Parallel rays from a direction — the sun. Its `position` sets the direction it
 * shines *from*, toward `target` (the origin by default).
 */
export class DirectionalLight3D<P extends DirectionalLight3DProps = DirectionalLight3DProps> extends ShadowCastingLight3D<P> {
    @colorProperty({ default: undefined }) declare color: Color | undefined;
    @property({ default: undefined }) declare intensity: number | undefined;
    @property({ default: undefined }) declare target: DirectionalLightData3D["target"];

    protected override buildLight(): LightData3D {
        return lightFrom("directional", this, DIRECTIONAL_KEYS);
    }
}

// ─── point ───────────────────────────────────────────────────────────────────

export interface PointLight3DProps extends Node3DProps, Partial<ParamsOf<PointLightData3D>> { }

const POINT_KEYS = ["color", "intensity", "distance", "decay", "shadow"] as const;

/** A bulb: light radiating from a point, falling off with distance. */
export class PointLight3D<P extends PointLight3DProps = PointLight3DProps> extends ShadowCastingLight3D<P> {
    @colorProperty({ default: undefined }) declare color: Color | undefined;
    @property({ default: undefined }) declare intensity: number | undefined;
    @property({ default: undefined }) declare distance: number | undefined;
    @property({ default: undefined }) declare decay: number | undefined;

    protected override buildLight(): LightData3D {
        return lightFrom("point", this, POINT_KEYS);
    }
}

// ─── spot ────────────────────────────────────────────────────────────────────

export interface SpotLight3DProps extends Node3DProps, Partial<ParamsOf<SpotLightData3D>> { }

const SPOT_KEYS = ["color", "intensity", "distance", "angle", "penumbra", "decay", "target", "shadow"] as const;

/** A cone of light. `angle` is the cone half-angle, in **degrees**. */
export class SpotLight3D<P extends SpotLight3DProps = SpotLight3DProps> extends ShadowCastingLight3D<P> {
    @colorProperty({ default: undefined }) declare color: Color | undefined;
    @property({ default: undefined }) declare intensity: number | undefined;
    @property({ default: undefined }) declare distance: number | undefined;
    @property({ default: undefined }) declare angle: number | undefined;
    @property({ default: undefined }) declare penumbra: number | undefined;
    @property({ default: undefined }) declare decay: number | undefined;
    @property({ default: undefined }) declare target: SpotLightData3D["target"];

    protected override buildLight(): LightData3D {
        return lightFrom("spot", this, SPOT_KEYS);
    }
}

// ─── area ────────────────────────────────────────────────────────────────────

export interface AreaLight3DProps extends Node3DProps, Partial<ParamsOf<AreaLightData3D>> { }

const AREA_KEYS = ["color", "intensity", "width", "height"] as const;

/** A glowing rectangle — a softbox. Lights `standard`/`physical` materials only. */
export class AreaLight3D<P extends AreaLight3DProps = AreaLight3DProps> extends Light3DNode<P> {
    @colorProperty({ default: undefined }) declare color: Color | undefined;
    @property({ default: undefined }) declare intensity: number | undefined;
    @property({ default: undefined }) declare width: number | undefined;
    @property({ default: undefined }) declare height: number | undefined;

    protected override buildLight(): LightData3D {
        return lightFrom("area", this, AREA_KEYS);
    }
}

