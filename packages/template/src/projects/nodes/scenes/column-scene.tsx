/** @jsxImportSource @motion-script/core/jsx */

import { Scene, createRef, Column, Rect, Text, easeInOutQuad, parallel, wait } from "@motion-script/core";
import { nodeCard } from "./node-card";

/**
 * Showcases the {@link Column} node.
 * Three coloured tiles stacked top-to-bottom. Gap expands, and the middle
 * tile grows its height so the column reflows around it.
 */
export class ColumnScene extends Scene {
    *build() {
        this.set({ fill: 'bg' });

        const colRef = createRef<Column>();
        const tileRefs = [createRef<Rect>(), createRef<Rect>(), createRef<Rect>()];
        const colors = ['#6990DD', '#E8617C', '#F5C26B'];

        this.add(
            nodeCard({
                label: 'Column',
                stage: 'stack',
                children: (
                    <Column ref={colRef} gap={24} alignment={{ x: 0, y: 0 }}>
                        {tileRefs.map((ref, i) => (
                            <Rect
                                ref={ref}
                                key={i}
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

        yield* colRef().to({ gap: 48 }, 1.0, easeInOutQuad);
        yield* parallel(
            colRef().to({ alignment: { x: -1, y: 0 } }, 0.8, easeInOutQuad),
            tileRefs[1]().to({ width: 360 }, 0.8, easeInOutQuad),
        );
        yield* parallel(
            colRef().to({ alignment: { x: 0, y: 0 }, gap: 24 }, 1.0, easeInOutQuad),
            tileRefs[1]().to({ width: 240 }, 0.8, easeInOutQuad),
        );
        yield* wait(0.5);
    }
}
