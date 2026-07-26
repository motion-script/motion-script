import type {
    BoxGeometry3D, BufferGeometry3D, CapsuleGeometry3D, CircleGeometry3D,
    ConeGeometry3D, CylinderGeometry3D, EdgesGeometry3D, ExtrudeGeometry3D,
    Geometry3D, LatheGeometry3D, ModelGeometry3D, ParametricGeometry3D,
    PlaneGeometry3D, PolyhedronGeometry3D, RingGeometry3D, SphereGeometry3D,
    TorusGeometry3D, TorusKnotGeometry3D, TubeGeometry3D, WireframeGeometry3D,
} from "./geometry";
import type {
    BasicMaterial3D, DepthMaterial3D, LambertMaterial3D, LineBasicMaterial3D,
    LineDashedMaterial3D, MatcapMaterial3D, NormalMaterial3D, PhongMaterial3D,
    PhysicalMaterial3D, PointsMaterial3D, ShaderMaterial3D, ShadowMaterial3D,
    SpriteMaterial3D, StandardMaterial3D, ToonMaterial3D,
} from "./material";
import type { DataTexture3D, ImageTexture3D, TextureOptions3D } from "./texture";

/** A descriptor's own params, with the `type` discriminant removed. */
type ParamsOf<T> = Omit<T, "type">;

/**
 * Geometry descriptors.
 *
 * These are plain values, so hoist one out of the builder and share it across
 * meshes — the renderer dedupes by identity, so a shared geometry is uploaded to
 * the GPU once no matter how many meshes reference it.
 *
 *   const brick = Geo.box({ width: 1, height: 0.5, depth: 0.5 });
 *   g.mesh(brick, red, { position: [0, 0, 0] })
 *    .mesh(brick, red, { position: [1, 0, 0] });   // same GPU buffer
 */
export const Geo = {
    box: (o?: ParamsOf<BoxGeometry3D>): BoxGeometry3D => ({ type: "box", ...o }),
    sphere: (o?: ParamsOf<SphereGeometry3D>): SphereGeometry3D => ({ type: "sphere", ...o }),
    plane: (o?: ParamsOf<PlaneGeometry3D>): PlaneGeometry3D => ({ type: "plane", ...o }),
    cylinder: (o?: ParamsOf<CylinderGeometry3D>): CylinderGeometry3D => ({ type: "cylinder", ...o }),
    cone: (o?: ParamsOf<ConeGeometry3D>): ConeGeometry3D => ({ type: "cone", ...o }),
    torus: (o?: ParamsOf<TorusGeometry3D>): TorusGeometry3D => ({ type: "torus", ...o }),
    torusKnot: (o?: ParamsOf<TorusKnotGeometry3D>): TorusKnotGeometry3D => ({ type: "torusKnot", ...o }),
    circle: (o?: ParamsOf<CircleGeometry3D>): CircleGeometry3D => ({ type: "circle", ...o }),
    ring: (o?: ParamsOf<RingGeometry3D>): RingGeometry3D => ({ type: "ring", ...o }),
    capsule: (o?: ParamsOf<CapsuleGeometry3D>): CapsuleGeometry3D => ({ type: "capsule", ...o }),

    tetrahedron: (o?: Omit<ParamsOf<PolyhedronGeometry3D>, "shape">): PolyhedronGeometry3D =>
        ({ type: "polyhedron", shape: "tetrahedron", ...o }),
    octahedron: (o?: Omit<ParamsOf<PolyhedronGeometry3D>, "shape">): PolyhedronGeometry3D =>
        ({ type: "polyhedron", shape: "octahedron", ...o }),
    icosahedron: (o?: Omit<ParamsOf<PolyhedronGeometry3D>, "shape">): PolyhedronGeometry3D =>
        ({ type: "polyhedron", shape: "icosahedron", ...o }),
    dodecahedron: (o?: Omit<ParamsOf<PolyhedronGeometry3D>, "shape">): PolyhedronGeometry3D =>
        ({ type: "polyhedron", shape: "dodecahedron", ...o }),

    extrude: (o: ParamsOf<ExtrudeGeometry3D>): ExtrudeGeometry3D => ({ type: "extrude", ...o }),
    lathe: (o: ParamsOf<LatheGeometry3D>): LatheGeometry3D => ({ type: "lathe", ...o }),
    tube: (o: ParamsOf<TubeGeometry3D>): TubeGeometry3D => ({ type: "tube", ...o }),

    /** Raw vertex buffers — any mesh you can compute. */
    buffer: (o: ParamsOf<BufferGeometry3D>): BufferGeometry3D => ({ type: "buffer", ...o }),
    /** A surface sampled over a `[0,1]²` grid. Sugar over {@link Geo.buffer}. */
    parametric: (o: ParamsOf<ParametricGeometry3D>): ParametricGeometry3D => ({ type: "parametric", ...o }),

    /** The hard edges of another geometry — a clean outline, no triangulation diagonals. */
    edges: (source: Geometry3D, o?: Omit<ParamsOf<EdgesGeometry3D>, "source">): EdgesGeometry3D =>
        ({ type: "edges", source, ...o }),
    /** Every triangle edge of another geometry. */
    wireframe: (source: Geometry3D): WireframeGeometry3D => ({ type: "wireframe", source }),

    model: (src: string, o?: Omit<ParamsOf<ModelGeometry3D>, "src">): ModelGeometry3D =>
        ({ type: "modelGeometry", src, ...o }),
} as const;

