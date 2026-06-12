/** @jsxImportSource @motion-script/core/jsx */

import { Scene, createRef, Rect, easeInOutQuad, parallel } from "@motion-script/core";
import { layoutCard, tile } from "./layout-card";

/**
 * Demonstrates `group="stack"`: children overlap, each centered in the content
 * box and offset by its own `x`/`y` (rather than flowing along an axis). The
 * three tiles start piled exactly on top of one another, then fan out via
 * their offsets and slide back — showing that in a stack, position is owned by
 * the child, not distributed by the container.
 */
export class StackScene extends Scene {
    *build() {
        this.set({ fill: 'bg' });

        const back = createRef<Rect>();
        const mid = createRef<Rect>();
        const front = createRef<Rect>();

        this.add(
            layoutCard({
                label: 'group: stack',
                stage: 'stack',
                children: [
                    tile({ ref: back, color: '#6990DD', width: 320, height: 320 }),
                    tile({ ref: mid, color: '#E8617C', width: 320, height: 320 }),
                    tile({ ref: front, color: '#F5C26B', width: 320, height: 320 }),
                ],
            })
        );

        // Fan the pile out via per-child offsets, then collapse it back.
        yield* parallel(
            back().to({ x: -260, y: -120 }, 1.5, easeInOutQuad),
            front().to({ x: 260, y: 120 }, 1.5, easeInOutQuad),
        );
        yield* parallel(
            back().to({ x: 0, y: 0 }, 1.5, easeInOutQuad),
            front().to({ x: 0, y: 0 }, 1.5, easeInOutQuad),
        );
    }
}
