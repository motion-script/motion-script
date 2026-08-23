import { resolveFillArray, lerpFillArray, prepareFill } from "@/attributes/shape/fill/registry";
import { AssetTracker } from "@/assets/tracker";

import { lerpStrokeArray } from "@/attributes/shape/stroke/lerp";
import { lerpShadowArray } from "@/attributes/shape/shadow/lerp";
import { resolveStrokeArray, StrokeResolved, type Stroke } from "@/attributes/shape/stroke/mapper";
import { resolveShadowArray, ShadowResolved, type Shadow } from "@/attributes/shape/shadow/resolver";
import { fillProperty, shadowProperty, strokeProperty } from "@/attributes/properties/typed";
import { FillResolved } from "@/attributes/shape/fill/union";
import { Fill } from "@/attributes/shape/fill/chain";

import { RenderContext2D } from "@/render/render-context2d";
import { Graphics2D } from "@/render/graphics2d";
import { containsClip } from "@/render/clip-contains";
import { Vector2 } from "@/attributes/layout/vector2";
import { property } from "@/attributes/properties/decorator";
import { Node2D, Node2DProps } from "../base/node2d";
import { TweenOptions } from "@/tween/lerp";
import { commandSequence, type Command } from "@/tween/command";
import { command } from "@/tween/command-decorator";


export interface ShapeProps extends Node2DProps {
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


export abstract class ShapeNode<P extends ShapeProps = ShapeProps> extends Node2D<P> {

    // Author-facing paint props. The declared type is the loose `Fill`/`Stroke`/
    // `Shadow` so assignment (`this.fill = 'red'`) and reads share one simple
    // type. At runtime the @property accessor stores the *resolved* value (via
    // the mapper), and consumers that need the resolved shape cast at the read
    // site — see `tick`/`prepare`/`*To` and the `Graphics2D` paint calls.
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
    // accepted (stroke, shadow, a custom node's raw `Graphics2D`) rather than only
    // on the nodes that remembered to advance it from tick().

    // No longer abstract: `renderSelf` below paints the silhouette that
    // `shapeGraphics` describes, which is what every geometry subclass did
    // identically. A subclass with no single fillable silhouette returns `null`
    // from `shapeGraphics` and simply draws nothing here — the fallback that
    // method already documents — while `Text`, `Image` and `Video` override the
    // paint themselves.

    /**
     * The node's bare silhouette as a {@link Graphics2D} with **no** paint ops.
     * `renderSelf` appends shadow + fill; {@link renderOverlay} appends the
     * overlay fill; {@link renderStroke} appends the stroke. Sharing one builder
     * keeps each shape's geometry defined in a single place.
     *
     * Returns `null` for nodes that have no single fillable silhouette (text,
     * boolean groups, grids) — those override the paint hooks themselves or opt
     * out of the generic overlay/stroke passes.
     */
    protected shapeGraphics(): Graphics2D | null {
        return null;
    }

    /**
     * Shadow + fill of the node's own silhouette.
     *
     * Hoisted here from the eight geometry subclasses that each had this exact
     * body. A subclass whose paint differs (`Path`, `Image`, `Video`) still
     * overrides it.
     *
     * Each hook composes its own `Graphics2D` rather than sharing one built once:
     * `.fill()`, `.stroke()` and `.shadow()` push onto `_ops` and return `this`,
     * so a single silhouette handed to all three would accumulate paint ops
     * across passes.
     */
    protected override renderSelf(ctx: RenderContext2D): void {
        const base = this.shapeGraphics();
        if (base) ctx.draw(base.shadow(this.shadow).fill(this.fill));
    }

    // Overlay over fill + children, under stroke. Painted as a fill of the
    // node's silhouette, so it's clipped to the outline exactly like `fill`.
    protected override renderOverlay(ctx: RenderContext2D): void {
        const overlay = this.overlay as FillResolved[];
        if (overlay.length === 0) return;
        const base = this.shapeGraphics();
        if (base) ctx.draw(base.fill(overlay));
    }

    // Deferred stroke, painted last so it frames the children + overlay.
    protected override renderStroke(ctx: RenderContext2D): void {
        const stroke = this.stroke as StrokeResolved[];
        if (stroke.length === 0) return;
        const base = this.shapeGraphics();
        if (base) ctx.draw(base.stroke(stroke));
    }

