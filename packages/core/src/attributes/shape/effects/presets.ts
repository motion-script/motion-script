import { EffectChain, Effects } from "./chain";
import { scalarOptions } from "./effect-data";
import type { Color } from "../fill/color/parser";
import type { Vector2 } from "@/attributes/layout/vector2";

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
 *
 * One house rule follows from a current engine limitation: *filter*-surface
 * effects (`duotone`, `grayscale`, `bloom`, `colorAdjustment`) always run after
 * every *shader*-surface one, whatever order the chain was written in. So each
 * recipe below lists its shader ingredients first and its filter ingredients
 * second — which makes the written order the executed order, and keeps these
 * recipes honest about what they do.
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

/** Screen print: flat spot colours with hard edges. */
export interface ScreenPrintOptions extends PresetOptions {
    /** Tones kept per channel — fewer is bolder (default 3). */
    levels?: number;
}

/** Thermal receipt: near-two-tone charcoal on warm stock. */
export type ThermalPrintOptions = PresetOptions;

/** Pencil sketch: graphite linework on paper. */
export interface PencilSketchOptions extends PresetOptions {
    /** Graphite colour (default soft black). */
    graphite?: Color;
    /** Paper colour (default warm white). */
    paper?: Color;
}

/** Chalk: light linework on a dark board. */
export interface ChalkOptions extends PresetOptions {
    /** Board colour (default deep slate green). */
    board?: Color;
}

/** Comic: flat colour behind a process dot screen. */
export interface ComicOptions extends PresetOptions {
    /** Dot pitch in px (default 7). */
    size?: number;
}

/** Anamorphic glare: a horizontal lens flare off the highlights. */
export interface AnamorphicGlareOptions extends PresetOptions {
    /** Streak axis in degrees; 0 = horizontal (default 0). */
    angle?: number;
}

/** Sunbeams streaming from a point. */
export interface GodRaysPresetOptions extends PresetOptions {
    /** Light source in 0–1 layer coords (default upper centre). */
    center?: Vector2;
}

/** Oil painting: Kuwahara brushwork with a little extra saturation. */
export interface OilPaintingOptions extends PresetOptions {
    /** Brush size in px, capped at 6 (default 4). */
    radius?: number;
}

/**
 * Paper stock: your texture multiplied over the content.
 *
 * The only preset that needs an asset — `src` is required, and points at an
 * image in the project's `public/` folder. That is also what makes it the
 * template for the whole material family: `canvas`, `linen`, `denim` and `felt`
 * are this same recipe with a different image, which is why they aren't
 * separate presets.
 */
export interface PaperOptions extends PresetOptions {
    /** Texture image path. Required. */
    src: string;
    /** Texture scale — above 1 tiles it (default 1). */
    scale?: number;
}

