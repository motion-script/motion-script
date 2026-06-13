import { SceneEffect } from "./union";
import type { InvertChannel } from "./implementations/invert";
import type { ScatterDirection } from "./implementations/scatter";
import type { MotionBlurAxis, MotionBlurEffect } from "./implementations/motion-blur";
import type { PixelateEffect } from "./implementations/pixelate";
import type { SkSLUniform } from "./implementations/sksl";

/**
 * Options shared by every backdrop-capable effect builder. When `backdrop` is
 * `true`, the effect runs on the content painted *beneath* the node (clipped to
 * its silhouette) instead of the node's own content — the node's own edges stay
 * sharp. Omitted/`false` applies the effect to the node's own content.
 */
export type BackdropOptions = { backdrop?: boolean };

/**
 * Accepted shapes for {@link FX.pixelate} / {@link EffectChain.pixelate}.
 *
 * Block counts follow AE's Mosaic: they are the *number* of blocks across the
 * node, so a count equal to the node's pixel size on that axis is pristine and
 * lower counts are coarser. `sharpColors` mirrors AE's "Sharp Colors" checkbox
 * (default `true` — solid blocks). `backdrop` runs the mosaic on the backdrop.
 *
 * - `number` — same block count on both axes (pass `opts` for `backdrop`).
 * - `{ blocks, sharpColors?, backdrop? }` — uniform block count, optional sharpness.
 * - `{ horizontalBlocks, verticalBlocks, sharpColors?, backdrop? }` — per-axis block count.
 */
export type PixelateOptions =
  | number
  | ({ blocks: number; sharpColors?: boolean } & BackdropOptions)
  | ({ horizontalBlocks: number; verticalBlocks: number; sharpColors?: boolean } & BackdropOptions);

/**
 * Normalises any {@link PixelateOptions} to a concrete {@link PixelateEffect}.
 * For the `number` form, `opts` supplies the `backdrop` flag.
 */
function toPixelateEffect(options: PixelateOptions, opts?: BackdropOptions): PixelateEffect {
  if (typeof options === "number") {
    return { type: "pixelate", horizontalBlocks: options, verticalBlocks: options, sharpColors: true, ...opts };
  }
  const sharpColors = options.sharpColors ?? true;
  const backdrop = options.backdrop;
  if ("blocks" in options) {
    return { type: "pixelate", horizontalBlocks: options.blocks, verticalBlocks: options.blocks, sharpColors, backdrop };
  }
  return {
    type: "pixelate",
    horizontalBlocks: options.horizontalBlocks,
    verticalBlocks: options.verticalBlocks,
    sharpColors,
    backdrop,
  };
}

/**
 * Immutable, chainable list of scene effects.
 *
 * Each builder method returns a new `EffectChain` with the effect appended,
 * so chains are safe to share and branch.
 *
 * @example
 * const fx = FX.blur(4).grayscale(0.5);
 * node.effects = fx; // assign directly
 * node.effects = [...fx, { type: 'pixelate', ... }]; // spread into array
 */
export class EffectChain {
  constructor(public list: SceneEffect[] = []) { }

  /**
   * Append a Gaussian blur with the given pixel `radius`. Pass
   * `{ backdrop: true }` to blur the content beneath the node (clipped to its
   * silhouette, Figma-style) instead of the node's own content.
   */
  blur(radius: number, opts?: BackdropOptions) {
    return new EffectChain([...this.list, { type: 'blur', blur: radius, ...opts }]);
  }

  /**
   * Append a motion-blur-style directional (linear) blur, smearing the node's
   * own content along a single axis (or the backdrop, with `{ backdrop: true }`).
   * @param direction  angle in degrees of the smear axis (0 = horizontal, 90 = vertical).
   * @param blurLength smear length in pixels along `direction`.
   */
  directionalBlur(direction: number, blurLength: number, opts?: BackdropOptions) {
    return new EffectChain([...this.list, { type: 'directionalBlur', direction, blurLength, ...opts }]);
  }

