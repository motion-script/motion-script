/** @jsxImportSource @motion-script/core/jsx */

import { Scene, createRef, RichText, Rect, easeInOutQuad, wait } from "@motion-script/core";
import { nodeCard } from "./node-card";

/**
 * Showcases the {@link RichText} node.
 * Multiple spans with different fills, weights, and sizes — all driven from
 * a single node, with the font size animating up on the highlighted word.
 */
export class RichTextScene extends Scene {
    *build() {
        this.set({ fill: 'bg' });

        const ref = createRef<RichText>();

        this.add(
            nodeCard({
                label: 'RichText',
                stage: 'stack',
                children: (
                    <RichText
                        ref={ref}
                        fontSize={52}
                        align={'center'}
                        spans={[
                            { text: 'Mix ', fill: 'white', fontWeight: 300 },
                            { text: 'styles', fill: '#6990DD', fontWeight: 800, fontSize: 52 },
                            { text: ' in a ', fill: 'white', fontWeight: 300 },
                            { text: 'single', fill: '#E8617C', fontWeight: 800, fontSize: 52 },
                            { text: ' node', fill: 'white', fontWeight: 300 },
                        ]}
                    />
                ),
            })
        );

        yield* ref().to({ fontSize: 64 }, 1.2, easeInOutQuad);
        yield* ref().to({ fontSize: 40 }, 0.8, easeInOutQuad);
        yield* wait(1);
    }
}
