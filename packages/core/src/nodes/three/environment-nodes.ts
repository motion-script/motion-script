import { AssetTracker } from "@/assets/tracker";
import { property } from "@/attributes/properties/decorator";
import { colorProperty } from "@/attributes/properties/typed";
import type { Color } from "@/attributes/shape/fill/color/parser";
import type { RenderContext3D } from "@/render3d/render-context3d";
import { trackEnvironment } from "@/render3d/tracking";
import type {
    BackgroundData3D, EnvironmentData3D, FogData3D,
    PostEffectData3D, ShadowSettingsData3D, ShadowType3D,
    ToneMappingData3D, ToneMappingMode3D,
} from "@/render3d/scene-settings";
import { Node3D, type Node3DProps } from "./node3d";

/**
 * The scene-wide setting nodes: fog, background, environment, shadows, tone
 * mapping and the post chain.
 *
 * Unlike a light or a camera these have no position — there is one fog and one
 * background for the whole scene, wherever you write them — so they are **not**
 * hierarchical: the last one recorded wins. They are nodes anyway because that is
 * how everything else in a scene is written, and because being nodes makes them
 * animatable and conditional like anything else:
 *
 *   <Fog3D color="#0b0d12" near={5} far={30} />
 *   <ToneMapping3D mapping="aces" exposure={1.2} />
 *
 * Declaring two of the same kind is not an error, but only the last takes effect.
 */

// ─── fog ─────────────────────────────────────────────────────────────────────

export interface Fog3DProps extends Node3DProps {
    /** `"linear"` fades between `near` and `far`; `"exp2"` falls off exponentially. */
    kind: FogData3D["type"];
    color: Color;
    /** Linear only: distance at which fog starts. */
    near: number | undefined;
    /** Linear only: distance at which fog is total. */
    far: number | undefined;
    /** Exp2 only: falloff rate. */
    density: number | undefined;
}

/** Distance haze. Fades geometry toward `color` as it recedes from the camera. */
export class Fog3D<P extends Fog3DProps = Fog3DProps> extends Node3D<P> {
    @property({ default: "linear" }) declare kind: FogData3D["type"];
    @colorProperty({ default: "white" }) declare color: Color;
    @property({ default: undefined }) declare near: number | undefined;
    @property({ default: undefined }) declare far: number | undefined;
    @property({ default: undefined }) declare density: number | undefined;

    protected override renderSelf(ctx: RenderContext3D): void {
        const out: Record<string, unknown> = { type: this.kind, color: this.color };
        if (this.kind === "linear") {
            if (this.near !== undefined) out.near = this.near;
            if (this.far !== undefined) out.far = this.far;
        } else if (this.density !== undefined) {
            out.density = this.density;
        }
        ctx.fog(out as FogData3D);
    }
}

// ─── background ──────────────────────────────────────────────────────────────

export interface Background3DProps extends Node3DProps {
    /** A colour, or a full descriptor for a texture / equirect / cubemap. */
    background: BackgroundData3D;
}

/** What is drawn behind the scene. Without one, the 3D is transparent. */
export class Background3D<P extends Background3DProps = Background3DProps> extends Node3D<P> {
    @property({ default: undefined }) declare background: BackgroundData3D | undefined;

    protected override renderSelf(ctx: RenderContext3D): void {
        ctx.background(this.background ?? null);
    }
}

// ─── environment ─────────────────────────────────────────────────────────────

export interface Environment3DProps extends Node3DProps {
    /** `{ type: "room" }` for a generated studio, or an equirect/cubemap source. */
    environment: EnvironmentData3D;
}

/**
 * Image-based lighting — what gives `metalness` something to reflect.
 *
 * `{ type: "room" }` is generated and needs no asset; an equirect or cubemap
 * source is declared as a loadable resource so the frame waits for it.
 */
export class Environment3D<P extends Environment3DProps = Environment3DProps> extends Node3D<P> {
    @property({ default: undefined }) declare environment: EnvironmentData3D | undefined;

    override prepareRender(tracker: AssetTracker): void {
        super.prepareRender(tracker);
        const environment = this.environment;
        if (!environment) return;
        // Through the shared tracker so the loader kinds (.hdr/.exr vs a plain
        // image) stay in one place: a hand-built `Scene3D` carrying the same
        // descriptor declares it exactly the same way.
        trackEnvironment(environment, new Set<string>(), tracker);
    }

    protected override renderSelf(ctx: RenderContext3D): void {
        ctx.environment(this.environment ?? null);
    }
}

// ─── shadows ─────────────────────────────────────────────────────────────────

export interface Shadows3DProps extends Node3DProps {
    enabled: boolean;
    /** Default `"pcfSoft"` — soft edges at a modest cost. */
    type: ShadowType3D | undefined;
    /** Default shadow-map resolution for lights that don't set their own. */
    mapSize: number | undefined;
}

/**
 * Turn shadow casting on for the scene.
 *
 * Scene-wide consent only — a light still needs `castShadow`, and so does the
 * mesh that should cast and the one that should receive.
 */
export class Shadows3D<P extends Shadows3DProps = Shadows3DProps> extends Node3D<P> {
    @property({ default: true }) declare enabled: boolean;
    @property({ default: undefined }) declare type: ShadowType3D | undefined;
    @property({ default: undefined }) declare mapSize: number | undefined;

    protected override renderSelf(ctx: RenderContext3D): void {
        const out: ShadowSettingsData3D = { enabled: this.enabled };
        if (this.type !== undefined) out.type = this.type;
        if (this.mapSize !== undefined) out.mapSize = this.mapSize;
        ctx.shadows(out);
    }
}

// ─── tone mapping ────────────────────────────────────────────────────────────

export interface ToneMapping3DProps extends Node3DProps {
    mapping: ToneMappingMode3D | undefined;
    /** Stops of exposure applied before mapping. Default 1. */
    exposure: number | undefined;
}

/** How high-dynamic-range colour is compressed to what the screen can show. */
export class ToneMapping3D<P extends ToneMapping3DProps = ToneMapping3DProps> extends Node3D<P> {
    @property({ default: undefined }) declare mapping: ToneMappingMode3D | undefined;
    @property({ default: undefined }) declare exposure: number | undefined;

    protected override renderSelf(ctx: RenderContext3D): void {
        const out: ToneMappingData3D = {};
        if (this.mapping !== undefined) out.mapping = this.mapping;
        if (this.exposure !== undefined) out.exposure = this.exposure;
        ctx.tone(out);
    }
}

// ─── post chain ──────────────────────────────────────────────────────────────

export interface PostEffects3DProps extends Node3DProps {
    /** Passes applied in order after the scene renders. */
    effects: PostEffectData3D | readonly PostEffectData3D[];
}

/** Full-frame post-processing — bloom and friends, applied after the render. */
export class PostEffects3D<P extends PostEffects3DProps = PostEffects3DProps> extends Node3D<P> {
    @property({ default: undefined }) declare effects: PostEffectData3D | readonly PostEffectData3D[] | undefined;

    protected override renderSelf(ctx: RenderContext3D): void {
        const effects = this.effects;
        if (effects !== undefined) ctx.post(effects);
    }
}
