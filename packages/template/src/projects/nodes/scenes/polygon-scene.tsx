

import { createScene, createRef, Polygon, Rect, easeInOut, parallel, wait } from "motion-script";
import { nodeCard } from "./node-card";

/**
 * Showcases the {@link Polygon} node.
 * Morphs sides from triangle → hexagon, then rounds and chamfers the vertices.
 */
export default createScene(function* (stage) {
        stage.set({ fill: 'bg' });

        const leftRef = createRef<Polygon>();
        const rightRef = createRef<Polygon>();

        stage.add(
            nodeCard({
                label: 'Polygon',
                stage: 'horizontal',
                gap: 80,
                children: (
                    <>
                        <Rect width={'fill'} height={'fill'} flow={'freeform'} cornerRadius={24} fill={'bg'}>
                            <Polygon
                                ref={leftRef}
                                sides={3}
                                width={280}
                                height={280}
                                fill={'#6990DD'}
                            />
                        </Rect>
                        <Rect width={'fill'} height={'fill'} flow={'freeform'} cornerRadius={24} fill={'bg'}>
                            <Polygon
                                ref={rightRef}
                                sides={5}
                                width={280}
                                height={280}
                                fill={'#F5C26B'}
                                cornerRadius={0}
                            />
                        </Rect>
                    </>
                ),
            })
        );

        yield* parallel(
            leftRef().to({ sides: 6 }, 1.5, easeInOut('quad')),
            rightRef().to({ cornerRadius: 28 }, 1.2, easeInOut('quad')),
        );
        yield* parallel(
            leftRef().to({ sides: 3 }, 1.5, easeInOut('quad')),
            rightRef().to({ cornerStyle: 'angled' }, 0.8, easeInOut('quad')),
        );
        yield* wait(0.5);
});
