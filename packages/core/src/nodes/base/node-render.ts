import { RenderContext2D, SpaceRects } from "@/render/render-context2d";
import { Clip } from "@/render/clip";
import { BoxBounds } from "@/attributes/layout/bounds";
import { SceneEffect } from "@/attributes/shape/effects/union";
import { backdropEffects, foregroundShaderEffects } from "@/attributes/shape/effects/backdrop";

/**
 * Companion for {@link Node2D}'s render pipeline. The orchestration that weaves the
 * `protected` override seams (`onRender`, `renderContentWithEffects`,
 * `renderSelf`/`renderOverlay`/`renderStroke`/`renderChildren`) stays on the
 * class so subclass overrides and `super.*` dispatch correctly, and
 * `applyTransform` stays inline (it mutates the reused `_transformScratch` per
 * frame). What lives here are the **pure, leaf** pieces of the pipeline that
 * take resolved inputs + the `ctx` — no callbacks into protected seams — so the
 * hot orchestration reads cleanly without the scope-bookkeeping noise.
 */

/**
 * Reference rect for fills with `space:'parent'`, expressed in this node's local
 * space (origin = this node's positioned centre, y-down). The viewport
 * (`space:'global'`) is resolved by the renderer. Rotation/scale of this node
 * are not folded in — the rect is the axis-aligned parent box, which is what
 * gradients expect. Returns `{}` for a root node (no parent).
 */
/** @internal */
export function computeSpaceRects(
    parentRect: BoxBounds | undefined,
    thisRect: BoxBounds,
    x: number,
    y: number,
): SpaceRects {
    if (!parentRect) return {};
    // This node's local origin within the parent's space.
    const ox = thisRect.x + x;
    const oy = thisRect.y - y;
    return {
        parent: {
            left: -parentRect.width / 2 - ox,
            top: -parentRect.height / 2 - oy,
            right: parentRect.width / 2 - ox,
            bottom: parentRect.height / 2 - oy,
        },
    };
}

/**
 * Apply backdrop effects (any `mode:"backdrop"` effect — blur, grayscale, …;
 * plus magnify and backdrop SkSL) beneath the node, clipped to its silhouette,
 * before the node's own content is drawn — so what's underneath is
 * filtered/warped while the node's own edges stay sharp. A no-op when there are
 * no backdrop effects or no silhouette `clip` to confine them to.
 */
/** @internal */
export function applyBackdropEffects(
    ctx: RenderContext2D,
    effects: SceneEffect[],
    clip: Clip | null,
    width: number,
    height: number,
): void {
    const backdrop = backdropEffects(effects);
    if (backdrop.length === 0) return;
    if (!clip || clip.isEmpty()) return;

    // Clip to the silhouette first so the backdrop passes are confined to the
    // node; the renderer opens its backdrop layers within that clip.
    ctx.beginClip(clip);
    ctx.beginEffectScope(backdrop, "backdrop", width, height);
    ctx.endEffectScope();
    ctx.endClip();
}

/**
 * Run `body` inside the node's foreground effect scope and clip-path scope — the
 * inner half of `renderContentWithEffects` (the backdrop pass is applied
 * separately, before this). Outermost-first:
 *  1. a `foreground` effect scope (posterize wrapping bulge) capturing everything
 *     `body` paints, so those shader effects warp/band the lot;
 *  2. a `clipPath` cut through both the node's own paint and its children.
 * Both scopes are balanced and skipped when empty so the begin/end calls match.
 */
/** @internal */
export function applyContentEffectScope(
    ctx: RenderContext2D,
    effects: SceneEffect[],
    clipPath: Clip | null,
    width: number,
    height: number,
    body: () => void,
): void {
    const foreground = foregroundShaderEffects(effects);
    const hasForeground = foreground.length > 0;
    if (hasForeground) ctx.beginEffectScope(foreground, "foreground", width, height);

    const pathClipped = clipPath != null && !clipPath.isEmpty();
    if (pathClipped) ctx.beginClip(clipPath);

    body();

    if (pathClipped) ctx.endClip();
    if (hasForeground) ctx.endEffectScope();
}
