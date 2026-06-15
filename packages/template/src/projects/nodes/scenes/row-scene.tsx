/** @jsxImportSource @motion-script/core/jsx */

import { Scene, createRef, Row, Rect, Text, easeInOutQuad, parallel, wait } from "@motion-script/core";
import { nodeCard } from "./node-card";

/**
 * Showcases the {@link Row} node.
 * Three coloured tiles laid out left-to-right. Gap expands and contracts,
 * and alignment shifts from centered to top-aligned.
 */
export class RowScene extends Scene {
    *build() {
        this.set({ fill: 'bg' });

        const rowRef = createRef<Row>();
        const tileRefs = [createRef<Rect>(), createRef<Rect>(), createRef<Rect>()];
        const colors = ['#6990DD', '#E8617C', '#F5C26B'];

        this.add(
            nodeCard({
                label: 'Row',
                stage: 'stack',
                children: (
                    <Row ref={rowRef} gap={24} alignment={{ x: 0, y: 0 }}>
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

        yield* rowRef().to({ gap: 64 }, 1.0, easeInOutQuad);
        yield* parallel(
            rowRef().to({ alignment: { x: 0, y: -1 } }, 0.8, easeInOutQuad),
            tileRefs[1]().to({ height: 280 }, 0.8, easeInOutQuad),
        );
        yield* parallel(
            rowRef().to({ alignment: { x: 0, y: 0 }, gap: 24 }, 1.0, easeInOutQuad),
            tileRefs[1]().to({ height: 180 }, 0.8, easeInOutQuad),
        );
        yield* wait(0.5);
    }
}