  /**
   * Append an After Effects-style Mosaic / pixelate. The argument is the *number
   * of blocks* across the node (a count equal to the node's pixel size on that
   * axis is pristine; lower is coarser), not a pixel block size.
   * @param options block count: `number` (uniform), `{ blocks, sharpColors?, backdrop? }`,
   *                or `{ horizontalBlocks, verticalBlocks, sharpColors?, backdrop? }`.
   * @param opts    `{ backdrop }` when `options` is a bare `number`.
   */
  pixelate(options: PixelateOptions, opts?: BackdropOptions) {
    return new EffectChain([...this.list, toPixelateEffect(options, opts)]);
  }

  /** Append a grayscale effect with `amount` in the 0–1 range. `{ backdrop: true }` desaturates the backdrop. */
  grayscale(amount: number, opts?: BackdropOptions) {
    return new EffectChain([...this.list, { type: 'grayscale', amount, ...opts }]);
  }

  /**
   * Append a bulge/pinch lens applied to the node's *own* content (like blur),
   * not the backdrop. A barrel distortion magnifies the centre and pins the
   * edges; a negative strength pinches the centre inward instead.
   * @param strength positive bulges (barrel), negative pinches (pincushion) (≈ −1…1).
   */
  bulge(strength: number) {
    return new EffectChain([...this.list, { type: 'bulge', strength }]);
  }

  /**
   * Append a magnify lens that magnifies the backdrop beneath the node. The lens
   * fills the node's bounding box and is clipped to its silhouette, so whatever
   * is painted underneath shows through scaled about `center` — like a
   * magnifying glass shaped to the node.
   * @param scale  magnification factor (1 = none, 2 = 2×, 0.5 = zoomed out) (default 2).
   * @param center magnify centre in 0–1 layer coords (default middle).
   */
  magnify(scale = 2, center: { x: number; y: number } = { x: 0.5, y: 0.5 }) {
    return new EffectChain([...this.list, { type: 'magnify', scale, center }]);
  }

  /**
   * Append a bloom (glow) effect. Bright areas bleed soft light outward via a
   * screen-blend of the blurred bright-pass onto the layer.
   * @param threshold  0–1 luminance cutoff — only pixels brighter than this bloom (default 0.7).
   * @param radius     spread in pixels (default 12).
   * @param intensity  additive multiplier for the bloom pass (default 1).
   * @param opts       `{ backdrop: true }` blooms the backdrop instead of the node.
   */
  bloom(threshold = 0.7, radius = 12, intensity = 1, opts?: BackdropOptions) {
    return new EffectChain([...this.list, { type: 'bloom', threshold, radius, intensity, ...opts }]);
  }

  /**
   * Append a vintage / film-look colour grading effect.
   * @param amount  0–1: 0 = original, 1 = full sepia+desaturate (default 1).
   * @param warmth  -1…1: negative = cool/cyan tint, positive = warm/amber tint (default 0.2).
   * @param opts    `{ backdrop: true }` grades the backdrop instead of the node.
   */
  vintage(amount = 1, warmth = 0.2, opts?: BackdropOptions) {
    return new EffectChain([...this.list, { type: 'vintage', amount, warmth, ...opts }]);
  }

  /**
   * Append a chromatic aberration effect — red/blue colour fringing that mimics
   * lens dispersion.
   * @param amount  pixel offset distance for the R/B channel fringe (default 4).
   * @param angle   angle in degrees (0 = horizontal, R right / B left) (default 0).
   * @param opts    `{ backdrop: true }` fringes the backdrop instead of the node.
   */
  chromaticAberration(amount = 4, angle = 0, opts?: BackdropOptions) {
    return new EffectChain([...this.list, { type: 'chromaticAberration', amount, angle, ...opts }]);
  }

  /**
   * Append a colour-invert effect.
   * @param channel  which channel / colour component to invert (default `'rgba'`).
   * @param strength 0–1: blend from original (0) to fully inverted (1) (default 1).
   * @param opts     `{ backdrop: true }` inverts the backdrop instead of the node.
   */
  invert(channel: InvertChannel = 'rgba', strength = 1, opts?: BackdropOptions) {
    return new EffectChain([...this.list, { type: 'invert', channel, strength, ...opts }]);
  }

