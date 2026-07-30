import { resolveFillArray, lerpFillArray, updateFill, hasDynamicFill } from "@/attributes/shape/fill/registry";

import { lerpStrokeArray } from "@/attributes/shape/stroke/lerp";
import { lerpShadowArray } from "@/attributes/shape/shadow/lerp";
import { resolveStrokeArray, StrokeResolved, type Stroke } from "@/attributes/shape/stroke/mapper";
import { resolveShadowArray, ShadowResolved, type Shadow } from "@/attributes/shape/shadow/resolver";
import { fillProperty, shadowProperty, strokeProperty } from "@/attributes/properties/typed";
import { FillResolved } from "@/attributes/shape/fill/union";
import { Fill } from "@/attributes/shape/fill/chain";

import { RenderContext } from "@/render/render-context";
import { Graphics } from "@/render/graphics";
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
     * Overlay layer(s) — the same loose values as {@link fill}, but painted
     * *over* this node's fill **and** its children (clipped to the node's
     * silhouette) while still sitting **under** the stroke. Use for textures
     * laid across the whole subtree, e.g. a VHS-grain image or video.
     */
    overlay?: Fill;
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
    @fillProperty()
    declare fill: Fill;

    // Same paint type/mapper/tween as `fill`; differs only in draw order —
    // painted over fill + children and under the stroke (see renderOverlay).
    @fillProperty()
    declare overlay: Fill;

    @strokeProperty()
    declare stroke: Stroke;

    @shadowProperty()
    declare shadow: Shadow;

    @property({ default: 0 })
    declare start: number;

    @property({ default: 1 })
    declare end: number;

    // Cached: does any current fill / overlay need a per-frame update() (e.g.
    // video)? Static fills (solid, gradients, noise, image) have an identity
    // update, so there's nothing to recompute each frame and tick() can skip.
    private _hasDynamicFill = false;
    private _hasDynamicOverlay = false;

    constructor(props: NodeConfig<any, P>) {
        super(props);
        this.watchFillForDynamic();
    }

    // Track whether the current fill / overlay needs per-frame updates. Re-run
    // after the signals are re-created (reinitProps) so a reused scene root keeps
    // a live subscription rather than a stale one pointing at a disposed cell.
    private watchFillForDynamic(): void {
        const watch = (key: "fill" | "overlay", set: (dynamic: boolean) => void) => {
            const cell = this.__signals?.get(key);
            if (!cell) return;
            const refresh = () => set(hasDynamicFill(cell.get() as FillResolved[]));
            refresh();
            cell.subscribe(refresh);
        };
        watch("fill", d => { this._hasDynamicFill = d; });
        watch("overlay", d => { this._hasDynamicOverlay = d; });
    }



    public tick(time: number): void {
        if (!this._hasDynamicFill && !this._hasDynamicOverlay) return;
        const patch: Partial<P> = {};
        if (this._hasDynamicFill) {
            const fills = this.fill as FillResolved[];
            (patch as { fill?: FillResolved[] }).fill = fills.map(fill => updateFill(fill, time, this.assets));
        }
        if (this._hasDynamicOverlay) {
            const overlays = this.overlay as FillResolved[];
            (patch as { overlay?: FillResolved[] }).overlay = overlays.map(fill => updateFill(fill, time, this.assets));
        }
        this.set(patch);
    }

    protected abstract override renderSelf(ctx: RenderContext): void;

    /**
     * The node's bare silhouette as a {@link Graphics} with **no** paint ops.
     * `renderSelf` appends shadow + fill; {@link renderOverlay} appends the
     * overlay fill; {@link renderStroke} appends the stroke. Sharing one builder
     * keeps each shape's geometry defined in a single place.
     *
     * Returns `null` for nodes that have no single fillable silhouette (text,
     * boolean groups, grids) — those override the paint hooks themselves or opt
     * out of the generic overlay/stroke passes.
     */
    protected shapeGraphics(): Graphics | null {
        return null;
    }

    // Overlay over fill + children, under stroke. Painted as a fill of the
    // node's silhouette, so it's clipped to the outline exactly like `fill`.
    protected override renderOverlay(ctx: RenderContext): void {
        const overlay = this.overlay as FillResolved[];
        if (overlay.length === 0) return;
        const g = this.shapeGraphics();
        if (g) ctx.draw(g.fill(overlay));
    }

    // Deferred stroke, painted last so it frames the children + overlay.
    protected override renderStroke(ctx: RenderContext): void {
        const stroke = this.stroke as StrokeResolved[];
        if (stroke.length === 0) return;
        const g = this.shapeGraphics();
        if (g) ctx.draw(g.stroke(stroke));
    }

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

    *overlayTo(to: Fill, duration: number, options?: TweenOptions<FillResolved[]>): FrameGenerator {
        if (options?.delay) yield* wait(options.delay);
        const from = this.overlay as FillResolved[];
        const target = resolveFillArray(to);
        const lerp = options?.lerp ?? lerpFillArray;
        const ease = options?.ease;
        yield* tween(duration, t => {
            this.set({ overlay: lerp(from, target, ease ? ease(t) : t) } as Partial<P>);
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
