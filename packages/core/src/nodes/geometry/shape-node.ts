import { resolveFillArray, lerpFillArray, updateFill, prepareFill, hasDynamicFill } from "@/attributes/shape/fill/registry";

import { lerpStrokeArray } from "@/attributes/shape/stroke/lerp";
import { lerpShadowArray } from "@/attributes/shape/shadow/lerp";
import { resolveStrokeArray, StrokeResolved, type StrokeProp } from "@/attributes/shape/stroke/mapper";
import { resolveShadowArray, ShadowResolved, type ShadowProp } from "@/attributes/shape/shadow/resolver";
import { FillResolved } from "@/attributes/shape/fill/union";
import { Fill } from "@/attributes/shape/fill/chain";

import { RenderContext } from "@/render/render-context";
import { Clip } from "@/render/clip";
import { AssetTracker } from "@/assets/tracker";
import { property } from "@/attributes/properties/decorator";
import { Node, NodeConfig, NodeProps } from "../base/node";
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
     * - A {@link FillChain} from the `Fills` builder (e.g. `Fills.color('red')`)
     */
    fill?: Fill;
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

    // Asymmetric accessor: reads yield the resolved internal value
    // (`FillResolved[]`, what the renderer and `fillTo`/`tick`/`prepare` consume),
    // while writes accept the loose author-facing `Fill` (strings, props, chains,
    // or already-resolved fills) — `this.fill = 'red'`. The real runtime accessor
    // is installed per-instance by @property's `Object.defineProperty`, which
    // shadows this prototype pair, so these stub bodies never execute.
    @property({ default: [], mapper: resolveFillArray, tween: lerpFillArray })
    get fill(): FillResolved[] { return undefined!; }
    set fill(_value: Fill) { /* installed by @property */ }

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
     * Does `effect` target the backdrop (the content painted beneath this node)
     * rather than the node's own content? `magnify` and backdrop-mode `sksl`
     * always do; everything else opts in via the `backdrop` flag (the filter
     * effects and posterize). The renderer decides per effect whether to express
     * it as an ImageFilter or a shader — callers only pick the target.
     */
    private static isBackdropEffect(effect: SceneEffect): boolean {
        if (effect.type === "magnify") return true;
        if (effect.type === "sksl") return effect.mode === "backdrop";
        return "backdrop" in effect && effect.backdrop === true;
    }

    /**
     * Apply backdrop effects (any `backdrop`-flagged filter effect — blur,
     * grayscale, …; plus magnify and backdrop SkSL) beneath this shape, clipped
     * to its silhouette, before the shape's own fill/stroke are drawn — so the
     * content underneath is filtered/warped while the shape's own edges stay
     * sharp. One backdrop effect scope, confined to the silhouette clip, runs the
     * lot; the renderer routes each effect to a filter or shader pass.
     */
    private applyBackdropEffects(ctx: RenderContext): void {
        const backdropEffects = this.effects.filter(ShapeNode.isBackdropEffect);
        if (backdropEffects.length === 0) return;

        const clip = this.clipSelf();
        if (!clip || clip.isEmpty()) return;

        const w = this.layoutRect?.width ?? 0;
        const h = this.layoutRect?.height ?? 0;

        // Clip to the silhouette first so the backdrop passes are confined to the
        // shape; the renderer opens its backdrop layers within that clip.
        ctx.beginClip(clip);
        ctx.beginEffectScope(backdropEffects, "backdrop", w, h);
        ctx.endEffectScope();
        ctx.endClip();
    }

    /**
     * Effects that warp/band this node's *own* content (self + children), in the
     * order they should compose: posterize wraps bulge, so it comes first and the
     * renderer applies bulge inside it (mirroring how blur-style content effects
     * nest). `backdrop`-flagged posterize bands the backdrop instead (see
     * {@link applyBackdropEffects}), so it's excluded here.
     */
    private foregroundEffects(): SceneEffect[] {
        const posterize = this.effects.find((e) => e.type === "posterize" && e.backdrop !== true);
        const bulge = this.effects.find((e) => e.type === "bulge");
        const out: SceneEffect[] = [];
        if (posterize) out.push(posterize);
        if (bulge) out.push(bulge);
        return out;
    }

    onRender(ctx: RenderContext): void {
        this.applyTransform(ctx);
        this.applyBackdropEffects(ctx);

        const w = this.layoutRect?.width ?? 0;
        const h = this.layoutRect?.height ?? 0;

        // Capture everything this node paints — its fill/stroke and its children —
        // so the foreground effects (posterize wrapping bulge) warp/band the lot,
        // mirroring how blur-style content effects compose.
        const foreground = this.foregroundEffects();
        const hasForeground = foreground.length > 0;
        if (hasForeground) ctx.beginEffectScope(foreground, "foreground", w, h);

        this.renderSelf(ctx);
        // Confine children to this shape's outline. Built once from clipSelf();
        // skipped when the shape has no outline (clipped === false) so the
        // endClip() below stays balanced.
        const clipped = this.clip && this.applyClip(ctx);
        this.renderChildren(ctx);
        if (clipped) ctx.endClip();

        if (hasForeground) ctx.endEffectScope();
    }

    *fillTo(to: Fill, duration: number, options?: TweenOptions<FillResolved[]>): FrameGenerator {
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
