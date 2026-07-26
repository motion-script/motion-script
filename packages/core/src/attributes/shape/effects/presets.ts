import { EffectChain, Effects } from "./chain";
import { scalarOptions } from "./effect-data";
import type { Color } from "../fill/color/parser";

/**
 * Named recipes for the looks people ask for by name.
 *
 * A preset is not a new kind of effect — it is a *composition*, and it returns a
 * plain {@link EffectChain}. That means presets are transparent (log one and you
 * see exactly which effects it used), extensible (keep chaining onto the result),
 * and free of any new render path:
 *
 *     node.effects = Presets.vhs(0.8);
 *     node.effects = Presets.riso().blur(2);          // keep building
 *     node.effects = [Presets.crt(0.6), FX.grain(0.1)]; // or mix
 *
 * ## The `amount` contract
 *
 * Every preset takes a single 0–1 `amount` (with the usual scalar shorthand):
 * **0 is a no-op and 1 is the full look**, with a smooth ramp between, so a
 * preset can be animated on like any other effect.
 *
 * Holding to that has one real consequence for recipe design: every ingredient
 * must have a *neutral setting to ramp from*. `threshold` has none — at any
 * `smoothness` it still flattens colour to grey — so the photocopy recipe reaches
 * for `grayscale` + `posterize`, which do. When a look seems to want an
 * ingredient that can't be turned off, that is the signal to find a different
 * ingredient rather than to break the contract.
 *
 * Discrete choices (a palette, a dot shape) don't ramp at all. They are fixed by
 * the recipe and switched on by whatever *scalar* ingredient carries them —
 * `bitCrush`'s palette is constant while its `amount` fades in.
 *
 * ## Order is load-bearing
 *
 * The sequence inside a recipe is the recipe. Damage before separation, so torn
 * bands carry their own fringe rather than an intact fringe being painted over a
 * broken image; screen artefacts (scanlines, grain) last, because a display adds
 * them to whatever it is showing.
 */

/** Shared by every preset: one 0–1 dial from untouched to the full look. */
export interface PresetOptions {
    /** 0 = no-op, 1 = the full look (default 1). */
    amount?: number;
}

/** Interpolate from a preset's neutral setting toward its full-strength one. */
const at = (amount: number, neutral: number, full: number): number =>
    neutral + (full - neutral) * amount;

/** Normalise a preset's argument to a clamped 0–1 strength plus its options. */
function strength<O extends PresetOptions>(arg: number | O | undefined): { a: number; o: Partial<O> } {
    const o = scalarOptions(arg, "amount" as keyof O) as Partial<O>;
    const raw = (o as PresetOptions).amount ?? 1;
    return { a: Math.max(0, Math.min(1, raw)), o };
}

/** Risograph: spot inks, a visible screen, and paper texture. */
export interface RisoOptions extends PresetOptions {
    /** Ink colour the shadows print in (default riso blue). */
    ink?: Color;
    /** Paper colour the highlights fall back to (default warm off-white). */
    paper?: Color;
}

/** Newsprint: a fine dot screen in neutral ink on stock. */
export interface NewsprintOptions extends PresetOptions {
    /** Dot pitch in px (default 4). */
    size?: number;
}

/** Blueprint: pale linework on a saturated ground. */
export interface BlueprintOptions extends PresetOptions {
    /** The ground colour (default drafting blue). */
    color?: Color;
}

/** Photocopy: blown-out tone, toner grain, warm paper. */
export type PhotocopyOptions = PresetOptions;

/** VHS: tape damage, colour separation, scanlines, grain. */
export interface VhsOptions extends PresetOptions {
    /** Tear pattern seed — step it in whole numbers between frames (default 7). */
    seed?: number;
}

/** CRT: tube curvature, line structure, glow, edge falloff. */
export interface CrtOptions extends PresetOptions {
    /** Scanline pitch in px (default 4). */
    spacing?: number;
}

/** Glitch: harsh digital breakup with no grade. */
export interface GlitchOptions extends PresetOptions {
    /** Tear pattern seed — step it in whole numbers between frames (default 3). */
    seed?: number;
}

/** Game Boy: low-res, dithered, four greens. */
export interface GameboyOptions extends PresetOptions {
    /** Horizontal pixel-block count — lower is chunkier (default 160). */
    blocks?: number;
}