/**
 * Material descriptors.
 *
 * Like geometries these are shareable values — one hoisted material across many
 * meshes compiles one shader program instead of N.
 *
 * Reach for {@link Mat.standard} by default; {@link Mat.physical} only when a
 * surface actually needs clearcoat, transmission, sheen or iridescence, since
 * those cost more per pixel. {@link Mat.shader} is the full-control escape hatch.
 */
export const Mat = {
    basic: (o?: ParamsOf<BasicMaterial3D>): BasicMaterial3D => ({ type: "basic", ...o }),
    standard: (o?: ParamsOf<StandardMaterial3D>): StandardMaterial3D => ({ type: "standard", ...o }),
    physical: (o?: ParamsOf<PhysicalMaterial3D>): PhysicalMaterial3D => ({ type: "physical", ...o }),
    phong: (o?: ParamsOf<PhongMaterial3D>): PhongMaterial3D => ({ type: "phong", ...o }),
    lambert: (o?: ParamsOf<LambertMaterial3D>): LambertMaterial3D => ({ type: "lambert", ...o }),
    toon: (o?: ParamsOf<ToonMaterial3D>): ToonMaterial3D => ({ type: "toon", ...o }),
    normal: (o?: ParamsOf<NormalMaterial3D>): NormalMaterial3D => ({ type: "normal", ...o }),
    depth: (o?: ParamsOf<DepthMaterial3D>): DepthMaterial3D => ({ type: "depth", ...o }),
    matcap: (o?: ParamsOf<MatcapMaterial3D>): MatcapMaterial3D => ({ type: "matcap", ...o }),
    points: (o?: ParamsOf<PointsMaterial3D>): PointsMaterial3D => ({ type: "points", ...o }),
    lineBasic: (o?: ParamsOf<LineBasicMaterial3D>): LineBasicMaterial3D => ({ type: "lineBasic", ...o }),
    lineDashed: (o?: ParamsOf<LineDashedMaterial3D>): LineDashedMaterial3D => ({ type: "lineDashed", ...o }),
    sprite: (o?: ParamsOf<SpriteMaterial3D>): SpriteMaterial3D => ({ type: "sprite", ...o }),
    shadow: (o?: ParamsOf<ShadowMaterial3D>): ShadowMaterial3D => ({ type: "shadow", ...o }),
    /** Raw GLSL. Uniform *values* are free to animate; source changes recompile. */
    shader: (o: ParamsOf<ShaderMaterial3D>): ShaderMaterial3D => ({ type: "shader", ...o }),
} as const;

/**
 * Texture descriptors.
 *
 * {@link Tex.image} takes a manifest path and is loaded through core's ordinary
 * image pipeline, so the pixels are resident before the frame that needs them
 * draws. A bare string works anywhere a texture is expected, so `Tex.image` is
 * only needed when passing sampler options.
 */
export const Tex = {
    image: (src: string, o?: TextureOptions3D): ImageTexture3D => ({ src, ...o }),
    /** A texture from raw RGBA8888 bytes — gradient ramps, noise, LUTs. */
    data: (
        data: ArrayLike<number>,
        width: number,
        height: number,
        o?: TextureOptions3D & { revision?: number },
    ): DataTexture3D => ({ data, width, height, ...o }),
} as const;
