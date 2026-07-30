import { Effects, EffectChain, Color } from "motion-script";

/**
 * Named looks, composed from the built-in effects.
 *
 * These live *in this project*, not in the library, and that is the point: a
 * recipe is a matter of taste, and taste should be yours to retune without
 * waiting on a release. Copy this file into your own project and change the
 * numbers freely — nothing here is engine API.
 *
 * A recipe is not a new kind of effect. Each returns a plain {@link EffectChain},
 * so it stays transparent (log one and you see exactly which effects it used),
 * extensible (`riso().blur(2)`), and free of any separate render path.
 *
 * ## The `amount` contract
 *
 * Every recipe takes a single 0–1 `amount`: **0 is a no-op and 1 is the full
 * look**, with a smooth ramp between, so a recipe animates on like any other
 * effect.
 *
 * Holding to that has one real consequence for recipe design: every ingredient
 * must have a *neutral setting to ramp from*. `threshold` has none — at any
 * `smoothness` it still flattens colour to two tones — so {@link photocopy}
 * reaches for `grayscale` + `posterize`, which do. When a look seems to want an
 * ingredient that can't be turned off, that is the signal to find a different
 * ingredient rather than to break the contract. (`core` states which effects
 * have no neutral form; see its `neutral.test.ts`.)
 *
 * Discrete choices (a palette, a dot shape) don't ramp at all. They are fixed by
 * the recipe and switched on by whatever *scalar* ingredient carries them —
 * {@link gameboy}'s `bitCrush` palette is constant while its `amount` fades in.
 *
 * Keep the chain *shape* constant across amounts too: interpolation pairs two
 * chains up by index, so a recipe that changed length with `amount` would pop
 * mid-tween.
 *
 * ## Order is load-bearing
 *
 * The sequence inside a recipe is the recipe. Damage before separation, so torn
 * bands carry their own fringe rather than an intact fringe being painted over a
 * broken image; screen artefacts (scanlines, grain) last, because a display adds
 * them to whatever it is showing.
 *
 * One house rule follows from a current engine limitation: *filter*-surface
 * effects (`duotone`, `grayscale`, `bloom`, `colorAdjustment`, `vintage`) always
 * run after every *shader*-surface one, whatever order the chain was written in.
 * So each recipe below lists its shader ingredients first and its filter
 * ingredients second — which makes the written order the executed order.
 */

/** Interpolate from a recipe's neutral setting toward its full-strength one. */
const at = (amount: number, neutral: number, full: number): number =>
    neutral + (full - neutral) * amount;

/** Clamp an authored amount into the 0–1 the contract promises. */
const clamp = (amount: number): number => Math.max(0, Math.min(1, amount));

/**
 * Risograph — a spot-ink duplicator print: one saturated ink screened onto
 * absorbent paper.
 *
 * Screen *before* inking: the halftone reduces the image to dots, and the
 * duotone then maps those dots to ink and paper. Inking first would leave the
 * screen chewing through an already-coloured image, which is not how a riso
 * works and doesn't look like one either.
 */
export const riso = (amount = 1, ink: Color = '#0033a0', paper: Color = '#f6f1e7'): EffectChain => {
    const a = clamp(amount);
    return Effects
        .halftone({ size: at(a, 0.5, 7), angle: 45 })
        .grain({ amount: at(a, 0, 0.14), size: 2 })
        .duotone({ amount: a, shadows: ink, highlights: paper });
};

/** Newsprint — a fine neutral screen on grey stock. */
export const newsprint = (amount = 1, size = 4): EffectChain => {
    const a = clamp(amount);
    return Effects
        .halftone({ size: at(a, 0.5, size), angle: 45 })
        .grain({ amount: at(a, 0, 0.1), size: 1 })
        .duotone({ amount: a, shadows: '#1a1a1a', highlights: '#e8e2d4' });
};

/**
 * Blueprint — pale linework on a drafting ground.
 *
 * `edges` does the work: it already outputs bright lines on black, which is a
 * blueprint inverted. The duotone just recolours those two ends.
 */
export const blueprint = (amount = 1, color: Color = '#0a2a6b'): EffectChain => {
    const a = clamp(amount);
    return Effects
        .edges({ strength: at(a, 0, 2.2), kernel: 'sobel' })
        .grain({ amount: at(a, 0, 0.08), size: 1 })
        .duotone({ amount: a, shadows: color, highlights: '#dbe7ff' });
};

