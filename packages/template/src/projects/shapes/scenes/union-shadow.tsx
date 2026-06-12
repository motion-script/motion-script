import { Fill, sequence, parallel, easeInOutQuad } from "@motion-script/core";
import { StrokeCardScene } from "./stroke-card";

/**
 * Stacks multiple stroke layers and multiple shadows on one shape to see how
 * they compose. Both `stroke` and `shadow` accept arrays and lerp element-wise,
 * so each layer animates independently.
 *
 *  - Strokes are painted in order, so a wide outer band sits under a thin inner
 *    accent. Their weights animate so the two bands separate.
 *  - Two drop shadows are offset in opposite directions, giving a dual-light
 *    "glow" that spreads as the blur and offsets grow.
 */
export class UnionShadowScene extends StrokeCardScene {
    readonly label = 'Strokes + Shadows';

    *build() {
        const sample = this.card({
            fill: Fill.color('#161a21'),
            // Two stacked strokes: a wide outer band and a thin inner accent.
            stroke: [
                { weight: 8, fill: Fill.color('#6990DD'), align: 'outside' },
                { weight: 4, fill: Fill.color('#F5C26B'), align: 'inside' },
            ],
            // Two shadows thrown in opposite directions.
            shadow: [
                { fill: Fill.color('#6990DD', { opacity: 0.6 }), blur: 8, dx: -8, dy: -8 },
                { fill: Fill.color('#E8617C', { opacity: 0.6 }), blur: 8, dx: 8, dy: 8 },
            ],
        });

        yield* sequence(
            // Spread both stroke bands and bloom both shadows outward together.
            parallel(
                sample().strokeTo([
                    { weight: 28, fill: Fill.color('#6990DD'), align: 'outside' },
                    { weight: 10, fill: Fill.color('#F5C26B'), align: 'inside' },
                ], 2, { ease: easeInOutQuad }),
                sample().shadowTo([
                    { fill: Fill.color('#6990DD', { opacity: 0.8 }), blur: 50, dx: -40, dy: -40 },
                    { fill: Fill.color('#E8617C', { opacity: 0.8 }), blur: 50, dx: 40, dy: 40 },
                ], 2, { ease: easeInOutQuad }),
            ),
            // Settle back so the scene can loop cleanly.
            parallel(
                sample().strokeTo([
                    { weight: 8, fill: Fill.color('#6990DD'), align: 'outside' },
                    { weight: 4, fill: Fill.color('#F5C26B'), align: 'inside' },
                ], 1.6, { ease: easeInOutQuad }),
                sample().shadowTo([
                    { fill: Fill.color('#6990DD', { opacity: 0.6 }), blur: 8, dx: -8, dy: -8 },
                    { fill: Fill.color('#E8617C', { opacity: 0.6 }), blur: 8, dx: 8, dy: 8 },
                ], 1.6, { ease: easeInOutQuad }),
            ),
        );
    }
}
