import { property } from "@/attributes/properties/decorator";
import { colorProperty } from "@/attributes/properties/typed";
import type { Color } from "@/attributes/shape/fill/color/parser";
import { Graphics3D, type MaterialShorthand3D } from "@/render3d/graphics3d";
import type { Geometry3D } from "@/render3d/geometry";
import type { Material3D } from "@/render3d/material";
import type { Texture3D } from "@/render3d/texture";
import type { RenderContext3D } from "@/render3d/render-context3d";
import type { Blending3D, Side3D } from "@/render3d/transform";
import { Node3D, type Node3DProps } from "./node3d";

/**
 * The material shorthand, as node props.
 *
 * Exactly the keys {@link MaterialShorthand3D} promotes onto the `Graphics3D`
 * sugar methods, so `<Box3D color="red" roughness={0.3} />` and
 * `g3.box({ color: "red", roughness: 0.3 })` describe the same mesh — and each is
 * a real signal here, so any of them can be tweened.
 */
export interface Material3DProps {
    /** A full descriptor (or an array, for multi-material). Wins over the rest. */
    material: Material3D | readonly Material3D[] | undefined;
    color: Color;
    opacity: number;
    transparent: boolean;
    roughness: number;
    metalness: number;
    emissive: Color | undefined;
    emissiveIntensity: number;
    map: Texture3D | undefined;
    normalMap: Texture3D | undefined;
    roughnessMap: Texture3D | undefined;
    metalnessMap: Texture3D | undefined;
    aoMap: Texture3D | undefined;
    alphaMap: Texture3D | undefined;
    envMapIntensity: number;
    wireframe: boolean;
    flatShading: boolean;
    side: Side3D;
    vertexColors: boolean;
    depthWrite: boolean;
    depthTest: boolean;
    blending: Blending3D;
    alphaTest: number;
    toneMapped: boolean;
    /** Shade with an unlit `basic` material instead of `standard`. */
    unlit: boolean;
}

export interface Mesh3DProps extends Node3DProps, Partial<Material3DProps> {
    /** The geometry to draw. Set directly, or by a geometry subclass's props. */
    geometry: Geometry3D;
}

/** The shorthand keys, in the order they are copied onto a built descriptor. */
const MATERIAL_PROP_KEYS = [
    "color", "opacity", "transparent", "roughness", "metalness",
    "emissive", "emissiveIntensity", "map", "normalMap", "roughnessMap",
    "metalnessMap", "aoMap", "alphaMap", "envMapIntensity", "wireframe",
    "flatShading", "side", "vertexColors", "depthWrite", "depthTest",
    "blending", "alphaTest", "toneMapped",
] as const;

/**
 * A drawable 3D object — geometry plus a material.
 *
 * The 3D counterpart of {@link ShapeNode}: it owns the material vocabulary, and
 * the geometry sugar nodes ({@link Box3D}, {@link Sphere3D}, …) subclass it to
 * supply a geometry from their own props.
 *
 *   <Mesh3D geometry={Geo.torusKnot({ radius: 1.2 })} color="tomato" roughness={0.2} />
 *
 * Every material key is a signal, so `mesh().to({ roughness: 1, color: "cyan" }, 1)`
 * animates in place — three writes the values onto the live material rather than
 * recompiling. Geometry *parameters* are the exception: three geometries are
 * immutable, so tweening a `radius` reallocates the mesh every frame. Tween
 * `scale` instead.
 */
export class Mesh3D<P extends Mesh3DProps = Mesh3DProps> extends Node3D<P> {
    @property({ default: undefined }) declare geometry: Geometry3D;
    @property({ default: undefined }) declare material: Material3D | readonly Material3D[] | undefined;

    @colorProperty({ default: "white" }) declare color: Color;
    @property({ default: undefined }) declare opacity: number | undefined;
    @property({ default: undefined }) declare transparent: boolean | undefined;
    @property({ default: undefined }) declare roughness: number | undefined;
    @property({ default: undefined }) declare metalness: number | undefined;
    @colorProperty({ default: undefined }) declare emissive: Color | undefined;
    @property({ default: undefined }) declare emissiveIntensity: number | undefined;
    @property({ default: undefined }) declare map: Texture3D | undefined;
    @property({ default: undefined }) declare normalMap: Texture3D | undefined;
    @property({ default: undefined }) declare roughnessMap: Texture3D | undefined;
    @property({ default: undefined }) declare metalnessMap: Texture3D | undefined;
    @property({ default: undefined }) declare aoMap: Texture3D | undefined;
    @property({ default: undefined }) declare alphaMap: Texture3D | undefined;
    @property({ default: undefined }) declare envMapIntensity: number | undefined;
    @property({ default: undefined }) declare wireframe: boolean | undefined;
    @property({ default: undefined }) declare flatShading: boolean | undefined;
    @property({ default: undefined }) declare side: Side3D | undefined;
    @property({ default: undefined }) declare vertexColors: boolean | undefined;
    @property({ default: undefined }) declare depthWrite: boolean | undefined;
    @property({ default: undefined }) declare depthTest: boolean | undefined;
    @property({ default: undefined }) declare blending: Blending3D | undefined;
    @property({ default: undefined }) declare alphaTest: number | undefined;
    @property({ default: undefined }) declare toneMapped: boolean | undefined;
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
        if (geometry) g3.mesh(geometry, materialFor(this.materialShorthand()));
        return g3;
    }

    protected override renderSelf(ctx: RenderContext3D): void {
        ctx.draw(this.buildGraphics3D());
    }
}

/**
 * Desugar the material shorthand into a descriptor, reusing `Graphics3D`'s own
 * rules so a node and a builder call agree on what `{ color, roughness }` means.
 */
function materialFor(shorthand: MaterialShorthand3D): Material3D | readonly Material3D[] | undefined {
    if (shorthand.material !== undefined) return shorthand.material;
    const { material: _material, unlit, ...rest } = shorthand;
    return { type: unlit ? "basic" : "standard", ...rest } as Material3D;
}
