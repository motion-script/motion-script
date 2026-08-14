

import { createScene, createRef, Grid, Rect, easeInOut, parallel, wait } from "motion-script";
import { nodeCard } from "./node-card";

/**
 * Showcases the {@link Grid} node.
 * A 3-column grid of cards. Animates `columns` from 3 → 2, then gap expansion,
 * and a colSpan spanning cell.
 */
export default createScene(function* (stage) {
        stage.set({ fill: 'bg' });

        const gridRef = createRef<Grid>();
        const palette = ['#6990DD', '#E8617C', '#F5C26B', '#C77DFF', '#4CAF82', '#FF8C42'];

        stage.add(
            nodeCard({
                label: 'Grid',
                stage: 'freeform',
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

        yield* gridRef().to({ gap: 40 }, 1.0, easeInOut('quad'));
        yield* gridRef().to({ columns: 2 }, 1.2, easeInOut('quad'));
        yield* gridRef().to({ columns: 3, gap: 20 }, 1.2, easeInOut('quad'));
        yield* wait(0.5);
});