export const Presets = {
    /**
     * Risograph — a spot-ink duplicator print: one saturated ink screened onto
     * absorbent paper.
     *
     * Screen *before* inking: the halftone reduces the image to dots, and the
     * duotone then maps those dots to ink and paper. Inking first would leave
     * the screen chewing through an already-coloured image, which is not how a
     * riso works and doesn't look like one either.
     */
    riso(options?: number | RisoOptions): EffectChain {
        const { a, o } = strength<RisoOptions>(options);
        return Effects
            .halftone({ size: at(a, 0.5, 7), angle: 45 })
            .duotone({ amount: a, shadows: o.ink ?? "#0033a0", highlights: o.paper ?? "#f6f1e7" })
            .grain({ amount: at(a, 0, 0.14), size: 2 });
    },

    /** Newsprint — a fine neutral screen on grey stock. */
    newsprint(options?: number | NewsprintOptions): EffectChain {
        const { a, o } = strength<NewsprintOptions>(options);
        return Effects
            .halftone({ size: at(a, 0.5, o.size ?? 4), angle: 45 })
            .duotone({ amount: a, shadows: "#1a1a1a", highlights: "#e8e2d4" })
            .grain({ amount: at(a, 0, 0.1), size: 1 });
    },

    /**
     * Blueprint — pale linework on a drafting ground.
     *
     * `edges` does the work: it already outputs bright lines on black, which is a
     * blueprint inverted. The duotone just recolours those two ends.
     */
    blueprint(options?: number | BlueprintOptions): EffectChain {
        const { a, o } = strength<BlueprintOptions>(options);
        return Effects
            .edges({ strength: at(a, 0, 2.2), kernel: "sobel" })
            .duotone({ amount: a, shadows: o.color ?? "#0a2a6b", highlights: "#dbe7ff" })
            .grain({ amount: at(a, 0, 0.08), size: 1 });
    },

    /**
     * Photocopy — tone blown to near-black-and-white, with toner speckle.
     *
     * Uses `grayscale` + `posterize` rather than the more obvious `threshold`,
     * because threshold has no neutral setting to ramp from and would break the
     * `amount: 0` contract.
     */
    photocopy(options?: number | PhotocopyOptions): EffectChain {
        const { a } = strength<PhotocopyOptions>(options);
        return Effects
            .grayscale(a)
            .posterize({ levels: at(a, 255, 3) })
            .duotone({ amount: a, shadows: "#141414", highlights: "#f2efe6" })
            .grain({ amount: at(a, 0, 0.2), size: 1 });
    },

    /**
     * VHS — tape damage read back through a warm, soft tube.
     *
     * The canonical order: grade, damage, separate, then the display's own
     * artefacts on top.
     */
    vhs(options?: number | VhsOptions): EffectChain {
        const { a, o } = strength<VhsOptions>(options);
        return Effects
            .vintage({ amount: at(a, 0, 0.5), warmth: at(a, 0, -0.2) })
            .blockDisplace({ amount: at(a, 0, 40), size: 20, density: 0.4, seed: o.seed ?? 7 })
            .rgbShift({ red: { x: at(a, 0, 7), y: 0 }, blue: { x: at(a, 0, -5), y: at(a, 0, 2) } })
            .scanlines({ darkness: at(a, 0, 0.55), spacing: 5 })
            .grain({ amount: at(a, 0, 0.22), animated: true });
    },

    /**
     * CRT — a curved tube with visible line structure and bloom.
     *
     * The bulge goes first so it warps the *content*; the scanlines are then
     * drawn straight over it, which is where they physically live — on the glass,
     * not in the signal.
     */
    crt(options?: number | CrtOptions): EffectChain {
        const { a, o } = strength<CrtOptions>(options);
        return Effects
            .bulge(at(a, 0, 0.12))
            .scanlines({ darkness: at(a, 0, 0.5), spacing: o.spacing ?? 4, thickness: 0.45 })
            .bloom({ intensity: at(a, 0, 0.9), threshold: 0.6, radius: 10 })
            .vignette({ amount: at(a, 0, 0.55), radius: 0.6, softness: 0.6 });
    },

    /** Glitch — harsh digital breakup, ungraded. */
    glitch(options?: number | GlitchOptions): EffectChain {
        const { a, o } = strength<GlitchOptions>(options);
        return Effects
            .blockDisplace({ amount: at(a, 0, 70), size: 12, density: 0.55, seed: o.seed ?? 3 })
            .rgbShift({ red: { x: at(a, 0, 12), y: 0 }, blue: { x: at(a, 0, -12), y: 0 } })
            .bitCrush({ bits: 4, amount: at(a, 0, 0.8) })
            .scanlines({ darkness: at(a, 0, 0.25), spacing: 3 });
    },

    /**
     * Game Boy — the DMG panel: low resolution, ordered dither, four greens.
     *
     * Pixelate first so the dither cells land on the fake pixel grid rather than
     * on the device's, then crush to the palette last.
     */
    gameboy(options?: number | GameboyOptions): EffectChain {
        const { a, o } = strength<GameboyOptions>(options);
        return Effects
            .pixelate({ blocks: at(a, 1920, o.blocks ?? 160), sharpColors: true })
            .dither({ levels: at(a, 255, 4), matrix: 4 })
            .bitCrush({ palette: "gameboy", amount: a });
    },
};
