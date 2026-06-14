/** @jsxImportSource @motion-script/core/jsx */

import { Scene, createRef, Polygon, Rect, easeInOutQuad, parallel, wait } from "@motion-script/core";
import { nodeCard } from "./node-card";

/**
 * Showcases the {@link Polygon} node.
 * Morphs sides from triangle → hexagon, then rounds and chamfers the vertices.
 */
export class PolygonScene extends Scene {
    *build() {
        this.set({ fill: 'bg' });

        const leftRef = createRef<Polygon>();
        const rightRef = createRef<Polygon>();

        this.add(
            nodeCard({
                label: 'Polygon',
                stage: 'row',
                gap: 80,
                children: (
                    <>
                        <Rect width={'fill'} height={'fill'} group={'stack'} cornerRadius={24} fill={'bg'}>
                            <Polygon
                                ref={leftRef}
                                sides={3}
                                width={280}
                                height={280}
                                fill={'#6990DD'}
                            />
                        </Rect>
                        <Rect width={'fill'} height={'fill'} group={'stack'} cornerRadius={24} fill={'bg'}>
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
            leftRef().to({ sides: 6 }, 1.5, easeInOutQuad),
            rightRef().to({ cornerRadius: 28 }, 1.2, easeInOutQuad),
        );
        yield* parallel(
            leftRef().to({ sides: 3 }, 1.5, easeInOutQuad),
            rightRef().to({ cornerStyle: 'angled' }, 0.8, easeInOutQuad),
        );
        yield* wait(0.5);
    }
}
