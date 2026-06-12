/** @jsxImportSource @motion-script/core/jsx */

import { Scene, createRef, Rect, easeInOutQuad, parallel } from "@motion-script/core";
import { layoutCard, tile } from "./layout-card";

/**
 * Demonstrates `group="row"`: children lay out left-to-right along the main
 * axis, separated by `gap`. The tiles grow their width in sequence so you can
 * watch the row reflow — siblings shove sideways to make room as each one
 * expands, the defining behaviour of a horizontal flex container.
 */
export class RowScene extends Scene {
    *build() {
        this.set({ fill: 'bg' });

        const refs = [createRef<Rect>(), createRef<Rect>(), createRef<Rect>()];
        const colors = ['#6990DD', '#E8617C', '#F5C26B'];

        this.add(
            layoutCard({
                label: 'group: row',
                stage: 'row',
                gap: 48,
                children: refs.map((ref, i) =>
                    tile({ ref, color: colors[i], width: 240, height: 'fill', label: `${i + 1}` })
                ),
            })
        );

        // Each tile swells in turn; the row reflows its siblings around it.
        yield* parallel(...refs.map((ref) => ref().to({ width: 360 }, 1.5, easeInOutQuad)));
        yield* parallel(...refs.map((ref) => ref().to({ width: 240 }, 1.5, easeInOutQuad)));
    }
}