  /**
   * Append a scatter effect — randomly jitters the node's own pixels, smearing
   * its content like After Effects' Scatter.
   * @param strength   maximum random pixel displacement (default 10).
   * @param direction  axis pixels are scattered along (default `'both'`).
   * @param opts       `{ backdrop: true }` scatters the backdrop instead of the node.
   */
  scatter(strength = 10, direction: ScatterDirection = 'both', opts?: BackdropOptions) {
    return new EffectChain([...this.list, { type: 'scatter', strength, direction, ...opts }]);
  }

  /**
   * Append an After Effects-style posterize effect — quantizes each colour
   * channel into `level` evenly-spaced bands, flattening gradients into steps.
   * @param level number of brightness levels per channel (≥ 2, default 4).
   * @param opts  `{ backdrop: true }` posterizes the backdrop instead of the node.
   */
  posterize(level = 4, opts?: BackdropOptions) {
    return new EffectChain([...this.list, { type: 'posterize', level, ...opts }]);
  }

  /**
   * Append velocity-driven motion blur — smears the node's own content along its
   * actual per-frame motion (a static node stays sharp). Modelled on After
   * Effects' shutter angle (`length`) and shutter phase (`alignment`).
   * @param length     shutter "openness" as a percent; 100 ≈ 360° (default 50).
   * @param alignment  shutter phase: `'behind'` | `'centered'` | `'ahead'` | −1…1 (default `'centered'`).
   * @param samples    renderer quality hint — higher switches to multi-tap accumulation (default 16).
   * @param strength   blur-length multiplier (default 1).
   * @param axis       per-axis velocity scale: `'x'` | `'y'` | `'both'` | `{x,y}` (default `'both'`).
   */
  motionBlur(
    length = 50,
    alignment: MotionBlurEffect['alignment'] = 'centered',
    samples = 16,
    strength = 1,
    axis: MotionBlurAxis = 'both',
  ) {
    return new EffectChain([...this.list, { type: 'motionBlur', length, alignment, samples, strength, axis }]);
  }

  /**
   * Append a custom SkSL overlay shader applied as a layer effect.
   * The shader generates colour from position/uniforms and is blended onto the
   * node's layer using `blendMode` (default `'screen'`).
   * @param shader     SkSL source. Uniforms declared after any built-ins are supplied via `uniforms`.
   * @param uniforms   Values in declaration order — lerped between animation frames.
   * @param blendMode  How the shader composites onto the layer (default `'screen'`).
   */
  skslLayer(shader: string, uniforms: SkSLUniform[] = [], blendMode = 'screen') {
    return new EffectChain([...this.list, { type: 'sksl', shader, uniforms, mode: 'layer' as const, blendMode }]);
  }

  /**
   * Append a custom SkSL backdrop effect. The shader receives
   * `uniform shader u_backdrop` — a snapshot of the canvas content beneath the
   * node — and resamples it to produce distortion, ripple, refraction, etc.
   * The result replaces the backdrop within the node's silhouette clip.
   * @param shader    SkSL source. First child shader is always `u_backdrop`.
   * @param uniforms  Values in declaration order — lerped between animation frames.
   */
  skslBackdrop(shader: string, uniforms: SkSLUniform[] = []) {
    return new EffectChain([...this.list, { type: 'sksl', shader, uniforms, mode: 'backdrop' as const }]);
  }

  /** Allows spreading the chain into an array: `[...FX.blur(5)]`. */
  *[Symbol.iterator]() {
    yield* this.list;
  }

  /** Serializes to the raw effect array so frameworks that call `toJSON` get a plain value. */
  toJSON() {
    return this.list;
  }
}

/**
 * Accepted shapes for a node's `effects` prop.
 * Can be a single effect, a plain array, or an `EffectChain` builder result.
 */
export type ChainableFx = SceneEffect[] | EffectChain | SceneEffect;

const createChain = (list: SceneEffect[] = []): EffectChain => new EffectChain(list);

