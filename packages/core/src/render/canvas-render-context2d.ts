import { Graphics2D } from "./graphics2d";
import type { Clip } from "./clip";
import type { TransformState } from "./descriptors/transform";
import type { FontStyle } from "@/attributes/text/span";
import type { Size2D } from "@/attributes/layout/size";
import type { Vector2 } from "@/attributes/layout/vector2";
import type { MaskOptions } from "@/attributes/mask/mask";
import type { BooleanOperation } from "@/attributes/mask/boolean";
import { TextState } from "./descriptors/text";
import { TextBlockLayout } from "./text-layout";
import { EMPTY_TEXT_STYLE, TEXT_STYLE_KEYS, themeDefaultTextStyle, type TextStyle } from "@/runtime/builtin-context";
import { applyGraphicsTextDefaults } from "./text-defaults";
import type { NodeRenderState, RasterizedSurface, RenderContext2D, RenderPass2D, SpaceRects, EffectTarget } from "./render-context2d";
import type { SceneEffect } from "@/attributes/shape/effects/union";

/**
 * The base every {@link RenderContext2D} backend extends.
 *
 * It owns the parts of a render context that are the *same* whatever is being
 * rasterized — the text-default stack, the node scope stack, disposal — plus
 * the host-facing half of the surface (`execute`, `screenshot`, `unmount`),
 * which the {@link RenderContext2D} interface deliberately leaves out because a
 * node has no business driving a render pass from inside one.
 *
 * **`draw` is final by convention.** It resolves the ambient text defaults onto
 * the op list and hands the result to {@link drawGraphics}, which is where a
 * backend does its actual drawing. Owning that step here rather than in each
 * backend is what keeps the real renderer and the precomp asset walk agreeing
 * on which font an under-specified `text` op shapes with: a family that one
 * resolves and the other does not is a font that never loads and glyphs that
 * never paint.
 */
export abstract class CanvasRenderContext2D implements RenderPass2D {
    abstract measureText(text: string, fontSize: number, fontFamily: string, fontWeight?: number, letterSpacing?: number, fontStyle?: FontStyle): Size2D;

    // ---- Inherited text-style defaults ------------------------------------
    // `<DefaultTextStyle>` reaches a `Text`/`RichText` node through the context
    // map, applied once when the node binds. A raw `Graphics2D` has no node to
    // bind, so it inherits the same defaults here instead — pushed around a
    // subtree's draw scope, and folded into each `text`/`richText` op by
    // `draw()`. Same vocabulary (`TextStyle`), same precedence, two channels.

    /**
     * Defaults in effect for the current draw scope, innermost last. Each entry
     * is **already merged** onto the one below it (see {@link pushTextStyle}), so
     * the top of the stack is the effective style and reading it costs nothing.
     */
    private readonly textStyleStack: TextStyle[] = [];

    /** See {@link RenderContext2D.pushTextStyle}. */
    pushTextStyle(style: TextStyle | null): void {
        if (style === null) {
            this.textStyleStack.push(EMPTY_TEXT_STYLE);
            return;
        }
        const merged: Record<string, unknown> = { ...this.defaultTextStyle };
        for (const key of TEXT_STYLE_KEYS) {
            const value = style[key];
            if (value !== undefined) merged[key] = value;
        }
        this.textStyleStack.push(merged as TextStyle);
    }

    /** Close the innermost scope opened by {@link pushTextStyle}. */
    popTextStyle(): void {
        this.textStyleStack.pop();
    }

    /**
     * The text-style defaults in effect right now — the innermost
     * {@link pushTextStyle} scope, or the project's `theme.typography.default`
     * when no scope is open.
     *
     * Carries all ten {@link TEXT_STYLE_KEYS}, but only the shaping ones reach a
     * `Graphics2D` op; see `TEXT_SHAPING_KEYS` for why `fill`/`stroke`/`shadow`
     * stay a node-level concern.
     */
    get defaultTextStyle(): TextStyle {
        return this.textStyleStack[this.textStyleStack.length - 1] ?? themeDefaultTextStyle();
    }

