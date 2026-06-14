import { Fill, sequence, easeInOutQuad, Rect } from "@motion-script/core";
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
        this.set({ group: 'row', gap: 40, padding: 120 })
        // A thick stroke painted inside the edge to start.
        this.add(<>
            <Rect fill={Fill.color('#161a21')} height={320} width={320}
                stroke={{ weight: 16, fill: Fill.color('#6990DD', { opacity: 0.3 }), align: 'inside' }} />
            <Rect fill={Fill.color('#161a21')} height={320} width={320}
                stroke={{ weight: 16, fill: Fill.color('#6990DD', { opacity: 0.3 }), align: 'center' }} />
            <Rect fill={Fill.color('#161a21')} height={320} width={320}
                stroke={{ weight: 16, fill: Fill.color('#6990DD', { opacity: 0.3 }), align: 'outside' }} />
        </>)
    }
}
