import { RenderContext2D } from "@/render/render-context2d";
import { Scene3D } from "@/render3d/scene3d";
import {
    resolveShadows3D,
    type PostEffect3D, type Shadows3D, type ToneMapping3D,
} from "@/render3d/scene-settings";
import type { Color } from "@/attributes/shape/fill/color/parser";
import type { FillResolved } from "@/attributes/shape/fill/union";
import { warmCanvas3D } from "@/render3d/resources";
import { forEachTexture3D } from "@/render3d/walk";
import { isSurfaceTexture3D, resolveSurfaceSource } from "@/render3d/texture";
import { AssetTracker } from "@/assets/tracker";
import { Fills, resolveChainFill } from "@/attributes/shape/fill/chain";
import { property } from "@/attributes/properties/decorator";
import { track3DResources } from "@/render3d/tracking";
import { Rect, RectProps } from "../geometry/rect-node";
import { Node, NodeConfig } from "@/nodes/node/node";
import { Node3D } from "./node3d";
import { declareLayoutAssets, declareRenderAssets } from "@/nodes/node/node-walk";

export interface Canvas3DProps extends RectProps {
    /**
     * Ceiling on the 3D buffer's device-pixel ratio. Default 2.
     *
     * Lower it for an expensive scene: the 3D renders at a smaller buffer and is
     * scaled up on composite, which trades sharpness for fill rate.
     */
    maxPixelRatio: number;
    /** Multisample the 3D pass. Default true. */
    antialias: boolean;
    /**
     * Turn shadow casting on for the scene. A switch, or `{ quality }`.
     *
     * A render setting rather than a scene object, which is why it is a prop here
     * and not a `<Shadows3D>` node: it has no position, and two of them in a tree
     * meant one silently doing nothing.
     */
    shadows: Shadows3D;
    /** How HDR colour is compressed to what the screen can show. Default `"aces"`. */
    tone: ToneMapping3D;
    /** Stops of exposure applied before tone mapping. Default 1. */
    exposure: number;
    /**
     * Post-processing inside the 3D composite: `bloom`, `ssao`, `dof`, `outline`.
     *
     * Short by design — a `Canvas3D` is a `Node2D`, so vignette, grain, grading,
     * blur and the rest of the 2D `effects` chain already run over the composited
     * result. What is here is what genuinely needs the depth buffer, object ids,
     * or HDR radiance before tone mapping.
     */
    post: PostEffect3D | readonly PostEffect3D[];
}

/**
 * A 3D viewport in the 2D document — the one node that holds both dimensions.
 *
 * `Canvas3D` is a {@link Rect} that partitions its children by which tree they
 * belong to. `Node3D` children describe a scene: they are walked through a
 * {@link Scene3D} every frame and the result is painted through this rect's own
 * path. `Node2D` children are ordinary children and draw *over* the 3D, which is
 * how a HUD is written.
 *
 *   <Canvas3D width="fill" height="fill" cornerRadius={24} fill="#0b0d12" shadows>
 *       <Camera3D orbit={-18} elevation={12} distance={13} fov={45} />
 *       <AmbientLight3D intensity={0.4} />
 *       <DirectionalLight3D intensity={2.4} position={[4, 6, 3]} shadow />
 *       <Fog3D near={5} far={30} />
 *
 *       <Group3D ref={rig}>
 *           <Box3D width={2} cornerRadius={0.15} fill="tomato" roughness={0.3} />
 *       </Group3D>
 *
 *       <Text text="FPS 60" fontSize={32} />       // a 2D HUD, over the 3D
 *   </Canvas3D>
 *
 * Being a `Rect` is what makes it lay out in flex/stack groups, take
 * `cornerRadius`/`clip`, be masked, blended and filtered. The 3D is one more
 * fill layer, so the author's own `fill` paints *beneath* it and `stroke` and
 * `overlay` still paint over everything.
 *
 * **That fill is also the background.** There is no `<Background3D>`: three's
 * background pass is unaffected by every light and by fog, the renderer clears
 * transparent, and this node already composites the 3D over its own fill layers —
 * so a solid colour, a gradient, an image or a video behind a 3D scene is the
 * ordinary 2D fill chain, which does strictly more. What genuinely needs the 3D
 * pass is a sky that reprojects as the camera turns, and that is
 * `<Environment3D background>`.
 *
 * The scene is a value, not machinery: the same recorded {@link Scene3D} can be
 * built by hand and used as a fill on any shape, which is how 3D is painted
 * through glyphs or an arbitrary path (`<Text fill={scene} />`).
 */
