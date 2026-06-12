import { Fill, sequence, easeInOutQuad } from "@motion-script/core";
import { StrokeCardScene } from "./stroke-card";

/**
 * Sweeps a thick stroke's `align` across its full range so you can see where
 * the stroke sits relative to the shape's edge:
 *
 *  - `inside`  (-1): the band stays within the measured bounds (like a border),
 *  - `center`  ( 0): straddles the edge, half in / half out,
 *  - `outside` (+1): the band sits entirely outside the bounds.
 *
 * The shape keeps a solid fill so the boundary between fill and stroke makes the
 * placement obvious as it animates. `align` lerps numerically, so the band
 * slides smoothly outward rather than snapping.
 */
export class AlignmentStrokeScene extends StrokeCardScene {
    readonly label = 'Stroke Alignment';

    *build() {
        // A thick stroke painted inside the edge to start.
        const sample = this.card({
            fill: Fill.color('#161a21'),
            stroke: { weight: 48, fill: Fill.color('#6990DD'), align: 'inside' },
        });

        yield* sequence(
            // inside -> center: the band slides out to straddle the edge.
            sample().strokeTo({ fill: Fill.color('#F5C26B'), align: 'center' }, 1.6, { ease: easeInOutQuad }),
            // center -> outside: the band moves fully beyond the bounds.
            sample().strokeTo({ fill: Fill.color('#E8617C'), align: 'outside' }, 1.6, { ease: easeInOutQuad }),
            // back to inside for a clean loop.
            sample().strokeTo({ fill: Fill.color('#6990DD'), align: 'inside' }, 1.6, { ease: easeInOutQuad }),
        );
    }
}
