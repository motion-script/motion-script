import { resolveFillArray, lerpFillArray } from "@/attributes/shape/fill/registry";

import { lerpStrokeArray } from "@/attributes/shape/stroke/lerp";
import { lerpShadowArray } from "@/attributes/shape/shadow/lerp";
import { resolveStrokeArray, StrokeResolved, type Stroke } from "@/attributes/shape/stroke/mapper";
import { resolveShadowArray, ShadowResolved, type Shadow } from "@/attributes/shape/shadow/resolver";
import { fillProperty, shadowProperty, strokeProperty } from "@/attributes/properties/typed";
import { FillResolved } from "@/attributes/shape/fill/union";
import { Fill } from "@/attributes/shape/fill/chain";

import { RenderContext } from "@/render/render-context";
import { Graphics } from "@/render/graphics";
import { containsClip } from "@/render/clip-contains";
import { Vector2 } from "@/attributes/layout/vector2";
import { property } from "@/attributes/properties/decorator";
import { Node, NodeProps } from "../base/node";
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


export abstract class ShapeNode<P extends ShapeProps = ShapeProps> extends Node<P> {

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

    // No per-frame fill bookkeeping: a time-dependent fill (video) resolves its
    // own timestamp as it paints, from the node's clock — see
    // `resolveVideoTimestamp`. That is what lets one live anywhere paint is
    // accepted (stroke, shadow, a custom node's raw `Graphics`) rather than only
    // on the nodes that remembered to advance it from tick().

    // No longer abstract: `renderSelf` below paints the silhouette that
    // `shapeGraphics` describes, which is what every geometry subclass did
    // identically. A subclass with no single fillable silhouette returns `null`
    // from `shapeGraphics` and simply draws nothing here — the fallback that
    // method already documents — while `Text`, `Image` and `Video` override the
    // paint themselves.

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

    /**
     * Shadow + fill of the node's own silhouette.
     *
     * Hoisted here from the eight geometry subclasses that each had this exact
     * body. A subclass whose paint differs (`Path`, `Image`, `Video`) still
     * overrides it.
     *
     * Each hook composes its own `Graphics` rather than sharing one built once:
     * `.fill()`, `.stroke()` and `.shadow()` push onto `_ops` and return `this`,
     * so a single silhouette handed to all three would accumulate paint ops
     * across passes.
     */
    protected override renderSelf(ctx: RenderContext): void {
        const base = this.shapeGraphics();
        if (base) ctx.draw(base.shadow(this.shadow).fill(this.fill));
    }

    // Overlay over fill + children, under stroke. Painted as a fill of the
    // node's silhouette, so it's clipped to the outline exactly like `fill`.
    protected override renderOverlay(ctx: RenderContext): void {
        const overlay = this.overlay as FillResolved[];
        if (overlay.length === 0) return;
        const base = this.shapeGraphics();
        if (base) ctx.draw(base.fill(overlay));
    }

    // Deferred stroke, painted last so it frames the children + overlay.
    protected override renderStroke(ctx: RenderContext): void {
        const stroke = this.stroke as StrokeResolved[];
        if (stroke.length === 0) return;
        const base = this.shapeGraphics();
        if (base) ctx.draw(base.stroke(stroke));
    }

    /**
     * Shapes hit on their outline, not their box: a click in the empty corner of
     * a star's bounding box should fall through to whatever is behind it. The
     * outline is the very one this node already declares for clipping
     * ({@link Node.clipSelf}), so what is grabbable and what is drawn can never
     * drift. Shapes that declare no outline (Text, RichText, Path) keep the base
     * box test, which is what selection should do for them anyway.
     */
    protected override hitTestSelf(local: Vector2, tolerance: number): boolean {
        const clip = this.clipSelf();
        if (!clip || clip.isEmpty()) return super.hitTestSelf(local, tolerance);
        return containsClip(clip, local, tolerance);
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
