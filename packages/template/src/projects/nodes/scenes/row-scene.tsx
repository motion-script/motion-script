/** @jsxImportSource @motion-script/core/jsx */

import { createScene, createRef, Row, Rect, Text, easeInOut, parallel, wait } from "@motion-script/core";
import { nodeCard } from "./node-card";

/**
 * Showcases the {@link Row} node.
 * Three coloured tiles laid out left-to-right. Gap expands and contracts,
 * and alignment shifts from centered to top-aligned.
 */
export default createScene(function* (stage) {
        stage.set({ fill: 'bg' });

        const rowRef = createRef<Row>();
        const tileRefs = [createRef<Rect>(), createRef<Rect>(), createRef<Rect>()];
        const colors = ['#6990DD', '#E8617C', '#F5C26B'];

        stage.add(
            nodeCard({
                label: 'Row',
                stage: 'stack',
                children: (
                    <Row ref={rowRef} gap={24} align={{ x: 0, y: 0 }}>
                        {tileRefs.map((ref, i) => (
                            <Rect
                                ref={ref}
                                key={i}
                                width={180}
                                height={180}
                                fill={colors[i]}
                                cornerRadius={20}
                                group={'stack'}
                            >
                                <Text
                                    fontFamily={'Pixelify Sans'}
                                    text={`${i + 1}`}
                                    fontSize={64}
                                    fill={'bg'}
                                />
                            </Rect>
                        ))}
                    </Row>
                ),
            })
        );

        yield* rowRef().to({ gap: 64 }, 1.0, easeInOut('quad'));
        yield* parallel(
            rowRef().to({ align: 'topCenter' }, 0.8, easeInOut('quad')),
            tileRefs[1]().to({ height: 280 }, 0.8, easeInOut('quad')),
        );
        yield* parallel(
            rowRef().to({ align: { x: 0, y: 0 }, gap: 24 }, 1.0, easeInOut('quad')),
            tileRefs[1]().to({ height: 180 }, 0.8, easeInOut('quad')),
        );
        yield* wait(0.5);
});