/**
 * Photocopy — tone blown to near-black-and-white, with toner speckle.
 *
 * Uses `grayscale` + `posterize` rather than the more obvious `threshold`,
 * because threshold has no neutral setting to ramp from and would break the
 * `amount: 0` contract.
 */
export const photocopy = (amount = 1): EffectChain => {
    const a = clamp(amount);
    return Effects
        .posterize({ levels: at(a, 255, 3) })
        .grain({ amount: at(a, 0, 0.2), size: 1 })
        .grayscale(a)
        .duotone({ amount: a, shadows: '#141414', highlights: '#f2efe6' });
};

/**
 * VHS — tape damage read back through a warm, soft tube.
 *
 * Damage, separate, then the display's own artefacts. The `vintage` grade reads
 * as the tape's colour response and would sit first in a signal chain, but it is
 * a filter and so always lands last — written here where it runs.
 */
export const vhs = (amount = 1, seed = 7): EffectChain => {
    const a = clamp(amount);
    return Effects
        .blockDisplace({ amount: at(a, 0, 40), size: 20, density: 0.4, seed })
        .rgbShift({ red: { x: at(a, 0, 7), y: 0 }, blue: { x: at(a, 0, -5), y: at(a, 0, 2) } })
        .scanlines({ darkness: at(a, 0, 0.55), spacing: 5 })
        .grain({ amount: at(a, 0, 0.22), animated: true })
        .vintage({ amount: at(a, 0, 0.5), warmth: at(a, 0, -0.2) });
};

/**
 * CRT — a curved tube with visible line structure and bloom.
 *
 * The bulge goes first so it warps the *content*; the scanlines are then drawn
 * straight over it, which is where they physically live — on the glass, not in
 * the signal. Bloom is last because it is a filter and would land there anyway.
 */
export const crt = (amount = 1, spacing = 4): EffectChain => {
    const a = clamp(amount);
    return Effects
        .bulge(at(a, 0, 0.12))
        .scanlines({ darkness: at(a, 0, 0.5), spacing, thickness: 0.45 })
        .vignette({ amount: at(a, 0, 0.55), radius: 0.6, softness: 0.6 })
        .bloom({ intensity: at(a, 0, 0.9), threshold: 0.6, radius: 10 });
};

/** Glitch — harsh digital breakup, ungraded. */
export const glitch = (amount = 1, seed = 3): EffectChain => {
    const a = clamp(amount);
    return Effects
        .blockDisplace({ amount: at(a, 0, 70), size: 12, density: 0.55, seed })
        .rgbShift({ red: { x: at(a, 0, 12), y: 0 }, blue: { x: at(a, 0, -12), y: 0 } })
        .bitCrush({ bits: 4, amount: at(a, 0, 0.8) })
        .scanlines({ darkness: at(a, 0, 0.25), spacing: 3 });
};

/**
 * Game Boy — the DMG panel: low resolution, ordered dither, four greens.
 *
 * `pixelate` is a filter, so it runs *after* the two shader passes whatever the
 * chain says — the panel's chunky blocks are formed last, from an already
 * quantized image, and each block takes one palette colour because `sharpColors`
 * samples rather than averages.
 */
export const gameboy = (amount = 1, blocks = 160): EffectChain => {
    const a = clamp(amount);
    return Effects
        .dither({ levels: at(a, 255, 4), matrix: 4 })
        .bitCrush({ palette: 'gameboy', amount: a })
        .pixelate({ blocks: at(a, 1920, blocks), sharpColors: true });
};

/**
 * Screen print — flat spot colours with hard edges.
 *
 * Alone of the print looks this keeps the source's *colour*: a screen print is
 * several saturated inks, not one, and posterizing per channel is the closest
 * the built-in effects get to picking spot colours. The saturation push
 * afterwards is what stops the flattened bands reading as merely low-quality.
 */
export const screenPrint = (amount = 1, levels = 3): EffectChain => {
    const a = clamp(amount);
    return Effects
        .posterize({ levels: at(a, 255, levels) })
        .colorAdjustment({ contrast: at(a, 1, 1.5), saturation: at(a, 1, 1.45) });
};

/** Thermal receipt — near-two-tone charcoal burned onto warm stock. */
export const thermalPrint = (amount = 1): EffectChain => {
    const a = clamp(amount);
    return Effects
        .posterize({ levels: at(a, 255, 2) })
        .grain({ amount: at(a, 0, 0.12), size: 1 })
        .grayscale(a)
        .duotone({ amount: a, shadows: '#23201c', highlights: '#efe9dc' });
};

