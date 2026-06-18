/** @jsxImportSource @motion-script/core/jsx */

import { Scene, createRef, Rect, easeInOutQuad } from "@motion-script/core";
import { layoutCard } from "./layout-card";

/**
 * Demonstrates a leaf `Rect` — one with no children. With no content to hug, an
 * unspecified width/height defaults to `fill`, but here we give it explicit
 * fixed dimensions so it's a plain drawn rectangle: just a fill, stroke, and
 * border radius. It animates its own size, corner rounding, and color to show
 * that a childless rect is simply a shape, with no layout role at all.
 */
export class RectWithoutChildrenScene extends Scene {
    *build() {
        this.set({ fill: 'bg' });

        const box = createRef<Rect>();

        this.add(
            layoutCard({
                label: 'Rect without children (shape)',
                stage: 'stack',
                children: (
                    <Rect
                        ref={box}
                        width={300} height={300}
                        fill={'#6990DD'} cornerRadius={24}
                        stroke={{ weight: 8, fill: '#F5C26B' }}
                    />
                ),
            })
        );

        // A childless rect is just a shape: tween its size, rounding, and fill.
        yield* box().to({ width: 560, height: 560, cornerRadius: 280, fill: '#E8617C' }, 2, easeInOutQuad);
        yield* box().to({ width: 300, height: 300, cornerRadius: 24, fill: '#6990DD' }, 2, easeInOutQuad);
    }
}
