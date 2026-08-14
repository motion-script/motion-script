

import { createScene, createRef, LineGrid, Rect, Fills, easeInOut, parallel, wait } from "motion-script";
import { nodeCard } from "./node-card";

/**
 * Showcases the {@link LineGrid} node.
 * Left grid pans its origin diagonally. Right grid densifies its subdivisions
 * from 1 to 5 and has a contrasting subStroke.
 */
export default createScene(function* (stage) {
        stage.set({ fill: 'bg' });

        const panRef = createRef<LineGrid>();
        const fineRef = createRef<LineGrid>();

        stage.add(
            nodeCard({
                label: 'LineGrid',
                stage: 'horizontal',
                gap: 64,
                padding: 64,
                children: (
                    <>
                        <LineGrid
                            ref={panRef}
                            width={'fill'}
                            height={'fill'}
                            divisions={4}
                            subdivisions={2}
                            fill={Fills.color('bg')}
                            stroke={{ weight: 6, fill: '#6990DD' }}
                            shadow={{ fill: Fills.color('black', { opacity: 0.4 }), offset: { x: 0, y: 12 }, blur: 24 }}
                        />
                        <LineGrid
                            ref={fineRef}
                            width={'fill'}
                            height={'fill'}
                            divisions={4}
                            subdivisions={1}
                            fill={Fills.color('bg')}
                            stroke={{ weight: 3, fill: '#C77DFF' }}
                            subStroke={{ weight: 1, fill: '#C77DFF', dash: 6 }}
                            shadow={{ fill: Fills.color('black', { opacity: 0.4 }), offset: { x: 0, y: 12 }, blur: 24 }}
                        />
                    </>
                ),
            })
        );

        yield* parallel(
            panRef().to({ offset: { x: 120, y: 120 } }, 2.0, easeInOut('quad')),
            fineRef().to({ subdivisions: 5 }, 2.0, easeInOut('quad')),
        );
        yield* parallel(
            panRef().to({ offset: { x: 0, y: 0 } }, 1.5, easeInOut('quad')),
            fineRef().to({ subdivisions: 1 }, 1.5, easeInOut('quad')),
        );
        yield* wait(0.5);
});
