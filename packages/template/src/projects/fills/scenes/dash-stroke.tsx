import { Fills, sequence, easeInOutQuad, linear } from "@motion-script/core";
import { StrokeCardScene } from "./stroke-card";

/**
 * Walks through every dash parameter on a single stroke layer:
 *
 *  1. weight grows from a hairline to a thick band,
 *  2. the dash pattern shifts from tight dots to long dashes with wide gaps
 *     (note: `dash` snaps at the tween midpoint rather than lerping),
 *  3. `dashOffset` sweeps a couple of full pattern lengths so the dashes appear
 *     to crawl around the outline.
 */
export class DashStrokeScene extends StrokeCardScene {
    readonly label = 'Dash Stroke';

    *build() {
        // Start as a thin, tightly-dotted outline.
        const sample = this.card({
            stroke: { weight: 4, fill: Fills.color('#6990DD'), dash: [6, 10], dashOffset: 0, align: 'center' },
        });

        yield* sequence(
            // weight: hairline -> thick band.
            sample().strokeTo({ weight: 28, fill: Fills.color('#6990DD'), dash: [6, 10], align: 'center' }, 1.2, { ease: easeInOutQuad }),
            // dash pattern: tight dots -> long dashes / wide gaps (snaps at midpoint).
            sample().strokeTo({ weight: 28, fill: Fills.color('#E8617C'), dash: [60, 40], align: 'center' }, 1.2, { ease: easeInOutQuad }),
            // dashOffset: crawl the dashes one full pattern length (60 + 40) around the edge.
            sample().strokeTo({ weight: 28, fill: Fills.color('#E8617C'), dash: [60, 40], dashOffset: 100, align: 'center' }, 1.6, { ease: linear }),
            // dashOffset: keep crawling for continuous, loop-like motion.
            sample().strokeTo({ weight: 28, fill: Fills.color('#E8617C'), dash: [60, 40], dashOffset: 200, align: 'center' }, 1.6, { ease: linear }),
        );
    }
}