/**
 * Entry points for building effect chains fluently.
 *
 * @example
 * node.effects = FX.blur(8).grayscale(1);
 */
export const FX = {
  /** Gaussian blur. `{ backdrop: true }` blurs the backdrop beneath the node, clipped to its silhouette. */
  blur: (blur: number, opts?: BackdropOptions) => createChain([{ type: 'blur', blur: blur, ...opts }]),
  /** Motion-blur-style directional (linear) blur. `direction` in degrees, `blurLength` in pixels. `{ backdrop }` smears the backdrop. */
  directionalBlur: (direction: number, blurLength: number, opts?: BackdropOptions) =>
    createChain([{ type: 'directionalBlur', direction, blurLength, ...opts }]),
  /**
   * After Effects-style Mosaic / pixelate. The argument is the *number of blocks*
   * across the node (a count equal to the node's pixel size is pristine; lower is
   * coarser), accepting a uniform `number`, `{ blocks, sharpColors?, backdrop? }`, or
   * `{ horizontalBlocks, verticalBlocks, sharpColors?, backdrop? }`. Pass `opts` for
   * `backdrop` when `options` is a bare `number`.
   */
  pixelate: (options: PixelateOptions, opts?: BackdropOptions) => createChain([toPixelateEffect(options, opts)]),
  grayscale: (amount: number, opts?: BackdropOptions) => createChain([{ type: 'grayscale', amount, ...opts }]),
  bulge: (strength: number) =>
    createChain([{ type: 'bulge', strength }]),
  magnify: (scale = 2, center: { x: number; y: number } = { x: 0.5, y: 0.5 }) =>
    createChain([{ type: 'magnify', scale, center }]),
  bloom: (threshold = 0.7, radius = 12, intensity = 1, opts?: BackdropOptions) =>
    createChain([{ type: 'bloom', threshold, radius, intensity, ...opts }]),
  vintage: (amount = 1, warmth = 0.2, opts?: BackdropOptions) =>
    createChain([{ type: 'vintage', amount, warmth, ...opts }]),
  chromaticAberration: (amount = 4, angle = 0, opts?: BackdropOptions) =>
    createChain([{ type: 'chromaticAberration', amount, angle, ...opts }]),
  invert: (channel: InvertChannel = 'rgba', strength = 1, opts?: BackdropOptions) =>
    createChain([{ type: 'invert', channel, strength, ...opts }]),
  scatter: (strength = 10, direction: ScatterDirection = 'both', opts?: BackdropOptions) =>
    createChain([{ type: 'scatter', strength, direction, ...opts }]),
  /** After Effects-style posterize. `level` = brightness bands per channel (≥ 2). `{ backdrop }` bands the backdrop. */
  posterize: (level = 4, opts?: BackdropOptions) =>
    createChain([{ type: 'posterize', level, ...opts }]),
  /** Velocity-driven motion blur. `length` percent (≈ shutter angle), `alignment` shutter phase, `samples` quality hint. */
  motionBlur: (
    length = 50,
    alignment: MotionBlurEffect['alignment'] = 'centered',
    samples = 16,
    multiplier = 1,
    axis: MotionBlurAxis = 'both',
  ) => createChain([{ type: 'motionBlur', length, alignment, samples, strength: multiplier, axis }]),
  skslLayer: (shader: string, uniforms: SkSLUniform[] = [], blendMode = 'screen') =>
    createChain([{ type: 'sksl', shader, uniforms, mode: 'layer' as const, blendMode }]),
  skslBackdrop: (shader: string, uniforms: SkSLUniform[] = []) =>
    createChain([{ type: 'sksl', shader, uniforms, mode: 'backdrop' as const }]),
};

/**
 * Normalises any `ChainableFx` value to a plain `SceneEffect[]`.
 * Used internally when reading props before rendering or interpolation.
 */
export function resolveChainEffects(effects: ChainableFx | undefined): SceneEffect[] {
  if (effects === undefined) return [];
  if (effects instanceof EffectChain) return effects.list;
  if (Array.isArray(effects)) return effects;
  return [effects];
}