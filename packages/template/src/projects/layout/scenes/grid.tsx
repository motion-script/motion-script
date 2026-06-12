/** @jsxImportSource @motion-script/core/jsx */

import { Scene, createRef, Rect, easeInOutQuad, parallel, sequence, wait } from "@motion-script/core";
import { layoutCard, tile } from "./layout-card";

/**
 * Demonstrates building a grid from nested flex containers. There's no
 * dedicated `grid` group mode — a grid is just a `column` of `row`s, where
 * every cell is a `flex` tile so the columns stay aligned and the rows share
 * height evenly. This is the canonical way to lay out a uniform matrix of
 * elements with the flex primitives.
 *
 * Each cell pulses its corner radius in a staggered wave that ripples across
 * the grid, making the regular row/column structure easy to read.
 */
export class GridScene extends Scene {
    private readonly size = 3;

    *build() {
        this.set({ fill: 'bg' });

        const palette = ['#6990DD', '#E8617C', '#F5C26B'];
        // One entry per cell, carrying its ref and diagonal index (r + c) so we
        // can ripple the wave across the grid corner-to-corner.
        const cells: { ref: ReturnType<typeof createRef<Rect>>; diag: number }[] = [];

        const rows = Array.from({ length: this.size }, (_, r) => (
            <Rect width={'fill'} height={'fill'} group={'row'} gap={32}>
                {Array.from({ length: this.size }, (_, c) => {
                    const ref = createRef<Rect>();
                    cells.push({ ref, diag: r + c });
                    return tile({
                        ref,
                        color: palette[(r + c) % palette.length],
                        width: 'fill', height: 'fill', flex: 1,
                        borderRadius: 24,
                    });
                })}
            </Rect>
        ));

        this.add(
            layoutCard({
                label: 'Grid (column of rows)',
                stage: 'column',
                gap: 32,
                children: rows,
            })
        );

        // Ripple the corner radius diagonally across the grid (no `stagger`
        // helper exists, so the delay is a per-cell `wait` ahead of the tween),
        // then settle every cell back at once.
        yield* parallel(
            ...cells.map(({ ref, diag }) =>
                sequence(
                    wait(diag * 0.12),
                    ref().to({ borderRadius: 160 }, 1.2, easeInOutQuad),
                )
            ),
        );
        yield* parallel(...cells.map(({ ref }) => ref().to({ borderRadius: 24 }, 1, easeInOutQuad)));
    }
}
