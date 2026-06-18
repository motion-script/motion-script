/** @jsxImportSource @motion-script/core/jsx */

import { Scene, createRef, Grid, Rect, easeInOutQuad, parallel, wait } from "@motion-script/core";
import { nodeCard } from "./node-card";

/**
 * Showcases the {@link Grid} node.
 * A 3-column grid of cards. Animates `columns` from 3 → 2, then gap expansion,
 * and a colSpan spanning cell.
 */
export class GridScene extends Scene {
    *build() {
        this.set({ fill: 'bg' });

        const gridRef = createRef<Grid>();
        const palette = ['#6990DD', '#E8617C', '#F5C26B', '#C77DFF', '#4CAF82', '#FF8C42'];

        this.add(
            nodeCard({
                label: 'Grid',
                stage: 'stack',
                children: (
                    <Grid
                        ref={gridRef}
                        columns={3}
                        gap={20}
                        width={720}
                        height={480}
                    >
                        {palette.map((color, i) => (
                            <Rect
                                key={i}
                                width={'fill'}
                                height={'fill'}
                                fill={color}
                                cornerRadius={16}
                                colSpan={i === 3 ? 2 : 1}
                            />
                        ))}
                    </Grid>
                ),
            })
        );

        yield* gridRef().to({ gap: 40 }, 1.0, easeInOutQuad);
        yield* gridRef().to({ columns: 2 }, 1.2, easeInOutQuad);
        yield* gridRef().to({ columns: 3, gap: 20 }, 1.2, easeInOutQuad);
        yield* wait(0.5);
    }
}