export class Canvas3D<P extends Canvas3DProps = Canvas3DProps> extends Rect<P> {

    @property({ default: 2 }) declare maxPixelRatio: number;
    @property({ default: true }) declare antialias: boolean;
    @property({ default: false }) declare shadows: Shadows3D;
    @property({ default: undefined }) declare tone: ToneMapping3D | undefined;
    @property({ default: undefined }) declare exposure: number | undefined;
    @property({ default: undefined }) declare post: PostEffect3D | readonly PostEffect3D[] | undefined;

    constructor(props?: NodeConfig<Canvas3D<P>, P>) {
        super((props ?? {}) as NodeConfig<any, P>);
    }

    /**
     * Accept both dimensions — the only node that does.
     *
     * Everywhere else a mixed tree is a mistake that would silently draw nothing
     * (see {@link Node.acceptsChild}); here it is the entire point.
     */
    protected override acceptsChild(child: Node): boolean {
        return true;
    }

    /** This node's children that describe the 3D scene. */
    get children3D(): Node3D[] {
        return this._children.filter((c): c is Node3D => c instanceof Node3D);
    }

    /**
     * A 3D viewport has no intrinsic size and shouldn't be sized by its overlay
     * children — hugging a HUD label would collapse the viewport to the size of
     * the text. So it fills unless given an explicit size, whether or not it has
     * children (which is where this diverges from {@link Rect}).
     */
    protected override applyDefaultSize(props?: NodeConfig<any, P>): void {
        if (!props || props.width === undefined) this.applyProp("width", "fill");
        if (!props || props.height === undefined) this.applyProp("height", "fill");
    }

    /**
     * Record this frame's scene by walking the 3D children.
     *
     * The single seam both the real render and the asset-declaration pass go
     * through, so what gets loaded can never drift from what gets drawn. Override
     * it in a subclass for a reusable 3D component that builds its scene some
     * other way.
     *
     * Called inside the synchronous render pass, after the frame's state has been
     * evaluated and layout resolved, so every signal read here samples the
     * *current* frame. That is what makes a 3D scene seekable: frame N is
     * identical whether it was reached by playing forward or by scrubbing
     * backwards, because nothing accumulates.
     */
    protected buildScene3D(): Scene3D {
        const scene = new Scene3D();

        // The viewport's own render settings go on first, so a node in the tree
        // can still override one — the same last-writer-wins rule the scene
        // settings have always had, with the viewport as the first writer.
        const shadows = resolveShadows3D(this.shadows);
        if (shadows) scene.shadows(shadows);
        if (this.tone !== undefined || this.exposure !== undefined) {
            scene.tone({ mapping: this.tone, exposure: this.exposure });
        }
        if (this.post !== undefined) scene.post(this.post);

        for (const child of this._children) {
            if (child instanceof Node3D) child.render(scene);
        }

        // Fog with no colour of its own takes the viewport's. Fog that does not
        // match what is behind it reads as a grey wall rather than as distance,
        // and the two being typed separately is exactly how they drift — which
        // is what the old `<Background3D>` + `<Fog3D>` pair made you do.
        const fog = scene.fogDescriptor();
        if (fog && fog.color === undefined) {
            const base = baseFillColor(this.fill as FillResolved[]);
            if (base !== undefined) scene.fog({ ...fog, color: base });
        }

        return scene;
    }

    /**
     * This frame's scene, for a reader outside the render pass.
     *
     * {@link buildScene3D} is protected because a subclass overrides it, not
     * because the result is private — the asset pass and the render already call
     * it twice a frame. The editor geometry in `runtime/node-picking3d.ts` is the
     * third caller, and it has to go through the *same* seam rather than walking
     * the `Node3D` children itself: a subclass that builds its scene some other
     * way (supplying a default camera and lighting rig, say) would otherwise be
     * picked against a scene nobody renders.
     *
     * Recorded fresh, like the other two, so what it reports is this frame's
     * state rather than a cache a scrub could leave behind.
     */
    /** @internal */
    _scene3D(): Scene3D {
        return this.buildScene3D();
    }

