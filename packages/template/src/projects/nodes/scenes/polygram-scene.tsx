/** @jsxImportSource @motion-script/core/jsx */

import { createScene, createRef, Polygram, Rect, easeInOut, parallel, wait } from "@motion-script/core";
import { nodeCard } from "./node-card";

/**
 * Showcases the {@link Polygram} node.
 * Animates `ratio` to collapse and sharpen the star points, then morphs
 * the sides count and rounds the vertices.
 */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });

    const leftRef = createRef<Polygram>();
    const rightRef = createRef<Polygram>();

    stage.add(
        nodeCard({
            label: 'Polygram',
            stage: 'row',
            gap: 80,
            children: (
                <>
                    <Rect width={'fill'} height={'fill'} group={'stack'} cornerRadius={24} fill={'bg'}>
                        <Polygram
                            ref={leftRef}
                            sides={5}
                            ratio={0.85}
                            width={280}
                            height={280}
                            fill={'#F5C26B'}
                        />
                    </Rect>
                    <Rect width={'fill'} height={'fill'} group={'stack'} cornerRadius={24} fill={'bg'}>
                        <Polygram
                            ref={rightRef}
                            sides={6}
                            ratio={0.5}
                            width={280}
                            height={280}
                            fill={'#E8617C'}
                            cornerRadius={0}
                        />
                    </Rect>
                </>
            ),
        })
    );

    yield* parallel(
        leftRef().to({ ratio: 0.35 }, 1.5, easeInOut('quad')),
        rightRef().to({ cornerRadius: 18 }, 1.2, easeInOut('quad')),
    );
    yield* parallel(
        leftRef().to({ sides: 8, ratio: 0.6 }, 1.5, easeInOut('quad')),
        rightRef().to({ sides: 4, ratio: 0.4 }, 1.5, easeInOut('quad')),
    );
    yield* wait(0.8);
});
