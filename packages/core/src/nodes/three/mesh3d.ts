import { property } from "@/attributes/properties/decorator";
import { colorProperty } from "@/attributes/properties/typed";
import type { Color } from "@/attributes/shape/fill/color/parser";
import { Graphics3D, resolveMaterialShorthand3D, type MaterialShorthand3D } from "@/render3d/graphics3d";
import { lerpFill3D, type Fill3D } from "@/render3d/fill3d";
import type { Geometry3D } from "@/render3d/geometry";
import type { Material3D, Shading3D } from "@/render3d/material";
import type { Texture3D } from "@/render3d/texture";
import type { RenderContext3D } from "@/render3d/render-context3d";
import type { Blend3D, Faces3D } from "@/render3d/transform";
import { Node3D, type Node3DProps } from "./node3d";

/**
 * The material shorthand, as node props.
 *
 * Exactly the keys {@link MaterialShorthand3D} promotes onto the `Graphics3D`
 * sugar methods, so `<Box3D fill="red" roughness={0.3} />` and
 * `g3.box({ fill: "red", roughness: 0.3 })` describe the same mesh — and each is
 * a real signal here, so any of them can be tweened.
 *
 * Ten props, where there were twenty-four. What went is everything that was a
 * renderer knob rather than a design decision — `depthWrite`, `depthTest`,
 * `alphaTest`, `toneMapped`, `polygonOffset`, `dithering` — which now live only
 * on a `Mat.*` descriptor passed through {@link material}; plus `transparent`,
 * which is derived; plus five texture slots, which are fills.
 */
export interface Material3DProps {
    /** A full descriptor (or an array, for multi-material). Wins over the rest. */
    material: Material3D | readonly Material3D[] | undefined;
    /** What the surface is made of — the same value a 2D `fill` takes. */
    fill: Fill3D;
    opacity: number;
    roughness: number;
    metalness: number;
    emission: Color | undefined;
    emissionStrength: number;
    normalMap: Texture3D | undefined;
    roughnessMap: Texture3D | undefined;
    metalnessMap: Texture3D | undefined;
    aoMap: Texture3D | undefined;
    alphaMap: Texture3D | undefined;
    envMapIntensity: number;
    wireframe: boolean;
    /** Facet or smooth shading. Default `"smooth"`. */
    shading: Shading3D;
    /** Which faces to rasterize. Default `"front"`. */
    faces: Faces3D;
    vertexColors: boolean;
    blend: Blend3D;
    /** Shade with an unlit `basic` material instead of `standard`. */
    unlit: boolean;
}

export interface Mesh3DProps extends Node3DProps, Partial<Material3DProps> {
    /** The geometry to draw. Set directly, or by a geometry subclass's props. */
    geometry: Geometry3D;
}

/** The shorthand keys, in the order they are copied onto a built descriptor. */
const MATERIAL_PROP_KEYS = [
    "opacity", "roughness", "metalness",
    "emission", "emissionStrength", "normalMap", "roughnessMap",
    "metalnessMap", "aoMap", "alphaMap", "envMapIntensity", "wireframe",
    "shading", "faces", "vertexColors", "blend",
] as const;

/**
 * A drawable 3D object — geometry plus a material.
 *
 * The 3D counterpart of {@link ShapeNode}: it owns the material vocabulary, and
 * the geometry sugar nodes ({@link Box3D}, {@link Sphere3D}, …) subclass it to
 * supply a geometry from their own props.
 *
 *   <Mesh3D geometry={Geo.torusKnot({ radius: 1.2 })} fill="tomato" roughness={0.2} />
 *   <Box3D fill={["#1a1a2e", Fills.linearGradient(["#e0533d", "#8b5cf6"])]} />
 *
 * Every material key is a signal, so `mesh().to({ roughness: 1, fill: "cyan" }, 1)`
 * animates in place — three writes the values onto the live material rather than
 * recompiling. Geometry *parameters* are the exception: three geometries are
 * immutable, so tweening a `radius` reallocates the mesh every frame. Tween
 * `scale` (or `scaleX`/`scaleY`/`scaleZ`) instead.
 */
export class Mesh3D<P extends Mesh3DProps = Mesh3DProps> extends Node3D<P> {
    @property({ default: undefined }) declare geometry: Geometry3D;
    @property({ default: undefined }) declare material: Material3D | readonly Material3D[] | undefined;

    @property({ default: "white", tween: lerpFill3D }) declare fill: Fill3D;
    @property({ default: undefined }) declare opacity: number | undefined;
    @property({ default: undefined }) declare roughness: number | undefined;
    @property({ default: undefined }) declare metalness: number | undefined;
    @colorProperty({ default: undefined }) declare emission: Color | undefined;
    @property({ default: undefined }) declare emissionStrength: number | undefined;
    @property({ default: undefined }) declare normalMap: Texture3D | undefined;
    @property({ default: undefined }) declare roughnessMap: Texture3D | undefined;
    @property({ default: undefined }) declare metalnessMap: Texture3D | undefined;
    @property({ default: undefined }) declare aoMap: Texture3D | undefined;
    @property({ default: undefined }) declare alphaMap: Texture3D | undefined;
    @property({ default: undefined }) declare envMapIntensity: number | undefined;
    @property({ default: undefined }) declare wireframe: boolean | undefined;
    @property({ default: undefined }) declare shading: Shading3D | undefined;
    @property({ default: undefined }) declare faces: Faces3D | undefined;
    @property({ default: undefined }) declare vertexColors: boolean | undefined;
    @property({ default: undefined }) declare blend: Blend3D | undefined;
    @property({ default: false }) declare unlit: boolean;

    /**
     * The geometry this node draws.
     *
     * Overridden by each sugar subclass to build one from its own props; the base
     * returns the `geometry` prop, so `<Mesh3D geometry={Geo.lathe(...)} />` works
     * for anything the sugar doesn't cover.
     */
    protected buildGeometry(): Geometry3D | undefined {
        return this.geometry;
    }

    /**
     * The material shorthand, gathered off the props that were actually set.
     *
     * `undefined` defaults are deliberate: an omitted key must stay absent from
     * the descriptor so `Graphics3D` picks the renderer's own default, rather than
     * being pinned to a value this node invented.
     */
    protected materialShorthand(): MaterialShorthand3D {
        const out: Record<string, unknown> = {};
        const material = this.material;
        if (material !== undefined) out.material = material;
        if (this.fill !== undefined) out.fill = this.fill;
        for (const key of MATERIAL_PROP_KEYS) {
            const value = (this as unknown as Record<string, unknown>)[key];
            if (value !== undefined) out[key] = value;
        }
        if (this.unlit) out.unlit = true;
        return out as MaterialShorthand3D;
    }

    /**
     * What this node draws this frame.
     *
     * The single seam both the real render and the asset-declaration pass go
     * through — the same discipline as `Rect.shapeGraphics()` — so the textures
     * that get loaded can never drift from the ones that get drawn.
     */
    protected buildGraphics3D(): Graphics3D {
        const g3 = new Graphics3D();
        const geometry = this.buildGeometry();
        if (geometry) g3.mesh(geometry, resolveMaterialShorthand3D(this.materialShorthand()));
        return g3;
    }

    protected override renderSelf(ctx: RenderContext3D): void {
        ctx.draw(this.buildGraphics3D());
    }
}

