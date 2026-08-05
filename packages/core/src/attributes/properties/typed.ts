import { TweenFn } from "@/signals/host";
import { property } from "./decorator";

import { type Fill } from "@/attributes/shape/fill/chain";
import { FillResolved } from "@/attributes/shape/fill/union";
import { resolveFillArray, lerpFillArray } from "@/attributes/shape/fill/registry";
import { Color, NormalizedColor, parseColor } from "@/attributes/shape/fill/color/parser";
import { lerpColor } from "@/attributes/shape/fill/lerp";

import { type Stroke, StrokeResolved, resolveStrokeArray } from "@/attributes/shape/stroke/mapper";
import { lerpStrokeArray } from "@/attributes/shape/stroke/lerp";

import { type Shadow, ShadowResolved, resolveShadowArray } from "@/attributes/shape/shadow/resolver";
import { lerpShadowArray } from "@/attributes/shape/shadow/lerp";

import { type Effect, resolveChainEffects } from "@/attributes/shape/effects/chain";
import { SceneEffect } from "@/attributes/shape/effects/union";
import { lerpEffectArray } from "@/attributes/shape/effects/registry";

import { RectCornerRadius, CornerRadiusResolved, resolveCornerRadius, lerpCornerRadius } from "@/attributes/shape/corners/corner-radius";
import { RectCornerStyle, CornerStyleResolved, resolveCornerStyle, lerpCornerStyle } from "@/attributes/shape/corners/corner-style";
import { lerpPath } from "@/attributes/shape/path/morph";

import { Insets, InsetsResolved, resolveInsets } from "@/attributes/layout/insets";
import { Anchor, resolveAnchor, lerpAnchor } from "@/attributes/layout/anchor";
import { Vector2, lerpVector2 } from "@/attributes/layout/vector2";
import { SizeInput } from "@/attributes/layout/size";
import { lerpInsets, lerpSizeInput } from "@/layout/tweens";

import { lerpText } from "@/attributes/text/lerp";
import { PathData } from "@/render/descriptors/path";

/**
 * Attribute-typed variants of `@property`.
 *
 * A rich attribute (a fill, a stroke, a corner radius) is only declarative and
 * tweenable because its `@property` carries the matching *mapper* (loose author
 * input → resolved value) and *tween* (how the resolved value interpolates).
 * Getting that pair right means knowing which `resolveXArray`/`lerpXArray`
 * belong together — several of which are `@internal` — so a custom node that
 * wants a second fill has to copy an incantation out of `ShapeNode`.
 *
 * These decorators pre-bake each pair. `@fillProperty()` is exactly
 * `@property({ default: [], mapper: resolveFillArray, tween: lerpFillArray })`,
 * so everything downstream — `set()`, `to()`, `save()`/`restore()`, `() => …`
 * bindings — behaves identically; only the declaration gets shorter.
 *
 * ```ts
 * class Card extends Rect {
 *     @fillProperty({ default: "white/10" }) declare glow: Fill;
 *     @strokeProperty() declare edge: Stroke;
 *     @cornerRadiusProperty({ default: 12 }) declare notch: RectCornerRadius;
 * }
 *
 * // <Card glow="red" /> · card().to({ glow: Fills.linearGradient([...]) }, 0.6)
 * ```
 *
 * Each takes the same options as `@property` — `default`, plus `mapper`/`tween`
 * to override the built-in pair for a one-off case.
 *
 * As with `@property`, the field is declared with the **loose author-facing**
 * type (`Fill`, not `FillResolved[]`) so assignment and reads share one type;
 * the accessor stores the resolved value and consumers cast at the read site.
 */
export interface AttributePropOptions<Ext, Int> {
    /** Initial value, used when the constructor `props` object omits the key. */
    default?: Ext;
    /** Override the attribute's built-in external → internal mapper. */
    mapper?: (ext: Ext, prev?: Int) => Int;
    /** Override the attribute's built-in lerp for `to()`. */
    tween?: TweenFn<Int>;
}

/**
 * Build one attribute-typed decorator from its canonical mapper/tween pair.
 *
 * `fallback` is a factory rather than a value so array/object defaults aren't a
 * single instance shared by every property declared through the decorator.
 */
function attributeProperty<Ext, Int>(
    fallback: () => Ext,
    mapper?: (ext: Ext, prev?: Int) => Int,
    tween?: TweenFn<Int>,
) {
    return (opts?: AttributePropOptions<Ext, Int>) =>
        property<Ext, Int>({
            default: opts?.default ?? fallback(),
            mapper: opts?.mapper ?? mapper,
            tween: opts?.tween ?? tween,
        });
}

// ---- Paint ----------------------------------------------------------------