/**
 * Pencil sketch — graphite linework on paper.
 *
 * `edges` already produces bright lines on black, which is a sketch inverted;
 * the duotone maps that black to paper and the bright lines to graphite, so no
 * separate invert is needed.
 */
export const pencilSketch = (
    amount = 1,
    graphite: Color = '#2e2c29',
    paper: Color = '#f2ede1',
): EffectChain => {
    const a = clamp(amount);
    return Effects
        .edges({ strength: at(a, 0, 2.4), kernel: 'sobel' })
        .grain({ amount: at(a, 0, 0.1), size: 1 })
        .duotone({ amount: a, shadows: paper, highlights: graphite });
};

/**
 * Chalk — light linework on a dark board.
 *
 * The same edge map as {@link pencilSketch} with the duotone the other way up,
 * plus heavier grain for the dusty break-up. That the two differ only in their
 * ramp is the point of building looks by composition.
 */
export const chalk = (amount = 1, board: Color = '#1f2a26'): EffectChain => {
    const a = clamp(amount);
    return Effects
        .edges({ strength: at(a, 0, 2.2), kernel: 'sobel' })
        .grain({ amount: at(a, 0, 0.28), size: 2 })
        .duotone({ amount: a, shadows: board, highlights: '#eae6d9' });
};

/**
 * Comic — flat colour behind a process dot screen.
 *
 * Rides `halftone`'s `'cmyk'` separation, and would not work without it: an RGB
 * screen has no K plate, so every neutral prints three overlapping colour dots
 * and the page turns to confetti. With darkness on its own plate, paper stays
 * paper and the inks only carry hue.
 */
export const comic = (amount = 1, size = 7): EffectChain => {
    const a = clamp(amount);
    return Effects
        .halftone({ size: at(a, 0.5, size), angle: 15, separation: 'cmyk' })
        .colorAdjustment({ saturation: at(a, 1, 1.35), contrast: at(a, 1, 1.15) });
};

/**
 * Anamorphic glare — the horizontal flare a wide lens throws off a highlight,
 * plus a little bloom to seat it.
 */
export const anamorphicGlare = (amount = 1, angle = 0): EffectChain => {
    const a = clamp(amount);
    return Effects
        .streak({ intensity: at(a, 0, 2.2), threshold: 0.6, length: at(a, 0, 260), angle })
        .bloom({ intensity: at(a, 0, 0.5), threshold: 0.75, radius: 16 });
};

/** Oil painting — Kuwahara brushwork, with the palette pushed a little. */
export const oilPainting = (amount = 1, radius = 4): EffectChain => {
    const a = clamp(amount);
    return Effects
        .oilPaint({ radius: at(a, 0, radius) })
        .colorAdjustment({ saturation: at(a, 1, 1.25), contrast: at(a, 1, 1.1) });
};

/**
 * Paper stock — your texture multiplied over the content, with grain and a warm
 * paper tint.
 *
 * The one recipe that needs an asset: `src` points at an image in the project's
 * `public/` folder. That is also what makes it the template for a whole material
 * family — swap the image for a weave, a denim scan or a felt photograph and the
 * same recipe becomes canvas, denim or felt.
 */
export const paper = (src: string, amount = 1, scale = 1): EffectChain => {
    const a = clamp(amount);
    return Effects
        .texture({ src, amount: at(a, 0, 0.75), blend: 'multiply', scale })
        .grain({ amount: at(a, 0, 0.08), size: 1 })
        .colorAdjustment({ temperature: at(a, 0, 0.12), contrast: at(a, 1, 1.05) });
};

/**
 * Neon — glowing tubes on near-black.
 *
 * Edges give the tubes, bloom gives them the halo, and the duotone colours both
 * at once. Bloom must land between the two: run before the edge pass it would
 * have nothing thin to glow, and after the duotone it would bleed the background
 * colour rather than the tube's.
 */
export const neon = (amount = 1, color: Color = '#3df5ff'): EffectChain => {
    const a = clamp(amount);
    return Effects
        .edges({ strength: at(a, 0, 2.6), kernel: 'sobel' })
        .bloom({ intensity: at(a, 0, 1.6), threshold: 0.35, radius: 14 })
        .duotone({ amount: a, shadows: '#05060c', highlights: color });
};