    /**
     * Declare the 3D runtime, plus every texture, model and env map the scene
     * references.
     *
     * The runtime goes on the timeline as an async load rather than being warmed
     * fire-and-forget: it is a genuine precondition of drawing a 3D frame, and
     * `addAsync` is what lets the render path wait for it instead of falling back
     * per frame. It resolves nothing, because three stays resident once loaded.
     *
     * The resources come from the same `buildScene3D()` the render uses, so what
     * is declared cannot drift from what is drawn — and they are declared *here*
     * rather than by each `Node3D`, because sizing an image decode needs the
     * pixel size of the buffer it lands in, which only this node knows.
     */
    override prepareRender(tracker: AssetTracker): void {
        super.prepareRender(tracker);
        // `warmCanvas3D` is a no-op returning `void` when no backend has registered
        // a 3D runtime, so it can't be handed to `addAsync` bare.
        tracker.addAsync("three:runtime", async () => { await warmCanvas3D(); });

        const scene = this.buildScene3D();
        if (scene.isEmpty()) return;
        const rect = this.layoutBounds;
        track3DResources(scene, tracker, rect?.width ?? 0, rect?.height ?? 0);
        this.prepareSurfaceSources(scene, tracker);
    }

    /**
     * Declare what each `Tex.surface` **node** source needs to draw itself.
     *
     * A source is 2D content one level below the scene, and it is a value in a
     * descriptor rather than a child — so the ordinary child walk never reaches
     * it, and without this its webfont is never declared, never loads, and its
     * glyphs never paint. `track3DResources` cannot cover it: a surface texture
     * has no `src` to report.
     *
     * A `Graphics2D` source needs nothing here — it carries no assets of its own
     * beyond what its ops name, which the draw path resolves.
     */
    private prepareSurfaceSources(scene: Scene3D, tracker: AssetTracker): void {
        forEachTexture3D(scene, (texture) => {
            if (!isSurfaceTexture3D(texture)) return;
            const source = resolveSurfaceSource(texture.source);
            if (source.kind !== "node") return;
            const node = source.node;
            // Bound before it is asked to declare anything: a `Text` reads its
            // inherited `<DefaultTextStyle>` to know which family to ask for.
            this.attachDetached(node);
            // No layout pass first, and none needed: `prepareLayout` is specified
            // to run *before* layout, so a font is declared from the node's props
            // rather than from its box. The renderer lays the source out against
            // the buffer when it rasterizes it.
            declareLayoutAssets(node, tracker);
            declareRenderAssets(node, tracker);
        });
    }

    /**
     * Bind every `Node2D` used as a `Tex.surface` source in this scene.
     *
     * A source node is detached — it is a value in a descriptor, not a child — so
     * nothing else would ever hand it an asset catalog, a context map or a clock.
     * This node has all three, and is the only thing that knows the scene, so it
     * adopts them. See {@link Node.attachDetached}.
     */
    private bindSurfaceSources(scene: Scene3D): void {
        forEachTexture3D(scene, (texture) => {
            if (!isSurfaceTexture3D(texture)) return;
            const source = resolveSurfaceSource(texture.source);
            if (source.kind === "node") this.attachDetached(source.node);
        });
    }

    protected override renderSelf(ctx: RenderContext2D): void {
        const built = this.buildScene3D();
        const scene = built.isEmpty() ? null : built;

        if (scene) {
            // Fail loudly at the author's source rather than silently reparenting
            // everything after an unclosed scope.
            scene.assertBalanced();
            this.bindSurfaceSources(scene);
        }

        // The author's own fill layers stay first, so a `fill` still paints
        // *beneath* the 3D; the scene goes on top as one more layer.
        const fill = scene
            ? [
                ...resolveChainFill(this.fill),
                ...Fills.canvas3D(scene, {
                    maxPixelRatio: this.maxPixelRatio,
                    antialias: this.antialias,
                }),
            ]
            : this.fill;

        // Stroke is deferred to renderStroke (drawn after children + overlay).
        ctx.draw(this.shapeGraphics().shadow(this.shadow).fill(fill));
    }
}

/**
 * The colour a fill chain reads as, for anything that has to match it.
 *
 * The first opaque solid layer, which is what a background stack is built on:
 * everything above it is a gradient, an image or a texture painted *over* a base
 * colour, and it is that base a receding surface fades into. Returns `undefined`
 * for a chain with no solid layer at all, which leaves the renderer's own
 * default in place rather than inventing black.
 */
function baseFillColor(fill: FillResolved[] | undefined): Color | undefined {
    if (!fill) return undefined;
    for (const layer of fill) {
        if (layer && (layer as { type?: string }).type === "solid") {
            return (layer as unknown as { color: Color }).color;
        }
    }
    return undefined;
}
