/** @jsxImportSource @motion-script/core/jsx */

import { Scene, createRef, Rect, easeInOutQuad, parallel } from "@motion-script/core";
import { layoutCard, tile } from "./layout-card";

/**
 * Demonstrates a `Rect` that *has* children. With children present, an
 * unspecified width/height defaults to `hug`, so the container shrink-wraps to
 * its content (plus `padding`). Here the outer rect hugs a row of three tiles;
 * as the middle tile grows and shrinks, the hugging parent grows and shrinks
 * with it — the wrapper has no size of its own, it's defined entirely by what's
 * inside it.
 */
export class RectWithChildrenScene extends Scene {
    *build() {
        this.set({ fill: 'bg' });

        const middle = createRef<Rect>();

        this.add(
            layoutCard({
                label: 'Rect with children (hug)',
                stage: 'stack',
                children: (
                    // No width/height: defaults to `hug`, so this wraps the row.
                    <Rect
                        group={'row'} gap={32} padding={48}
                        fill={'#161a21'} stroke={{ weight: 4, fill: 'primary' }} cornerRadius={32}
                    >
                        {tile({ color: '#6990DD', width: 200, height: 200 })}
                        {tile({ ref: middle, color: '#E8617C', width: 200, height: 200 })}
                        {tile({ color: '#F5C26B', width: 200, height: 200 })}
                    </Rect>
                ),
            })
        );

        // Grow then shrink the middle tile; the hugging wrapper resizes with it.
        yield* parallel(middle().to({ width: 380, height: 320 }, 2, easeInOutQuad));
        yield* parallel(middle().to({ width: 200, height: 200 }, 2, easeInOutQuad));
    }
}