    /** See {@link RenderContext2D.draw}. Final by convention — override {@link drawGraphics}. */
    draw(graphics: Graphics2D): void {
        this.drawGraphics(applyGraphicsTextDefaults(graphics, this.defaultTextStyle));
    }

    /** Paint a `Graphics2D` whose text ops have already been resolved against the
     *  ambient defaults. Backends implement this instead of {@link draw}. */
    protected abstract drawGraphics(graphics: Graphics2D): void;

    /**
     * See {@link RenderContext2D.layoutTextBlock}. Concrete rather than abstract,
     * and `null` by default, so a backend that has no need to report glyph
     * positions is unaffected — the only thing it gives up is on-canvas text
     * editing in a host built on it.
     */
    layoutTextBlock(state: Partial<TextState>): TextBlockLayout | null {
        return null;
    }

    /** Stack of node ids currently being drawn, innermost last. */
    protected currentNodeStack: string[] = [];

    /** Returns the id of the innermost node currently being drawn. */
    protected currentNodeId(): string {
        if (this.currentNodeStack.length === 0) {
            throw new Error("No current node in context");
        }

        return this.currentNodeStack[this.currentNodeStack.length - 1];
    }

    /** Remove all renderer-side resources for the current node (called on unmount). */
    abstract unmount(): void;

    private _disposed = false;
    /** `true` after `dispose()` — the context must not be used after this point. */
    isDisposed(): boolean {
        return this._disposed;
    }
    dispose(): void {
        this._disposed = true;
    }

    /**
     * Execute `callback`, which issues shape/paint calls, and flush the result
     * to the underlying render target (canvas, SVG document, etc.).
     */
    abstract execute(callback: () => void): void;
    /** Capture the current frame as a base-64 PNG data URL, or `undefined` if unsupported. */
    abstract screenshot(): string | undefined;

    abstract transform(state: Partial<TransformState>): RenderContext2D;

    abstract beginBoolean(op: BooleanOperation): void;
    abstract endBoolean(): void;

    abstract beginMask(options?: MaskOptions): void;
    abstract applyMask(): void;
    abstract endMask(): void;

    abstract beginClip(clip: Clip): void;
    abstract endClip(): void;

    /** See {@link RenderContext2D.beginEffects}. No-op by default. */
    beginEffects(effects: SceneEffect[], target: EffectTarget, width: number, height: number): void { }
    endEffects(): void { }

    /** See {@link RenderContext2D.rasterize}. Returns `null` by default. */
    rasterize(
        width: number,
        height: number,
        draw: () => void,
        pixelRatio?: number,
    ): RasterizedSurface | null {
        return null;
    }

    abstract beginCamera(viewport: { x: number; y: number; width: number; height: number }, lookAt: Vector2, zoom: number, heading: number): void;
    abstract endCamera(): void;

    /**
     * Per-node render state for each node on the draw stack, in push order
     * (innermost last). Kept parallel to `currentNodeStack` so fills with
     * `space: 'parent'` can resolve their reference rect and so
     * motion-driven effects can read the current node's velocity.
     */
    protected renderStateStack: NodeRenderState[] = [];

    /** See {@link RenderContext2D.readsSpaceRects}. */
    readonly readsSpaceRects: boolean = true;

    /** See {@link RenderContext2D.drawsVisibleOnly}. */
    readonly drawsVisibleOnly: boolean = true;

    /** See {@link RenderPass2D.begin}. */
    begin(state: NodeRenderState): void {
        this.currentNodeStack.push(state.id);
        this.renderStateStack.push(state);
    }

    /** Close the innermost node draw scope opened by `begin()`. */
    end(): void {
        this.currentNodeStack.pop();
        this.renderStateStack.pop();
    }

    /** Reference rects for the node currently being drawn (parent / viewport). */
    protected currentSpaceRects(): SpaceRects {
        return this.renderStateStack[this.renderStateStack.length - 1]?.rects ?? {};
    }

    /** Full render state (incl. velocity) for the node currently being drawn, if any. */
    protected currentRenderState(): NodeRenderState | undefined {
        return this.renderStateStack[this.renderStateStack.length - 1];
    }
}
