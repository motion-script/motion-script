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

    // ---- Drawing memo ------------------------------------------------------
    //
    // A static scene rebuilds an identical answer every frame: at 1200 rects that
    // is 1200 `Graphics` and 3600 ops per frame describing a picture that has not
    // moved (see `playback-profile.bench.test.ts`). The composed result is cached
    // instead, keyed on the node's dirty generation — which `Signal` bumps through
    // `Node.markDirty` whenever any prop, any binding, or the layout rect goes
    // stale, including a prop bound to *another* node's signal.
    //
    // The cache holds the **composed** graphics (silhouette + shadow + fill),
    // not the bare silhouette. That is deliberate: `.fill()`, `.stroke()` and
    // `.shadow()` push onto `_ops` and return `this`, so a shared silhouette
    // handed to all three hooks would accumulate paint ops across passes and
    // across frames. Each hook therefore owns its own composed instance and never
    // mutates a shared one.
    //
    // Handing the same instance back repeatedly is safe because nothing
    // downstream mutates it: `RenderContext.draw` folds in text defaults through
    // `Graphics._withOps`, which copies rather than rewrites.

    /**
     * Whether this instance's class is memoizable, resolved once.
     *
     * The check itself is a `Set` lookup keyed on a constructor, and this runs
     * three times per node per frame — at a thousand nodes that is measurable on
     * exactly the scene where the memo never pays off anyway (everything moving).
     * `??=` leaves a resolved `false` alone, since `false` is not nullish.
     */
    private _memoizable: boolean | undefined;

    private _memoGen = -1;
    private _memoSelf: Graphics | null = null;
    private _memoOverlay: Graphics | null = null;
    private _memoStroke: Graphics | null = null;

    /**
     * Classes whose drawing is a pure function of their own props.
     *
     * Registered by exact constructor, never by `instanceof`, and that is the
     * point: a subclass overriding {@link shapeGraphics} may read anything at all
     * — `clock.elapsed`, the velocity `sampleMotion` writes each frame, a random
     * draw — and none of that marks a signal, so none of it can be detected. If
     * membership were inherited, every third-party node built on `Rect` would
     * silently freeze. Missing from this set means "rebuild every frame", which is
     * merely the old behaviour; wrongly in it means a node that stops updating.
     *
     * A subclass that knows it is safe can opt in by registering itself.
     */
    private static readonly MEMOIZABLE = new Set<Function>();

    /** Declare `ctor`'s drawing a pure function of its own props. See {@link MEMOIZABLE}. */
    /** @internal */
    static memoizeDrawing(ctor: Function): void {
        ShapeNode.MEMOIZABLE.add(ctor);
    }

    /** The composed graphics for one hook, rebuilt only when this node changed. */
    private memoized(
        slot: "self" | "overlay" | "stroke",
        build: () => Graphics | null,
    ): Graphics | null {
        this._memoizable ??= ShapeNode.MEMOIZABLE.has(this.constructor);
        if (!this._memoizable) return build();

        const gen = this.dirtyGeneration;
        if (this._memoGen !== gen) {
            this._memoGen = gen;
            this._memoSelf = null;
            this._memoOverlay = null;
            this._memoStroke = null;
        }
        if (slot === "self") return (this._memoSelf ??= build());
        if (slot === "overlay") return (this._memoOverlay ??= build());
        return (this._memoStroke ??= build());
    }

    /**
     * Shadow + fill of the node's own silhouette.
     *
     * Hoisted here from the eight geometry subclasses that each had this exact
     * body, so the memo has one place to live rather than eight. A subclass whose
     * paint differs (`Path`, `Image`, `Video`) still overrides it.
     */
    protected override renderSelf(ctx: RenderContext): void {
        const g = this.memoized("self", () => {
            const base = this.shapeGraphics();
            return base ? base.shadow(this.shadow).fill(this.fill) : null;
        });
        if (g) ctx.draw(g);
    }

    // Overlay over fill + children, under stroke. Painted as a fill of the
    // node's silhouette, so it's clipped to the outline exactly like `fill`.
    protected override renderOverlay(ctx: RenderContext): void {
        const overlay = this.overlay as FillResolved[];
        if (overlay.length === 0) return;
        const g = this.memoized("overlay", () => {
            const base = this.shapeGraphics();
            return base ? base.fill(overlay) : null;
        });
        if (g) ctx.draw(g);
    }

    // Deferred stroke, painted last so it frames the children + overlay.
    protected override renderStroke(ctx: RenderContext): void {
        const stroke = this.stroke as StrokeResolved[];
        if (stroke.length === 0) return;
        const g = this.memoized("stroke", () => {
            const base = this.shapeGraphics();
            return base ? base.stroke(stroke) : null;
        });
        if (g) ctx.draw(g);
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