    /**
     * Declare the assets of the four paint slots this class owns.
     *
     * This is why almost no shape has to write a `prepareRender` of its own: the
     * three render hooks above paint `fill`, `overlay`, `stroke` and `shadow`, all
     * four are already **resolved** arrays on `this` (the `@property` mapper does
     * that on write), and `prepareFill` takes a tracker rather than a render
     * context — so what they reference can be read off the node directly instead
     * of being discovered by drawing it.
     *
     * Sized from `layoutRect`, which is live by the time this runs, so an image
     * decodes at the size it will actually be painted at.
     *
     * A subclass that paints something *outside* these four slots — `Image` and
     * `Video` prepend a fill of their own, `Path` and the grids build a raw
     * `Graphics2D` — overrides this and calls `super` first.
     */
    override prepareRender(tracker: AssetTracker): void {
        super.prepareRender(tracker);
        const rect = this.layoutRect;
        const width = rect?.width ?? 0;
        const height = rect?.height ?? 0;

        for (const fill of this.fill as FillResolved[]) prepareFill(fill, tracker, width, height);
        for (const fill of this.overlay as FillResolved[]) prepareFill(fill, tracker, width, height);
        for (const stroke of this.stroke as StrokeResolved[]) {
            for (const fill of stroke.fill) prepareFill(fill, tracker, width, height);
        }
        for (const shadow of this.shadow as ShadowResolved[]) {
            for (const fill of shadow.fill) prepareFill(fill, tracker, width, height);
        }
    }

    /**
     * Shapes hit on their outline, not their box: a click in the empty corner of
     * a star's bounding box should fall through to whatever is behind it. The
     * outline is the very one this node already declares for clipping
     * ({@link Node2D.clipSelf}), so what is grabbable and what is drawn can never
     * drift. Shapes that declare no outline (Text, RichText, Path) keep the base
     * box test, which is what selection should do for them anyway.
     */
    protected override hitTestSelf(local: Vector2, tolerance: number): boolean {
        const clip = this.clipSelf();
        if (!clip || clip.isEmpty()) return super.hitTestSelf(local, tolerance);
        return containsClip(clip, local, tolerance);
    }

    // ---- Paint commands ---------------------------------------------------
    //
    // These four are the shape a `Command` exists for: a paint has no in-between
    // a numeric tween could find, so each is a `t → props` function the node
    // supplies. They used to be generators over `tween(...)`, which ran fine and
    // could not be asked what they looked like at a time. Same body, returned as
    // a value.

    @command()
    fillTo(to: Fill, duration: number, options?: TweenOptions<FillResolved[]>): Command<P> {
        const from = this.fill as FillResolved[];
        const target = resolveFillArray(to);
        const lerp = options?.lerp ?? lerpFillArray;
        return this.delayed(
            options?.delay,
            this.animate<P>(t => ({ fill: lerp(from, target, t) }) as Partial<P>, duration, options?.ease),
        );
    }

    @command()
    overlayTo(to: Fill, duration: number, options?: TweenOptions<FillResolved[]>): Command<P> {
        const from = this.overlay as FillResolved[];
        const target = resolveFillArray(to);
        const lerp = options?.lerp ?? lerpFillArray;
        return this.delayed(
            options?.delay,
            this.animate<P>(t => ({ overlay: lerp(from, target, t) }) as Partial<P>, duration, options?.ease),
        );
    }

    @command()
    strokeTo(to: Stroke, duration: number, options?: TweenOptions<StrokeResolved[]>): Command<P> {
        const from = this.stroke as StrokeResolved[];
        const target = resolveStrokeArray(to, from);
        const lerp = options?.lerp ?? lerpStrokeArray;
        return this.delayed(
            options?.delay,
            this.animate<P>(t => ({ stroke: lerp(from, target, t) }) as Partial<P>, duration, options?.ease),
        );
    }

    @command()
    shadowTo(to: Shadow, duration: number, options?: TweenOptions<ShadowResolved[]>): Command<P> {
        const from = this.shadow as ShadowResolved[];
        const target = resolveShadowArray(to, from);
        const lerp = options?.lerp ?? lerpShadowArray;
        return this.delayed(
            options?.delay,
            this.animate<P>(t => ({ shadow: lerp(from, target, t) }) as Partial<P>, duration, options?.ease),
        );
    }

    /**
     * Prefix `command` with `delay` seconds of holding still.
     *
     * The hold is a command of its own that writes nothing, so the pair composes
     * into one seekable value — where the generator version reached the delay by
     * `yield* wait(...)`, which is only expressible by running it.
     */
    private delayed(delay: number | undefined, command: Command<P>): Command<P> {
        if (!delay) return command;
        return commandSequence<P>(this, this.animate<P>(() => ({}), delay), command);
    }
}
