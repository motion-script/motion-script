import { resolveFillArray, lerpFillArray, updateFill, prepareFill, hasDynamicFill } from "@/attributes/shape/fill/registry";

import { lerpStrokeArray } from "@/attributes/shape/stroke/lerp";
import { lerpShadowArray } from "@/attributes/shape/shadow/lerp";
import { resolveStrokeArray, StrokeResolved, type Stroke } from "@/attributes/shape/stroke/mapper";
import { resolveShadowArray, ShadowResolved, type Shadow } from "@/attributes/shape/shadow/resolver";
import { FillResolved } from "@/attributes/shape/fill/union";
import { Fill } from "@/attributes/shape/fill/chain";

import { RenderContext } from "@/render/render-context";
import { AssetTracker } from "@/assets/tracker";
import { property } from "@/attributes/properties/decorator";
import { Node, NodeConfig, NodeProps } from "../base/node";
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
     * Stroke layer(s): a single {@link StrokeProp}, an array of them, or an
     * already-resolved stroke. `fill` inside each stroke accepts the same loose
     * values as the top-level fill prop.
     */
    stroke?: Stroke;
    /**
     * Shadow layer(s): a single {@link ShadowProp}, an array of them, or an
     * already-resolved shadow. `fill` inside each shadow accepts the same loose
     * values as the top-level fill prop.
     */
    shadow?: Shadow;
    start?: number;
    end?: number;
}


export abstract class ShapeNode<P extends ShapeProps> extends Node<P> {

    // Author-facing paint props. The declared type is the loose `Fill`/`Stroke`/
    // `Shadow` so assignment (`this.fill = 'red'`) and reads share one simple
    // type. At runtime the @property accessor stores the *resolved* value (via
    // the mapper), and consumers that need the resolved shape cast at the read
    // site — see `tick`/`prepare`/`*To` and the `Graphics` paint calls.
    // Stroke weight feeds Rect.effectivePadding(), which insets children.
    @property({ default: [], mapper: resolveFillArray, tween: lerpFillArray })
    declare fill: Fill;

    @property({ default: [], mapper: resolveStrokeArray, tween: lerpStrokeArray })
    declare stroke: Stroke;

    @property({ default: [], mapper: resolveShadowArray, tween: lerpShadowArray })
    declare shadow: Shadow;

    @property({ default: 0 })
    declare start: number;

    @property({ default: 1 })
    declare end: number;

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

    protected override reinitProps(force = false): void {
        // Recreating disposed signals needs a fresh subscription; a forced reset
        // of live signals already has one, so don't double-subscribe.
        const recreating = !this.__signals;
        if (this.__signals && !force) return;
        super.reinitProps(force);
        if (recreating) this.watchFillForDynamic();
    }

    public tick(time: number): void {
        if (!this._hasDynamicFill) return;
        const fills = this.fill as FillResolved[];
        this.set({ fill: fills.map(fill => updateFill(fill, time, this.assets)) } as Partial<P>);
    }

    prepareRender(tracker: AssetTracker): void {
        super.prepareRender(tracker);
        [
            ...(this.fill as FillResolved[]),
            ...(this.stroke as StrokeResolved[]).flatMap(s => s.fill),
            ...(this.shadow as ShadowResolved[]).flatMap(s => s.fill),
        ].forEach(fill => prepareFill(fill, tracker, this.layoutRect.width, this.layoutRect.height));
    }

    protected abstract override renderSelf(ctx: RenderContext): void;

    *fillTo(to: Fill, duration: number, options?: TweenOptions<FillResolved[]>): FrameGenerator {
        if (options?.delay) yield* wait(options.delay);
        const from = this.fill as FillResolved[];
        const target = resolveFillArray(to);
        const lerp = options?.lerp ?? lerpFillArray;
        const ease = options?.ease;
        yield* tween(duration, t => {
            this.set({ fill: lerp(from, target, ease ? ease(t) : t) } as Partial<P>);
        });
    }

    *strokeTo(to: Stroke, duration: number, options?: TweenOptions<StrokeResolved[]>): FrameGenerator {
        if (options?.delay) yield* wait(options.delay);
        const from = this.stroke as StrokeResolved[];
        const target = resolveStrokeArray(to, from);
        const lerp = options?.lerp ?? lerpStrokeArray;
        const ease = options?.ease;
        yield* tween(duration, t => {
            this.set({ stroke: lerp(from, target, ease ? ease(t) : t) } as Partial<P>);
        });
    }

    *shadowTo(to: Shadow, duration: number, options?: TweenOptions<ShadowResolved[]>): FrameGenerator {
        if (options?.delay) yield* wait(options.delay);
        const from = this.shadow as ShadowResolved[];
        const target = resolveShadowArray(to, from);
        const lerp = options?.lerp ?? lerpShadowArray;
        const ease = options?.ease;
        yield* tween(duration, t => {
            this.set({ shadow: lerp(from, target, ease ? ease(t) : t) } as Partial<P>);
        });
    }
}