/**
 * A fill-layer property: accepts everything the built-in `fill` prop does (a CSS
 * string, a fill prop object, a `Fills` chain, or an array of them) and lerps
 * layer-by-layer.
 *
 * Note this only makes the *property* behave like `fill`; the node still has to
 * paint it (`ctx.draw(g.fill(this.glow as FillResolved[]))`). Assets referenced
 * by the fill (images, videos, 3D surfaces) are discovered from that draw, so
 * nothing extra is needed to make them load.
 */
export const fillProperty = attributeProperty<Fill, FillResolved[]>(
    () => [],
    resolveFillArray,
    lerpFillArray,
);

/** A stroke-layer property — the `stroke` prop's mapper/tween pair. */
export const strokeProperty = attributeProperty<Stroke, StrokeResolved[]>(
    () => [],
    resolveStrokeArray,
    lerpStrokeArray,
);

/** A shadow-layer property — the `shadow` prop's mapper/tween pair. */
export const shadowProperty = attributeProperty<Shadow, ShadowResolved[]>(
    () => [],
    resolveShadowArray,
    lerpShadowArray,
);

/** An effect-chain property — the `effects` prop's mapper/tween pair. */
export const effectsProperty = attributeProperty<Effect, SceneEffect[]>(
    () => [],
    resolveChainEffects,
    lerpEffectArray,
);

/**
 * A tweenable colour property: parses CSS strings, `oklch()`, theme tokens and
 * `"white/10"` alpha suffixes, and interpolates in normalized space.
 *
 * The stored value is a {@link NormalizedColor} (a `[r, g, b, a]` tuple), which
 * is *not* a `FillProp` on its own — hand it to a fill rather than painting it
 * directly: `g.fill(Fills.color(this.tint))` or `g.fill({ type: 'solid', color:
 * this.tint })`. For a property that is itself a paint layer, use
 * {@link fillProperty}.
 */
export const colorProperty = attributeProperty<Color, NormalizedColor>(
    () => "black",
    (v: Color) => (Array.isArray(v) ? v : parseColor(v)),
    lerpColor,
);

// ---- Geometry -------------------------------------------------------------

/** A corner-radius property: uniform, per-corner or per-axis, tweened per corner. */
export const cornerRadiusProperty = attributeProperty<RectCornerRadius, CornerRadiusResolved>(
    () => 0,
    (v, prev) => resolveCornerRadius(v, prev),
    lerpCornerRadius,
);

/** A corner-style property (`'rounded'` / `'angled'`), per corner. */
export const cornerStyleProperty = attributeProperty<RectCornerStyle, CornerStyleResolved>(
    () => "rounded",
    (v, prev) => resolveCornerStyle(v, prev),
    lerpCornerStyle,
);

/**
 * A path-geometry property: an SVG path string or command list, morphed between
 * arbitrary shapes by `to()`.
 */
export const pathProperty = attributeProperty<PathData, PathData>(
    () => "",
    undefined,
    lerpPath,
);

// ---- Layout ---------------------------------------------------------------

/** An edge-inset property: scalar, symmetric or per-edge, tweened per edge. */
export const insetsProperty = attributeProperty<Insets, InsetsResolved>(
    () => 0,
    resolveInsets,
    lerpInsets,
);

/**
 * An anchor property: a named position (`'center'`, `'topLeft'`, …) resolved to
 * a per-axis {@link Vector2} in `[-1, 1]` (x: -1 left … +1 right, y: -1 bottom …
 * +1 top), tweened as a vector so `'centerLeft' → 'centerRight'` slides.
 *
 * One decorator for every "which point of this box" prop — `Node.pivot`, a
 * container's `align`, an image fill's `anchor`. They previously had two
 * decorators (`alignProperty`/`pivotProperty`) that differed only in whether the
 * default was spelled `'center'` or `{ x: 0, y: 0 }` — the same value either side
 * of {@link resolveAnchor}.
 */
export const anchorProperty = attributeProperty<Anchor, Vector2>(
    () => "center",
    (v: Anchor) => resolveAnchor(v),
    lerpAnchor,
);

/** A plain 2D point property, tweened component-wise. */
export const vector2Property = attributeProperty<Vector2, Vector2>(
    () => ({ x: 0, y: 0 }),
    undefined,
    lerpVector2,
);

/**
 * A size property: a pixel number or the `'fill'` / `'hug'` layout keywords,
 * tweened the way `width`/`height` are (keywords snap; numbers interpolate).
 */
export const sizeProperty = attributeProperty<SizeInput, SizeInput>(
    () => "fill",
    undefined,
    lerpSizeInput,
);

// ---- Text -----------------------------------------------------------------

/**
 * A text property tweened with the same character-level interpolation as
 * `Text.text`, so `to({ label })` types/untypes rather than snapping.
 */
export const textProperty = attributeProperty<string, string>(
    () => "",
    undefined,
    lerpText,
);
