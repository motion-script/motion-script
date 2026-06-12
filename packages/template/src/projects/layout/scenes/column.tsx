/** @jsxImportSource @motion-script/core/jsx */

import { Scene, createRef, Rect, easeInOutQuad, parallel } from "@motion-script/core";
import { layoutCard, tile } from "./layout-card";

/**
 * Demonstrates `group="column"`: children stack top-to-bottom along the main
 * axis, separated by `gap`. The tiles grow their height in sequence so you can
 * watch the column reflow — siblings push down to make room as each one
 * expands, the defining behaviour of a vertical flex container.
 */
export class ColumnScene extends Scene {
    *build() {
        this.set({ fill: 'bg' });

        const refs = [createRef<Rect>(), createRef<Rect>(), createRef<Rect>()];
        const colors = ['#6990DD', '#E8617C', '#F5C26B'];

        this.add(
            layoutCard({
                label: 'group: column',
                stage: 'column',
                gap: 48,
                children: refs.map((ref, i) =>
                    tile({ ref, color: colors[i], width: 'fill', height: 140, label: `${i + 1}` })
                ),
            })
        );

        // Each tile grows in turn; the column reflows its siblings around it.
        yield* parallel(...refs.map((ref) => ref().to({ height: 220 }, 1.5, easeInOutQuad)));
        yield* parallel(...refs.map((ref) => ref().to({ height: 140 }, 1.5, easeInOutQuad)));
    }
}
