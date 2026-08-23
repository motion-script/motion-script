import { property } from "@/attributes/properties/decorator";
import { colorProperty } from "@/attributes/properties/typed";
import type { Color } from "@/attributes/shape/fill/color/parser";
import type {
    AmbientLightData3D, DirectionalLightData3D, DirectionalLightShadowData3D,
    HemisphereLightData3D, LightData3D, LightShadowData3D, PointLightData3D,
    RectAreaLightData3D, SpotLightData3D,
} from "@/render3d/light";
import type { RenderContext3D } from "@/render3d/render-context3d";
import { Node3D, type Node3DProps } from "./node3d";

/**
 * The light nodes.
 *
 * A light is a thing in the scene with a position, so it is a `Node3D` like any
 * other — it can sit inside a `Group3D` and be carried by it, be held by a ref,
 * and have its `intensity` or `color` tweened:
 *
 *   <DirectionalLight3D ref={key} intensity={2.4} position={[4, 6, 3]} castShadow />
 *   yield* key().to({ intensity: 0.2 }, 1);
 *
 * `AmbientLight3D` and `HemisphereLight3D` have no position — they light the
 * whole scene evenly — but are still nodes, so they read the same way in a tree.
 */

/** Params of a light descriptor, minus its discriminant. */
type ParamsOf<L extends { type: string }> = Omit<L, "type">;

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

const HEMISPHERE_KEYS = ["color", "groundColor", "intensity"] as const;

/** Sky-to-ground gradient fill — ambient light with a sense of up. */
export class HemisphereLight3D<P extends HemisphereLight3DProps = HemisphereLight3DProps> extends Light3DNode<P> {
    @colorProperty({ default: undefined }) declare color: Color | undefined;
    @colorProperty({ default: undefined }) declare groundColor: Color | undefined;
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
export class DirectionalLight3D<P extends DirectionalLight3DProps = DirectionalLight3DProps> extends Light3DNode<P> {
    @colorProperty({ default: undefined }) declare color: Color | undefined;
    @property({ default: undefined }) declare intensity: number | undefined;
    @property({ default: undefined }) declare target: DirectionalLightData3D["target"];
    @property({ default: undefined }) declare shadow: DirectionalLightShadowData3D | undefined;

    protected override buildLight(): LightData3D {
        return lightFrom("directional", this, DIRECTIONAL_KEYS);
    }
}

// ─── point ───────────────────────────────────────────────────────────────────

export interface PointLight3DProps extends Node3DProps, Partial<ParamsOf<PointLightData3D>> { }

const POINT_KEYS = ["color", "intensity", "distance", "decay", "shadow"] as const;

/** A bulb: light radiating from a point, falling off with distance. */
export class PointLight3D<P extends PointLight3DProps = PointLight3DProps> extends Light3DNode<P> {
    @colorProperty({ default: undefined }) declare color: Color | undefined;
    @property({ default: undefined }) declare intensity: number | undefined;
    @property({ default: undefined }) declare distance: number | undefined;
    @property({ default: undefined }) declare decay: number | undefined;
    @property({ default: undefined }) declare shadow: LightShadowData3D | undefined;

    protected override buildLight(): LightData3D {
        return lightFrom("point", this, POINT_KEYS);
    }
}

// ─── spot ────────────────────────────────────────────────────────────────────

export interface SpotLight3DProps extends Node3DProps, Partial<ParamsOf<SpotLightData3D>> { }

const SPOT_KEYS = ["color", "intensity", "distance", "angle", "penumbra", "decay", "target", "shadow"] as const;

/** A cone of light. `angle` is the cone half-angle, in **degrees**. */
export class SpotLight3D<P extends SpotLight3DProps = SpotLight3DProps> extends Light3DNode<P> {
    @colorProperty({ default: undefined }) declare color: Color | undefined;
    @property({ default: undefined }) declare intensity: number | undefined;
    @property({ default: undefined }) declare distance: number | undefined;
    @property({ default: undefined }) declare angle: number | undefined;
    @property({ default: undefined }) declare penumbra: number | undefined;
    @property({ default: undefined }) declare decay: number | undefined;
    @property({ default: undefined }) declare target: SpotLightData3D["target"];
    @property({ default: undefined }) declare shadow: LightShadowData3D | undefined;

    protected override buildLight(): LightData3D {
        return lightFrom("spot", this, SPOT_KEYS);
    }
}

// ─── rect area ───────────────────────────────────────────────────────────────

export interface RectAreaLight3DProps extends Node3DProps, Partial<ParamsOf<RectAreaLightData3D>> { }

const RECT_AREA_KEYS = ["color", "intensity", "width", "height"] as const;

/** A glowing rectangle — a softbox. Lights `standard`/`physical` materials only. */
export class RectAreaLight3D<P extends RectAreaLight3DProps = RectAreaLight3DProps> extends Light3DNode<P> {
    @colorProperty({ default: undefined }) declare color: Color | undefined;
    @property({ default: undefined }) declare intensity: number | undefined;
    @property({ default: undefined }) declare width: number | undefined;
    @property({ default: undefined }) declare height: number | undefined;

    protected override buildLight(): LightData3D {
        return lightFrom("rectArea", this, RECT_AREA_KEYS);
    }
}
