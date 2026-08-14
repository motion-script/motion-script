

import { createScene, createRef, RichText, Rect, easeInOut, wait } from "motion-script";
import { nodeCard } from "./node-card";

/**
 * Showcases the {@link RichText} node.
 * Multiple spans with different fills, weights, and sizes — all driven from
 * a single node, with the font size animating up on the highlighted word.
 */
export default createScene(function* (stage) {
        stage.set({ fill: 'bg' });

        const ref = createRef<RichText>();

        stage.add(
            nodeCard({
                label: 'RichText',
                stage: 'freeform',
                children: (
                    <RichText
                        ref={ref}
                        fontSize={52}
                        textAlign={'center'}
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

        yield* ref().to({ fontSize: 64 }, 1.2, easeInOut('quad'));
        yield* ref().to({ fontSize: 40 }, 0.8, easeInOut('quad'));
        yield* wait(1);
});
