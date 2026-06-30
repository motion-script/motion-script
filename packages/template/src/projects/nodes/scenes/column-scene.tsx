

import { createScene, createRef, Column, Rect, Text, easeInOut, parallel, wait } from "motion-script";
import { nodeCard } from "./node-card";

/**
 * Showcases the {@link Column} node.
 * Three coloured tiles stacked top-to-bottom. Gap expands, and the middle
 * tile grows its height so the column reflows around it.
 */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });

    const colRef = createRef<Column>();
    const tileRefs = [createRef<Rect>(), createRef<Rect>(), createRef<Rect>()];
    const colors = ['#6990DD', '#E8617C', '#F5C26B'];

    stage.add(
        nodeCard({
            label: 'Column',
            stage: 'stack',
            children: (
                <Column ref={colRef} gap={24} align={{ x: 0, y: 0 }}>
                    {tileRefs.map((ref, i) => (
                        <Rect
                            ref={ref}
                            width={240}
                            height={120}
                            fill={colors[i]}
                            cornerRadius={20}
                            group={'stack'}
                        >
                            <Text
                                fontFamily={'Pixelify Sans'}
                                text={`${i + 1}`}
                                fontSize={56}
                                fill={'bg'}
                            />
                        </Rect>
                    ))}
                </Column>
            ),
        })
    );

    yield* colRef().to({ gap: 48 }, 1.0, easeInOut('quad'));
    yield* parallel(
        colRef().to({ align: { x: -1, y: 0 } }, 0.8, easeInOut('quad')),
        tileRefs[1]().to({ width: 360 }, 0.8, easeInOut('quad')),
    );
    yield* parallel(
        colRef().to({ align: { x: 0, y: 0 }, gap: 24 }, 1.0, easeInOut('quad')),
        tileRefs[1]().to({ width: 240 }, 0.8, easeInOut('quad')),
    );
    yield* wait(0.5);
});
