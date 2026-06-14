/** @jsxImportSource @motion-script/core/jsx */

import { Scene, createRef, Rect, Text, Polygon, wait, Fills } from "@motion-script/core";

/**
 * A {@link Text} node with `fontSize: 'autofit'` that re-fits its size to the
 * available box as its content grows. The tweens change, append and prepend
 * text so the font scales down to keep everything inside the stroked frame.
 */
export class PolygonScene extends Scene {
    readonly label = 'Autofit Text';

    *build() {
        this.set({ fill: 'white' });

        const ref = createRef<Rect>();

        this.add(
            <Rect ref={ref} fill={'red'} width={400} height={400} cornerRadius={20} shadow={{ fill: Fills.color('black', { opacity: 1 }), dx: 10, dy: 10, blur: 0, spread: 100, inner: true }} >
            </Rect>
        );

        yield* wait(2);
    }
}
