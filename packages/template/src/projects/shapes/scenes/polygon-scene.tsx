/** @jsxImportSource @motion-script/core/jsx */

import { Scene, createRef, Rect, Text, Polygon, wait, Fill } from "@motion-script/core";

/**
 * A {@link Text} node with `fontSize: 'autofit'` that re-fits its size to the
 * available box as its content grows. The tweens change, append and prepend
 * text so the font scales down to keep everything inside the stroked frame.
 */
export class PolygonScene extends Scene {
    readonly label = 'Autofit Text';

    *build() {
        this.set({ fill: 'bg' });

        const ref = createRef<Polygon>();

        this.add(
            <Polygon ref={ref} fill={'red'} width={400} height={400} borderRadius={20} shadow={{ inner: true, fill: Fill.color('white', { opacity: 1 }), dx: 10, dy: 0, blur: 10 }} >
            </Polygon>
        );

        yield* wait(2);
    }
}
