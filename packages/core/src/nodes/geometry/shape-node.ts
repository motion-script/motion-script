import { resolveFillArray, lerpFillArray, updateFill, prepareFill, hasDynamicFill } from "@/attributes/shape/fill/registry";

import { lerpStrokeArray } from "@/attributes/shape/stroke/lerp";
import { lerpShadowArray } from "@/attributes/shape/shadow/lerp";
import { resolveStrokeArray, StrokeResolved, type StrokeProp } from "@/attributes/shape/stroke/mapper";
import { resolveShadowArray, ShadowResolved, type ShadowProp } from "@/attributes/shape/shadow/resolver";
import { FillResolved } from "@/attributes/shape/fill/union";
import { ChainableFill } from "@/attributes/shape/fill/chain";

import { ClipShape, RenderContext } from "@/render/render-context";
import { AssetTracker } from "@/assets/tracker";
import { property } from "@/attributes/properties/decorator";
import { Node, NodeConfig, NodeProps } from "../base/node";
import type { BulgeEffect } from "@/attributes/shape/effects/implementations/bulge";
import type { MagnifyEffect } from "@/attributes/shape/effects/implementations/magnify";
import type { SkSLEffect } from "@/attributes/shape/effects/implementations/sksl";


export interface ShapeProps extends NodeProps {
    /**
     * Fill layer(s). Each item can be:
     * - A plain CSS color string → treated as a solid fill
     * - A fill prop object (SolidFillProp, LinearGradientFillProp, …)
     * - An already-resolved fill object
     * - A {@link FillChain} from the `Fill` builder (e.g. `Fill.color('red')`)
     */
    fill?: ChainableFill;
    /**
     * Stroke layer(s). `fill` inside each stroke accepts the same loose
     * values as the top-level fill prop.
     */
    stroke?: StrokeProp | StrokeProp[];
    /**
     * Shadow layer(s). `fill` inside each shadow accepts the same loose
     * values as the top-level fill prop.
     */
    shadow?: ShadowProp | ShadowProp[];
    start?: number;
    end?: number;
    /** When true, content drawn outside this shape's outline is clipped away. */
    clip?: boolean;
}


export abstract class ShapeNode<P extends ShapeProps> extends Node<P> {

    @property({ default: [], mapper: resolveFillArray, tween: lerpFillArray })
    declare readonly fill: FillResolved[];

    // Stroke weight feeds Rect.effectivePadding(), which insets children.
    @property({ default: [], mapper: resolveStrokeArray, tween: lerpStrokeArray })
    declare readonly stroke: StrokeResolved[];

    @property({ default: [], mapper: resolveShadowArray, tween: lerpShadowArray })
    declare readonly shadow: ShadowResolved[];

    @property({ default: 0 })
    declare readonly start: number;

    @property({ default: 1 })
    declare readonly end: number;

    @property({ default: false })
    declare readonly clip: boolean;

    // Cached: does any current fill need a per-frame update() (e.g. video)?
    // Static fills (solid, gradients, noise, image) have an identity update, so
    // there's nothing to recompute each frame and tick() can skip entirely.
    private _hasDynamicFill = false;

    constructor(props: NodeConfig<any, P>) {
        super(props);
        this.watchFillForDynamic();
    }

    // Track whether the current fill needs per-frame updates. Re-run after the
    // signals are re-created (reinitProps) so a reused scene root keeps a live
    // subscription rather than a stale one pointing at a disposed cell.
    private watchFillForDynamic(): void {
        const fillCell = this.__signals?.get("fill");
        if (!fillCell) return;
        const refresh = () => {
            this._hasDynamicFill = hasDynamicFill(fillCell.get() as FillResolved[]);
        };
        refresh();
        fillCell.subscribe(refresh);
    }

    protected override reinitProps(): void {
        if (this.__signals) return;
        super.reinitProps();
        this.watchFillForDynamic();
    }

    public tick(time: number): void {
        if (!this._hasDynamicFill) return;
        this.set({ fill: this.fill.map(fill => updateFill(fill, time, this.assets)) } as Partial<P>);
    }

    prepare(tracker: AssetTracker): void {
        super.prepare(tracker);
        [
            ...this.fill,
            ...this.stroke.map(s => s.fill),
            ...this.shadow.map(s => s.fill),
        ].forEach(fill => prepareFill(fill, tracker, this.layoutRect.width, this.layoutRect.height));
    }

    protected abstract renderSelf(ctx: RenderContext): void;

    /**
     * Push a clip region matching this shape's outline. Subclasses with a
     * concrete silhouette (rect, ellipse, …) override this; the default is a
     * no-op so shapes without a clip outline simply render unclipped.
     */
    protected applyClip(_ctx: RenderContext): void { }

    /**
     * This shape's outline, used to clip the background blur to its silhouette.
     * Concrete shapes with a fillable outline override this; the default `null`
     * means the shape gets no background blur.
     */
    protected silhouette(): ClipShape | null { return null; }

    /**
     * Apply backdrop effects (background blur, bulge/pinch) beneath this shape,
     * clipped to its silhouette, before the shape's own fill/stroke are drawn —
     * so the content underneath is blurred/warped while the shape's own edges
     * stay sharp. Each effect opens a backdrop layer within the silhouette clip
     * and composites it straight back.
     */
    private applyBackdropEffects(ctx: RenderContext): void {
        let blurRadius = 0;
        const distortions: MagnifyEffect[] = [];
        const skslBackdrops: SkSLEffect[] = [];
        for (const effect of this.effects) {
            if (effect.type === "backgroundBlur") blurRadius += effect.radius;
            else if (effect.type === "magnify") distortions.push(effect);
            else if (effect.type === "sksl" && effect.mode === "backdrop") skslBackdrops.push(effect);
        }
        if (blurRadius <= 0 && distortions.length === 0 && skslBackdrops.length === 0) return;

        const shape = this.silhouette();
        if (!shape) return;

        const w = this.layoutRect?.width ?? 0;
        const h = this.layoutRect?.height ?? 0;

        // Clip to the silhouette first so each backdrop layer is confined to the
        // shape; the renderer opens the backdrop filter within that clip.
        ctx.beginClipShape(shape);
        if (blurRadius > 0) {
            ctx.beginBackgroundBlur(blurRadius);
            ctx.endBackgroundBlur();
        }
        for (const effect of distortions) {
            ctx.beginBackgroundDistortion(effect, w, h);
            ctx.endBackgroundDistortion();
        }
        for (const effect of skslBackdrops) {
            ctx.beginBackdropSkSL(effect, w, h);
            ctx.endBackdropSkSL();
        }
        ctx.endClip();
    }

    /** The bulge effect, if any — applied to this node's own content (self + children). */
    private bulgeEffect(): BulgeEffect | undefined {
        return this.effects.find((e): e is BulgeEffect => e.type === "bulge");
    }

    onRender(ctx: RenderContext): void {
        this.applyTransform(ctx);
        this.applyBackdropEffects(ctx);

        // Bulge warps the node's own content (like blur), so capture everything
        // this node paints — its fill/stroke and its children — and warp the lot.
        const bulge = this.bulgeEffect();
        if (bulge) {
            const w = this.layoutRect?.width ?? 0;
            const h = this.layoutRect?.height ?? 0;
            ctx.beginForegroundDistortion(bulge, w, h);
        }

        this.renderSelf(ctx);
        if (this.clip) this.applyClip(ctx);
        this.renderChildren(ctx);
        if (this.clip) ctx.endClip();

        if (bulge) ctx.endForegroundDistortion();
    }
}