/** Neon: glowing linework on near-black. */
export interface NeonOptions extends PresetOptions {
    /** Tube colour (default cyan). */
    color?: Color;
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
            .grain({ amount: at(a, 0, 0.14), size: 2 })
            .duotone({ amount: a, shadows: o.ink ?? "#0033a0", highlights: o.paper ?? "#f6f1e7" });
    },

    /** Newsprint — a fine neutral screen on grey stock. */
    newsprint(options?: number | NewsprintOptions): EffectChain {
        const { a, o } = strength<NewsprintOptions>(options);
        return Effects
            .halftone({ size: at(a, 0.5, o.size ?? 4), angle: 45 })
            .grain({ amount: at(a, 0, 0.1), size: 1 })
            .duotone({ amount: a, shadows: "#1a1a1a", highlights: "#e8e2d4" });
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
            .grain({ amount: at(a, 0, 0.08), size: 1 })
            .duotone({ amount: a, shadows: o.color ?? "#0a2a6b", highlights: "#dbe7ff" });
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
            .posterize({ levels: at(a, 255, 3) })
            .grain({ amount: at(a, 0, 0.2), size: 1 })
            .grayscale(a)
            .duotone({ amount: a, shadows: "#141414", highlights: "#f2efe6" });
    },

    /**
     * VHS — tape damage read back through a warm, soft tube.
     *
     * Damage, separate, then the display's own artefacts. The `vintage` grade
     * reads as the tape's colour response and would sit first in a signal chain,
     * but it is a filter and so always lands last — written here where it runs.
     */
    vhs(options?: number | VhsOptions): EffectChain {
        const { a, o } = strength<VhsOptions>(options);
        return Effects
            .blockDisplace({ amount: at(a, 0, 40), size: 20, density: 0.4, seed: o.seed ?? 7 })
            .rgbShift({ red: { x: at(a, 0, 7), y: 0 }, blue: { x: at(a, 0, -5), y: at(a, 0, 2) } })
            .scanlines({ darkness: at(a, 0, 0.55), spacing: 5 })
            .grain({ amount: at(a, 0, 0.22), animated: true })
            .vintage({ amount: at(a, 0, 0.5), warmth: at(a, 0, -0.2) });
    },

    /**
     * CRT — a curved tube with visible line structure and bloom.
     *
     * The bulge goes first so it warps the *content*; the scanlines are then
     * drawn straight over it, which is where they physically live — on the glass,
     * not in the signal. Bloom is last because it is a filter and would land
     * there regardless.
     */
    crt(options?: number | CrtOptions): EffectChain {
        const { a, o } = strength<CrtOptions>(options);
        return Effects
            .bulge(at(a, 0, 0.12))
            .scanlines({ darkness: at(a, 0, 0.5), spacing: o.spacing ?? 4, thickness: 0.45 })
            .vignette({ amount: at(a, 0, 0.55), radius: 0.6, softness: 0.6 })
            .bloom({ intensity: at(a, 0, 0.9), threshold: 0.6, radius: 10 });
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
     * `pixelate` is a filter, so it runs *after* the two shader passes whatever
     * the chain says — the panel's chunky blocks are formed last, from an
     * already-quantized image, and each block takes one palette colour because
     * `sharpColors` samples rather than averages.
     */
    gameboy(options?: number | GameboyOptions): EffectChain {
        const { a, o } = strength<GameboyOptions>(options);
        return Effects
            .dither({ levels: at(a, 255, 4), matrix: 4 })
            .bitCrush({ palette: "gameboy", amount: a })
            .pixelate({ blocks: at(a, 1920, o.blocks ?? 160), sharpColors: true });
    },

    /**
     * Screen print — flat spot colours with hard edges.
     *
     * Alone of the print looks this keeps the source's *colour*: a screen print
     * is several saturated inks, not one, and posterizing per channel is the
     * closest the current effects get to picking spot colours. The saturation
     * push afterwards is what stops the flattened bands reading as merely
     * low-quality.
     */
    screenPrint(options?: number | ScreenPrintOptions): EffectChain {
        const { a, o } = strength<ScreenPrintOptions>(options);
        return Effects
            .posterize({ levels: at(a, 255, o.levels ?? 3) })
            .colorAdjustment({ contrast: at(a, 1, 1.5), saturation: at(a, 1, 1.45) });
    },

    /** Thermal receipt — near-two-tone charcoal burned onto warm stock. */
    thermalPrint(options?: number | ThermalPrintOptions): EffectChain {
        const { a } = strength<ThermalPrintOptions>(options);
        return Effects
            .posterize({ levels: at(a, 255, 2) })
            .grain({ amount: at(a, 0, 0.12), size: 1 })
            .grayscale(a)
            .duotone({ amount: a, shadows: "#23201c", highlights: "#efe9dc" });
    },

    /**
     * Pencil sketch — graphite linework on paper.
     *
     * `edges` already produces bright lines on black, which is a sketch
     * inverted; the duotone maps that black to paper and the bright lines to
     * graphite, so no separate invert is needed.
     */
    pencilSketch(options?: number | PencilSketchOptions): EffectChain {
        const { a, o } = strength<PencilSketchOptions>(options);
        return Effects
            .edges({ strength: at(a, 0, 2.4), kernel: "sobel" })
            .grain({ amount: at(a, 0, 0.1), size: 1 })
            .duotone({ amount: a, shadows: o.paper ?? "#f2ede1", highlights: o.graphite ?? "#2e2c29" });
    },

    /**
     * Chalk — light linework on a dark board.
     *
     * The same edge map as {@link Presets.pencilSketch} with the duotone the
     * other way up, plus heavier grain for the dusty break-up. That the two
     * differ only in their ramp is the point of building looks by composition.
     */
    chalk(options?: number | ChalkOptions): EffectChain {
        const { a, o } = strength<ChalkOptions>(options);
        return Effects
            .edges({ strength: at(a, 0, 2.2), kernel: "sobel" })
            .grain({ amount: at(a, 0, 0.28), size: 2 })
            .duotone({ amount: a, shadows: o.board ?? "#1f2a26", highlights: "#eae6d9" });
    },

    /**
     * Comic — flat colour behind a process dot screen.
     *
     * Rides `halftone`'s `'cmyk'` separation, and would not work without it: an
     * RGB screen has no K plate, so every neutral prints three overlapping
     * colour dots and the page turns to confetti. With darkness on its own
     * plate, paper stays paper and the inks only carry hue.
     */
    comic(options?: number | ComicOptions): EffectChain {
        const { a, o } = strength<ComicOptions>(options);
        return Effects
            .halftone({ size: at(a, 0.5, o.size ?? 7), angle: 15, separation: "cmyk" })
            .colorAdjustment({ saturation: at(a, 1, 1.35), contrast: at(a, 1, 1.15) });
    },

    /**
     * Anamorphic glare — the horizontal flare a wide lens throws off a
     * highlight, plus a little bloom to seat it.
     */
    anamorphicGlare(options?: number | AnamorphicGlareOptions): EffectChain {
        const { a, o } = strength<AnamorphicGlareOptions>(options);
        return Effects
            .streak({ intensity: at(a, 0, 2.2), threshold: 0.6, length: at(a, 0, 260), angle: o.angle ?? 0 })
            .bloom({ intensity: at(a, 0, 0.5), threshold: 0.75, radius: 16 });
    },

    /**
     * Sunbeams — light streaming from a point, warmed and vignetted.
     *
     * Wants a subject with something bright partly occluded; on a flat, evenly
     * lit image there is nothing for the light to stream past and the result is
     * just a gentle brightening.
     */
    godRays(options?: number | GodRaysPresetOptions): EffectChain {
        const { a, o } = strength<GodRaysPresetOptions>(options);
        return Effects
            .godRays({
                intensity: at(a, 0, 2.2),
                threshold: 0.55,
                length: 0.7,
                center: o.center ?? { x: 0.5, y: 0.2 },
                decay: 0.97,
                samples: 32,
            })
            .vignette({ amount: at(a, 0, 0.35), radius: 0.7, softness: 0.6 })
            .colorAdjustment({ temperature: at(a, 0, 0.25) });
    },

    /** Oil painting — Kuwahara brushwork, with the palette pushed a little. */
    oilPainting(options?: number | OilPaintingOptions): EffectChain {
        const { a, o } = strength<OilPaintingOptions>(options);
        return Effects
            .oilPaint({ radius: at(a, 0, o.radius ?? 4) })
            .colorAdjustment({ saturation: at(a, 1, 1.25), contrast: at(a, 1, 1.1) });
    },

    /**
     * Paper stock — your texture multiplied over the content, with grain and a
     * warm paper tint.
     *
     * Swap `src` for a weave, a denim scan or a felt photograph and the same
     * recipe becomes canvas, denim or felt. That is the point of the texture
     * capability: the material is yours, the recipe is shared.
     */
    paper(options: PaperOptions): EffectChain {
        const { a, o } = strength<PaperOptions>(options);
        return Effects
            .texture({ src: options.src, amount: at(a, 0, 0.75), blend: "multiply", scale: o.scale ?? 1 })
            .grain({ amount: at(a, 0, 0.08), size: 1 })
            .colorAdjustment({ temperature: at(a, 0, 0.12), contrast: at(a, 1, 1.05) });
    },

    /**
     * Neon — glowing tubes on near-black.
     *
     * Edges give the tubes, bloom gives them the halo, and the duotone colours
     * both at once. Bloom must land between the two: run before the edge pass it
     * would have nothing thin to glow, and after the duotone it would bleed the
     * background colour rather than the tube's.
     */
    neon(options?: number | NeonOptions): EffectChain {
        const { a, o } = strength<NeonOptions>(options);
        return Effects
            .edges({ strength: at(a, 0, 2.6), kernel: "sobel" })
            .bloom({ intensity: at(a, 0, 1.6), threshold: 0.35, radius: 14 })
            .duotone({ amount: a, shadows: "#05060c", highlights: o.color ?? "#3df5ff" });
    },
};
