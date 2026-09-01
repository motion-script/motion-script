import { AssetTracker } from "@/assets/tracker";
import { property } from "@/attributes/properties/decorator";
import { colorProperty } from "@/attributes/properties/typed";
import type { Color } from "@/attributes/shape/fill/color/parser";
import type { RenderContext3D } from "@/render3d/render-context3d";
import { trackEnvironment } from "@/render3d/tracking";
import type { EnvironmentData3D, FogData3D } from "@/render3d/scene-settings";
import { Node3D, type Node3DProps } from "./node3d";

/**
 * The two scene-wide nodes that are left: fog and environment.
 *
 * `Shadows3D`, `ToneMapping3D` and `PostEffects3D` used to be here and are now
 * props on `Canvas3D`. They were never scene *objects* — a viewport's shadow
 * quality, its tone curve and its post chain are settings of the thing doing the
 * rendering, and writing them as nodes meant a node with no position whose
 * duplicates silently did nothing. `Background3D` is gone entirely: what is drawn
 * behind a 3D scene is the viewport's own 2D `fill`.
 *
 * These two stay nodes because they *are* about the space: fog is a property of
 * the air in it, and an environment is the sky around it. Both are still
 * positionless, so declaring two of the same kind is not an error but only the
 * last takes effect.
 *
 *   <Fog3D near={5} far={30} />
 *   <Environment3D preset="studio" />
 */

// ─── fog ─────────────────────────────────────────────────────────────────────

export interface Fog3DProps extends Node3DProps {
    /** Defaults to the viewport's own fill — see below. */
    color: Color | undefined;
    /** Distance at which fog starts. Linear fog. */
    near: number | undefined;
    /** Distance at which fog is total. Linear fog. */
    far: number | undefined;
    /** Exponential-squared falloff. Wins over {@link near}/{@link far}. */
    density: number | undefined;
}

/**
 * Distance haze. Fades geometry toward `color` as it recedes from the camera.
 *
 * There is no `kind`: setting `density` is exponential fog and setting
 * `near`/`far` is linear. The discriminant said the same thing twice and let you
 * write `kind="exponential"` beside a `far` that was then silently dropped.
 *
 * `color` defaults to the viewport's resolved fill. Fog that does not match what
 * is behind it reads as a grey wall rather than as distance, and typing the same
 * colour into two places is exactly how the two drift.
 */
export class Fog3D<P extends Fog3DProps = Fog3DProps> extends Node3D<P> {
    @colorProperty({ default: undefined }) declare color: Color | undefined;
    @property({ default: undefined }) declare near: number | undefined;
    @property({ default: undefined }) declare far: number | undefined;
    @property({ default: undefined }) declare density: number | undefined;

    protected override renderSelf(ctx: RenderContext3D): void {
        const out: FogData3D = {};
        if (this.color !== undefined) out.color = this.color;
        if (this.density !== undefined) {
            out.density = this.density;
        } else {
            if (this.near !== undefined) out.near = this.near;
            if (this.far !== undefined) out.far = this.far;
        }
        ctx.fog(out);
    }
}

// ─── environment ─────────────────────────────────────────────────────────────

export interface Environment3DProps extends Node3DProps {
    /** A 360° panorama — `.hdr`/`.exr` for real IBL, or a plain image. */
    src: string | undefined;
    /** Six cubemap faces, in three's order: +X, −X, +Y, −Y, +Z, −Z. */
    faces: readonly string[] | undefined;
    /** A generated studio interior. Needs no asset. */
    preset: "studio" | undefined;
    intensity: number | undefined;
    /** Also draw it behind the scene, as an infinitely distant sky. */
    background: boolean | undefined;
    /** Blur the background only, 0–1. The lighting stays sharp. */
    blur: number | undefined;
}

/**
 * Image-based lighting — what gives `metalness` something to reflect — and the
 * sky it comes from.
 *
 * One node rather than two, because it is one physical thing: the HDRI that
 * lights a scene is the same panorama you see behind it. As `Background3D` and
 * `Environment3D` they were two nodes, each easy to set alone, and the symptom of
 * setting the wrong one was either black metal or a missing sky.
 *
 *   <Environment3D preset="studio" />            — generated, needs no asset
 *   <Environment3D src="/studio.hdr" background blur={0.4} />
 *
 * The node's own `rotationX/Y/Z` orient the **panorama**, which is the one thing
 * about an environment that is a rotation; it has no position, so nothing else
 * of its transform is read.
 */
export class Environment3D<P extends Environment3DProps = Environment3DProps> extends Node3D<P> {
    @property({ default: undefined }) declare src: string | undefined;
    @property({ default: undefined }) declare faces: readonly string[] | undefined;
    @property({ default: undefined }) declare preset: "studio" | undefined;
    @property({ default: undefined }) declare intensity: number | undefined;
    @property({ default: undefined }) declare background: boolean | undefined;
    @property({ default: undefined }) declare blur: number | undefined;

    /**
     * The descriptor this node contributes, or `null` when it names no source.
     *
     * `null` rather than an empty object: an `<Environment3D>` with nothing set is
     * a node that has not been filled in yet, and clearing the scene's
     * environment is a truer reading of that than lighting it with nothing.
     */
    protected buildEnvironment(): EnvironmentData3D | null {
        const out: EnvironmentData3D = {};
        let named = false;

        if (this.src !== undefined) { out.src = this.src; named = true; }
        if (this.faces !== undefined) { out.faces = this.faces; named = true; }
        if (this.preset !== undefined) { out.preset = this.preset; named = true; }
        if (!named) return null;

        if (this.intensity !== undefined) out.intensity = this.intensity;
        if (this.background !== undefined) out.background = this.background;
        if (this.blur !== undefined) out.blur = this.blur;
        // The panorama's own orientation, read off the node's rotation props —
        // which is the one thing about an environment that is a rotation.
        if (this.rotationX || this.rotationY || this.rotationZ) {
            out.rotation = [this.rotationX, this.rotationY, this.rotationZ];
        }
        return out;
    }

    override prepareRender(tracker: AssetTracker): void {
        super.prepareRender(tracker);
        const environment = this.buildEnvironment();
        if (!environment) return;
        // Through the shared tracker so the loader kinds (.hdr/.exr vs a plain
        // image) stay in one place: a hand-built `Scene3D` carrying the same
        // descriptor declares it exactly the same way.
        trackEnvironment(environment, new Set<string>(), tracker);
    }

    protected override renderSelf(ctx: RenderContext3D): void {
        ctx.environment(this.buildEnvironment());
    }
}
