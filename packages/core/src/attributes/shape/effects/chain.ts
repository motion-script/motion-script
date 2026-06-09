import { SceneEffect } from "./union";
import type { SkSLUniform } from "./implementations/sksl";

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

  /** Append a Gaussian blur with the given pixel `radius`. */
  blur(radius: number) {
    return new EffectChain([...this.list, { type: 'blur', radius }]);
  }

  /**
   * Append a Figma-style background blur with the given pixel `radius`. Blurs
   * whatever is painted beneath the node and clips that blur to the node's
   * silhouette, leaving the node's own edges sharp.
   */
  backgroundBlur(radius: number) {
    return new EffectChain([...this.list, { type: 'backgroundBlur', radius }]);
  }

  /** Append a pixelate effect where both axes use the same block `size` (0–1). */
  pixelate(size: number) {
    return new EffectChain([...this.list, { type: 'pixelate', horizontalBlocks: size, verticalBlocks: size }]);
  }

  /** Append a grayscale effect with `amount` in the 0–1 range. */
  grayscale(amount: number) {
    return new EffectChain([...this.list, { type: 'grayscale', amount }]);
  }

  /**
   * Append a texture (spatter dissolve) effect.
   * @param radius spread distance — how far the grain dissolve reaches inward.
   * @param size   grain cell size in px; a number sets both axes, or pass `{x, y}`.
   */
  texture(radius: number, size: number | { x: number; y: number } = 8) {
    const s = typeof size === 'number' ? { x: size, y: size } : size;
    return new EffectChain([...this.list, { type: 'texture', radius, size: s }]);
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
   * Append a zoom lens that magnifies the backdrop beneath the node. The lens
   * fills the node's bounding box and is clipped to its silhouette, so whatever
   * is painted underneath shows through scaled about `center` — like a
   * magnifying glass shaped to the node.
   * @param scale  magnification factor (1 = none, 2 = 2×, 0.5 = zoomed out) (default 2).
   * @param center zoom centre in 0–1 layer coords (default middle).
   */
  zoom(scale = 2, center: { x: number; y: number } = { x: 0.5, y: 0.5 }) {
    return new EffectChain([...this.list, { type: 'zoom', scale, center }]);
  }

  /**
   * Append a bloom (glow) effect. Bright areas bleed soft light outward via a
   * screen-blend of the blurred bright-pass onto the layer.
   * @param threshold  0–1 luminance cutoff — only pixels brighter than this bloom (default 0.7).
   * @param radius     spread in pixels (default 12).
   * @param intensity  additive multiplier for the bloom pass (default 1).
   */
  bloom(threshold = 0.7, radius = 12, intensity = 1) {
    return new EffectChain([...this.list, { type: 'bloom', threshold, radius, intensity }]);
  }

  /**
   * Append a vintage / film-look colour grading effect.
   * @param amount  0–1: 0 = original, 1 = full sepia+desaturate (default 1).
   * @param warmth  -1…1: negative = cool/cyan tint, positive = warm/amber tint (default 0.2).
   */
  vintage(amount = 1, warmth = 0.2) {
    return new EffectChain([...this.list, { type: 'vintage', amount, warmth }]);
  }

  /**
   * Append a chromatic aberration effect — red/blue colour fringing that mimics
   * lens dispersion.
   * @param amount  pixel offset distance for the R/B channel fringe (default 4).
   * @param angle   angle in degrees (0 = horizontal, R right / B left) (default 0).
   */
  chromaticAberration(amount = 4, angle = 0) {
    return new EffectChain([...this.list, { type: 'chromaticAberration', amount, angle }]);
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
  blur: (radius: number) => createChain([{ type: 'blur', radius }]),
  backgroundBlur: (radius: number) => createChain([{ type: 'backgroundBlur', radius }]),
  pixelate: (size: number) => createChain([{ type: 'pixelate', horizontalBlocks: size, verticalBlocks: size }]),
  grayscale: (amount: number) => createChain([{ type: 'grayscale', amount }]),
  texture: (radius: number, size: number | { x: number; y: number } = 8) => {
    const s = typeof size === 'number' ? { x: size, y: size } : size;
    return createChain([{ type: 'texture', radius, size: s }]);
  },
  bulge: (strength: number) =>
    createChain([{ type: 'bulge', strength }]),
  zoom: (scale = 2, center: { x: number; y: number } = { x: 0.5, y: 0.5 }) =>
    createChain([{ type: 'zoom', scale, center }]),
  bloom: (threshold = 0.7, radius = 12, intensity = 1) =>
    createChain([{ type: 'bloom', threshold, radius, intensity }]),
  vintage: (amount = 1, warmth = 0.2) =>
    createChain([{ type: 'vintage', amount, warmth }]),
  chromaticAberration: (amount = 4, angle = 0) =>
    createChain([{ type: 'chromaticAberration', amount, angle }]),
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