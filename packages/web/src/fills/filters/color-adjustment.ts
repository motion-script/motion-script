import type { CanvasKit } from "@motion-script/canvaskit";
import type { ColorAdjustmentFilter } from "@motion-script/core";
import { ImageFillFilter } from "./filter";

// ITU-R BT.709 luminance weights
const LR = 0.2126, LG = 0.7152, LB = 0.0722;

function identity(): number[] {
    return [
        1, 0, 0, 0, 0,
        0, 1, 0, 0, 0,
        0, 0, 1, 0, 0,
        0, 0, 0, 1, 0,
    ];
}

// Multiply two 4×5 color matrices: returns outer × inner (inner applied first).
// Treats each as a 5×5 with implicit last row [0,0,0,0,1].
function multiply(outer: number[], inner: number[]): number[] {
    const out = new Array(20).fill(0);
    for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 5; j++) {
            let sum = 0;
            for (let k = 0; k < 4; k++) {
                sum += outer[i * 5 + k] * inner[k * 5 + j];
            }
            if (j === 4) sum += outer[i * 5 + 4];
            out[i * 5 + j] = sum;
        }
    }
    return out;
}

function brightnessMatrix(b: number): number[] {
    return [
        1, 0, 0, 0, b,
        0, 1, 0, 0, b,
        0, 0, 1, 0, b,
        0, 0, 0, 1, 0,
    ];
}

function contrastMatrix(c: number): number[] {
    const t = 0.5 * (1 - c);
    return [
        c, 0, 0, 0, t,
        0, c, 0, 0, t,
        0, 0, c, 0, t,
        0, 0, 0, 1, 0,
    ];
}

function saturationMatrix(s: number): number[] {
    const i = 1 - s;
    return [
        s + i * LR, i * LG,      i * LB,      0, 0,
        i * LR,     s + i * LG,  i * LB,      0, 0,
        i * LR,     i * LG,      s + i * LB,  0, 0,
        0,          0,           0,            1, 0,
    ];
}

function temperatureMatrix(t: number): number[] {
    return [
        1, 0, 0, 0,  t * 0.1,
        0, 1, 0, 0,  0,
        0, 0, 1, 0, -t * 0.1,
        0, 0, 0, 1,  0,
    ];
}

function tintMatrix(t: number): number[] {
    // Positive = magenta (more R+B, less G); negative = green (more G, less R+B)
    return [
        1, 0, 0, 0,  t * 0.05,
        0, 1, 0, 0, -t * 0.1,
        0, 0, 1, 0,  t * 0.05,
        0, 0, 0, 1,  0,
    ];
}

// Lifts (positive) or crushes (negative) dark areas while keeping whites fixed.
// r' = r*(1 - 0.2*s) + 0.2*s  →  at r=0: r'=0.2s; at r=1: r'=1
function shadowsMatrix(s: number): number[] {
    const scale = 1 - 0.2 * s;
    const offset = 0.2 * s;
    return [
        scale, 0, 0, 0, offset,
        0, scale, 0, 0, offset,
        0, 0, scale, 0, offset,
        0, 0, 0,     1, 0,
    ];
}

// Boosts (positive) or rolls off (negative) bright areas while keeping midtones fixed.
// r' = r*(1 + 0.2*h) - 0.1*h  →  at r=0.5: r'=0.5; at r=1: r'=1+0.1h
function highlightsMatrix(h: number): number[] {
    const scale = 1 + 0.2 * h;
    const offset = -0.1 * h;
    return [
        scale, 0, 0, 0, offset,
        0, scale, 0, 0, offset,
        0, 0, scale, 0, offset,
        0, 0, 0,     1, 0,
    ];
}

/**
 * Composes brightness/contrast/saturation/vibrance/temperature/tint/shadows/
 * highlights into a single 4×5 color matrix (each enabled adjustment multiplies
 * onto the running matrix, in that order). Returns null if nothing is set —
 * vignette is intentionally unsupported since it needs spatial, not per-pixel, data.
 */
export class ColorAdjustmentImageFillFilter extends ImageFillFilter<ColorAdjustmentFilter> {
    constructor() {
        super("colorAdjustment");
    }

    makeImageFilter(filter: ColorAdjustmentFilter, ck: CanvasKit): any {
        let mat = identity();
        let hasAdjustment = false;

        const apply = (m: number[]) => {
            mat = multiply(m, mat);
            hasAdjustment = true;
        };

        const b = filter.brightness ?? 0;
        if (b !== 0) apply(brightnessMatrix(b));

        const c = filter.contrast ?? 1;
        if (c !== 1) apply(contrastMatrix(c));

        const s = filter.saturation ?? 1;
        if (s !== 1) apply(saturationMatrix(s));

        // Vibrance: approximate as a lighter saturation pass (muted colors benefit more)
        const v = filter.vibrance ?? 0;
        if (v !== 0) apply(saturationMatrix(1 + v * 0.7));

        const temp = filter.temperature ?? 0;
        if (temp !== 0) apply(temperatureMatrix(temp));

        const tint = filter.tint ?? 0;
        if (tint !== 0) apply(tintMatrix(tint));

        const sh = filter.shadows ?? 0;
        if (sh !== 0) apply(shadowsMatrix(sh));

        const hi = filter.highlights ?? 0;
        if (hi !== 0) apply(highlightsMatrix(hi));

        // vignette requires spatial data — not implementable via color matrix

        if (!hasAdjustment) return null;

        const colorFilter = ck.ColorFilter.MakeMatrix(mat);
        const imageFilter = ck.ImageFilter.MakeColorFilter(colorFilter, null);
        colorFilter.delete();
        return imageFilter;
    }
}
