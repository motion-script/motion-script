import { resolveFillArray, lerpFillArray, updateFill, prepareFill, hasDynamicFill } from "@/attributes/shape/fill/registry";

import { lerpStrokeArray } from "@/attributes/shape/stroke/lerp";
import { lerpShadowArray } from "@/attributes/shape/shadow/lerp";
import { resolveStrokeArray, StrokeResolved, type StrokeProp } from "@/attributes/shape/stroke/mapper";
import { resolveShadowArray, ShadowResolved, type ShadowProp } from "@/attributes/shape/shadow/resolver";
import { FillResolved } from "@/attributes/shape/fill/union";
import { ChainableFill } from "@/attributes/shape/fill/chain";

import { RenderContext } from "@/render/render-context";
import { Clip } from "@/render/clip";
import { AssetTracker } from "@/assets/tracker";
import { property } from "@/attributes/properties/decorator";
import { Node, NodeConfig, NodeProps } from "../base/node";
import type { BulgeEffect } from "@/attributes/shape/effects/implementations/bulge";
import type { MagnifyEffect } from "@/attributes/shape/effects/implementations/magnify";
import type { PosterizeEffect } from "@/attributes/shape/effects/implementations/posterize";
import type { SkSLEffect } from "@/attributes/shape/effects/implementations/sksl";
import type { SceneEffect } from "@/attributes/shape/effects/union";
import { TweenOptions } from "@/tween/lerp";
import { wait } from "@/tween/wait";
import { FrameGenerator } from "@/tween/generator";
import { tween } from "@/tween/tween";


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
            ...this.stroke.flatMap(s => s.fill),
            ...this.shadow.flatMap(s => s.fill),
        ].forEach(fill => prepareFill(fill, tracker, this.layoutRect.width, this.layoutRect.height));
    }

    protected abstract renderSelf(ctx: RenderContext): void;

    /**
     * This shape's outline as a {@link Clip} command list — the single source of
     * truth for every clip the node needs: its `clip` boundary (when `clip` is
     * true) and the silhouette its backdrop effects (backdrop-flagged filters,
     * magnify) are confined to. Concrete shapes with a fillable outline override this to
     * describe their geometry (and can compose multiple shapes / `cut()`s for a
     * compound clip); the default `null` means the shape has no clip outline, so
     * it renders unclipped and gets no backdrop effects.
     */
    protected clipSelf(): Clip | null { return null; }

    /**
     * Push this shape's `clipSelf()` outline as a clip scope, confining whatever
     * is drawn until the matching `endClip()` to the shape. Returns `true` when a
     * clip was actually opened (so the caller knows to close it) and `false` when
     * the shape has no outline. Not overridable — the outline is defined once in
     * `clipSelf()`.
     */
    private applyClip(ctx: RenderContext): boolean {
        const clip = this.clipSelf();
        if (!clip || clip.isEmpty()) return false;
        ctx.beginClip(clip);
        return true;
    }

    /**
     * Apply backdrop effects (any `backdrop`-flagged filter effect — blur,
     * grayscale, …; plus magnify and backdrop SkSL) beneath this shape, clipped
     * to its silhouette, before the shape's own fill/stroke are drawn — so the
     * content underneath is filtered/warped while the shape's own edges stay
     * sharp. Each opens a backdrop layer within the silhouette clip and
     * composites it straight back.
     */
    private applyBackdropEffects(ctx: RenderContext): void {
        // Filter-expressible effects flagged backdrop are composed into one
        // ImageFilter by the renderer. magnify, backdrop-mode sksl, and posterize
        // are shader-based and carry their own dedicated backdrop paths; magnify
        // and backdrop sksl aren't `backdrop`-flagged, posterize is.
        const filters: SceneEffect[] = [];
        const distortions: MagnifyEffect[] = [];
        const skslBackdrops: SkSLEffect[] = [];
        const posterizes: PosterizeEffect[] = [];
        for (const effect of this.effects) {
            if (effect.type === "magnify") distortions.push(effect);
            else if (effect.type === "sksl" && effect.mode === "backdrop") skslBackdrops.push(effect);
            else if (effect.type === "posterize" && effect.backdrop === true) posterizes.push(effect);
            else if ("backdrop" in effect && effect.backdrop === true) filters.push(effect);
        }
        if (
            filters.length === 0 && distortions.length === 0 &&
            skslBackdrops.length === 0 && posterizes.length === 0
        ) return;

        const clip = this.clipSelf();
        if (!clip || clip.isEmpty()) return;

        const w = this.layoutRect?.width ?? 0;
        const h = this.layoutRect?.height ?? 0;

        // Clip to the silhouette first so each backdrop layer is confined to the
        // shape; the renderer opens the backdrop filter within that clip.
        ctx.beginClip(clip);
        if (filters.length > 0) {
            ctx.beginBackdropFilter(filters, w, h);
            ctx.endBackdropFilter();
        }
        for (const effect of distortions) {
            ctx.beginBackgroundDistortion(effect, w, h);
            ctx.endBackgroundDistortion();
        }
        for (const effect of skslBackdrops) {
            ctx.beginBackdropSkSL(effect, w, h);
            ctx.endBackdropSkSL();
        }
        for (const effect of posterizes) {
            ctx.beginBackdropPosterize(effect, w, h);
            ctx.endBackdropPosterize();
        }
        ctx.endClip();
    }

    /** The bulge effect, if any — applied to this node's own content (self + children). */
    private bulgeEffect(): BulgeEffect | undefined {
        return this.effects.find((e): e is BulgeEffect => e.type === "bulge");
    }

    /**
     * The foreground posterize effect, if any — quantizes this node's own content
     * (self + children). `backdrop`-flagged posterize bands the backdrop instead
     * (see {@link applyBackdropEffects}), so it's excluded here.
     */
    private posterizeEffect(): PosterizeEffect | undefined {
        return this.effects.find((e): e is PosterizeEffect => e.type === "posterize" && e.backdrop !== true);
    }

    onRender(ctx: RenderContext): void {
        this.applyTransform(ctx);
        this.applyBackdropEffects(ctx);

        const w = this.layoutRect?.width ?? 0;
        const h = this.layoutRect?.height ?? 0;

        // Posterize quantizes the node's own pixels. It wraps the bulge scope so
        // it bands the final (possibly warped) content, mirroring how blur-style
        // content effects compose.
        const posterize = this.posterizeEffect();
        if (posterize) ctx.beginPosterize(posterize, w, h);

        // Bulge warps the node's own content (like blur), so capture everything
        // this node paints — its fill/stroke and its children — and warp the lot.
        const bulge = this.bulgeEffect();
        if (bulge) ctx.beginForegroundDistortion(bulge, w, h);

        this.renderSelf(ctx);
        // Confine children to this shape's outline. Built once from clipSelf();
        // skipped when the shape has no outline (clipped === false) so the
        // endClip() below stays balanced.
        const clipped = this.clip && this.applyClip(ctx);
        this.renderChildren(ctx);
        if (clipped) ctx.endClip();

        if (bulge) ctx.endForegroundDistortion();
        if (posterize) ctx.endPosterize();
    }

    *fillTo(to: ChainableFill, duration: number, options?: TweenOptions<FillResolved[]>): FrameGenerator {
        if (options?.delay) yield* wait(options.delay);
        const from = this.fill;
        const target = resolveFillArray(to);
        const lerp = options?.lerp ?? lerpFillArray;
        const ease = options?.ease;
        yield* tween(duration, t => {
            this.set({ fill: lerp(from, target, ease ? ease(t) : t) } as Partial<P>);
        });
    }

    *strokeTo(to: StrokeProp | StrokeProp[], duration: number, options?: TweenOptions<StrokeResolved[]>): FrameGenerator {
        if (options?.delay) yield* wait(options.delay);
        const from = this.stroke;
        const target = resolveStrokeArray(to, from);
        const lerp = options?.lerp ?? lerpStrokeArray;
        const ease = options?.ease;
        yield* tween(duration, t => {
            this.set({ stroke: lerp(from, target, ease ? ease(t) : t) } as Partial<P>);
        });
    }

    *shadowTo(to: ShadowProp | ShadowProp[], duration: number, options?: TweenOptions<ShadowResolved[]>): FrameGenerator {
        if (options?.delay) yield* wait(options.delay);
        const from = this.shadow;
        const target = resolveShadowArray(to, from);
        const lerp = options?.lerp ?? lerpShadowArray;
        const ease = options?.ease;
        yield* tween(duration, t => {
            this.set({ shadow: lerp(from, target, ease ? ease(t) : t) } as Partial<P>);
        });
    }
}
