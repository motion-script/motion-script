import { Fills, Rect, Line } from "@motion-script/core";
import { StrokeCardScene } from "./stroke-card";

/**
 * Shows `cap` and `join` side by side.
 *
 * Caps shape the *ends* of an open stroke, so they only read on an open
 * contour — the top row strokes a bare {@link Line} with each of `'butt'`,
 * `'round'`, and `'square'`. Joins shape *corners*, so the bottom row strokes a
 * sharp-cornered {@link Rect} (zero corner radius) with `'miter'`, `'round'`,
 * and `'bevel'` to make the difference obvious.
 */
export class CapJoinStrokeScene extends StrokeCardScene {
    readonly label = 'Stroke Cap & Join';

    *build() {
        this.set({ group: 'column', gap: 80, padding: 120 });

        const capFill = Fills.color('#6990DD');
        const joinFill = Fills.color('#6990DD', { opacity: 0.6 });

        this.add(<>
            {/* Caps — visible on the open line ends. */}
            <Rect group={'row'} gap={80} width={'fill'} height={120}>
                <Line points={[{ x: 0, y: 0 }, { x: 240, y: 0 }]}
                    stroke={{ weight: 40, fill: capFill, cap: 'butt' }} />
                <Line points={[{ x: 0, y: 0 }, { x: 240, y: 0 }]}
                    stroke={{ weight: 40, fill: capFill, cap: 'round' }} />
                <Line points={[{ x: 0, y: 0 }, { x: 240, y: 0 }]}
                    stroke={{ weight: 40, fill: capFill, cap: 'square' }} />
            </Rect>

            {/* Joins — visible at the rect corners. */}
            <Rect group={'row'} gap={80} width={'fill'} height={320}>
                <Rect fill={Fills.color('#161a21')} height={240} width={240}
                    stroke={{ weight: 32, fill: joinFill, join: 'miter', align: 'center' }} />
                <Rect fill={Fills.color('#161a21')} height={240} width={240}
                    stroke={{ weight: 32, fill: joinFill, join: 'round', align: 'center' }} />
                <Rect fill={Fills.color('#161a21')} height={240} width={240}
                    stroke={{ weight: 32, fill: joinFill, join: 'bevel', align: 'center' }} />
            </Rect>
        </>);
    }
}
