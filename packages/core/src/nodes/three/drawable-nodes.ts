import { property } from "@/attributes/properties/decorator";
import type { Color } from "@/attributes/shape/fill/color/parser";
import { Graphics3D, type LineMode3D, type ModelAnimation3D } from "@/render3d/graphics3d";
import type { Geometry3D } from "@/render3d/geometry";
import type { Material3D } from "@/render3d/material";
import type { RenderContext3D } from "@/render3d/render-context3d";
import type { Texture3D } from "@/render3d/texture";
import type { Transform3D } from "@/render3d/transform";
import type { Vector3Input } from "@/render3d/vector3";
import { Mesh3D, type Mesh3DProps } from "./mesh3d";
import { Node3D, type Node3DProps } from "./node3d";

/**
 * The drawables that aren't a single mesh: instanced copies, point clouds,
 * polylines, sprites and loaded models.
 *
 * Each is the node form of the matching `Graphics3D` method, so what it draws and
 * what a builder chain draws are the same descriptor.
 */

// ─── instances ───────────────────────────────────────────────────────────────

export interface Instances3DProps extends Mesh3DProps {
    /** Per-instance placement. Its length drives the instance count. */
    instances: readonly Transform3D[];
    /** Per-instance tint. Needs a material that reads instance colour. */
    colors: readonly Color[] | undefined;
}

/**
 * Many copies of one geometry in a single draw call — the way to put thousands of
 * objects on screen, where a mesh per copy would not keep up.
 *
 * The instance count is fixed when the object is built, so changing the *length*
 * of `instances` rebuilds it; moving the entries within it does not.
 */
export class Instances3D<P extends Instances3DProps = Instances3DProps> extends Mesh3D<P> {
    @property({ default: undefined }) declare instances: readonly Transform3D[];
    @property({ default: undefined }) declare colors: readonly Color[] | undefined;

    protected override buildGraphics3D(): Graphics3D {
        const g3 = new Graphics3D();
        const geometry = this.buildGeometry();
        const instances = this.instances;
        if (!geometry || !instances?.length) return g3;
        g3.instances(geometry, this.resolvedMaterial(), instances, { colors: this.colors });
        return g3;
    }

    /** The single material an instanced draw takes (never an array). */
    protected resolvedMaterial(): Material3D {
        const material = this.material;
        if (material !== undefined) {
            return (Array.isArray(material) ? material[0] : material) as Material3D;
        }
        const { material: _m, unlit, ...rest } = this.materialShorthand();
        return { type: unlit ? "basic" : "standard", ...rest } as Material3D;
    }
}

// ─── points ──────────────────────────────────────────────────────────────────

export type Points3DProps = Mesh3DProps;

/** A point cloud — one dot per vertex of the geometry. */
export class Points3D<P extends Points3DProps = Points3DProps> extends Mesh3D<P> {
    protected override buildGraphics3D(): Graphics3D {
        const g3 = new Graphics3D();
        const geometry = this.buildGeometry();
        if (geometry) g3.points(geometry, this.material as Material3D | undefined);
        return g3;
    }
}

// ─── line ────────────────────────────────────────────────────────────────────

export interface Line3DProps extends Node3DProps {
    /** The polyline's vertices. Give this or {@link geometry}, not both. */
    points: readonly Vector3Input[];
    /**
     * An explicit geometry to draw the lines of — `Geo.edges(...)` for a wireframe
     * outline, say. Wins over {@link points}.
     */
    geometry: Geometry3D;
    /** `"strip"` connects them in order, `"segments"` pairs them, `"loop"` closes. */
    mode: LineMode3D;
    color: Color | undefined;
    width: number | undefined;
    opacity: number | undefined;
    dashed: boolean | undefined;
    material: Material3D | undefined;
}

/**
 * A polyline in space.
 *
 * Line width above 1 is not portable — most WebGL implementations ignore it — so
 * a thick line is better drawn as a {@link Tube3D}.
 */
export class Line3D<P extends Line3DProps = Line3DProps> extends Node3D<P> {
    @property({ default: undefined }) declare points: readonly Vector3Input[];
    @property({ default: undefined }) declare geometry: Geometry3D | undefined;
    @property({ default: "strip" }) declare mode: LineMode3D;
    @property({ default: undefined }) declare color: Color | undefined;
    @property({ default: undefined }) declare width: number | undefined;
    @property({ default: undefined }) declare opacity: number | undefined;
    @property({ default: undefined }) declare dashed: boolean | undefined;
    @property({ default: undefined }) declare material: Material3D | undefined;

    protected buildGraphics3D(): Graphics3D {
        const g3 = new Graphics3D();
        const geometry = this.geometry;
        const points = this.points;
        if (!geometry && !points?.length) return g3;
        g3.line({
            points: geometry ? undefined : points,
            geometry,
            mode: this.mode,
            color: this.color,
            width: this.width,
            opacity: this.opacity,
            dashed: this.dashed,
            material: this.material,
        });
        return g3;
    }

    protected override renderSelf(ctx: RenderContext3D): void {
        ctx.draw(this.buildGraphics3D());
    }
}

// ─── sprite ──────────────────────────────────────────────────────────────────

export interface Sprite3DProps extends Node3DProps {
    map: Texture3D | undefined;
    color: Color | undefined;
    opacity: number | undefined;
    material: Material3D | undefined;
}

/** A camera-facing billboard. Always square-on to the view, whatever the angle. */
export class Sprite3D<P extends Sprite3DProps = Sprite3DProps> extends Node3D<P> {
    @property({ default: undefined }) declare map: Texture3D | undefined;
    @property({ default: undefined }) declare color: Color | undefined;
    @property({ default: undefined }) declare opacity: number | undefined;
    @property({ default: undefined }) declare material: Material3D | undefined;

    protected buildGraphics3D(): Graphics3D {
        return new Graphics3D().sprite({
            map: this.map,
            color: this.color,
            opacity: this.opacity,
            material: this.material,
        });
    }

    protected override renderSelf(ctx: RenderContext3D): void {
        ctx.draw(this.buildGraphics3D());
    }
}

// ─── model ───────────────────────────────────────────────────────────────────

export interface Model3DProps extends Node3DProps {
    /** Path to a glTF/GLB file. */
    src: string;
    /**
     * Baked animation clips, each sampled at an **explicit** time — which is what
     * keeps a model identical whether the frame was played forward or scrubbed to.
     */
    animation: readonly ModelAnimation3D[] | ModelAnimation3D | undefined;
    /** Replace materials on the loaded graph, keyed by mesh or material name. */
    override: Readonly<Record<string, Material3D>> | undefined;
}

/** A loaded glTF/GLB model. */
export class Model3D<P extends Model3DProps = Model3DProps> extends Node3D<P> {
    @property({ default: undefined }) declare src: string;
    @property({ default: undefined }) declare animation: readonly ModelAnimation3D[] | ModelAnimation3D | undefined;
    @property({ default: undefined }) declare override: Readonly<Record<string, Material3D>> | undefined;

    protected buildGraphics3D(): Graphics3D {
        const g3 = new Graphics3D();
        if (!this.src) return g3;
        g3.model({ src: this.src, animation: this.animation, override: this.override });
        return g3;
    }

    protected override renderSelf(ctx: RenderContext3D): void {
        ctx.draw(this.buildGraphics3D());
    }
}
