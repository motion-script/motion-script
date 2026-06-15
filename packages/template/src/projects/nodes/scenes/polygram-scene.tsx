/** @jsxImportSource @motion-script/core/jsx */

import { Scene, createRef, Polygram, Rect, easeInOutQuad, parallel, wait } from "@motion-script/core";
import { nodeCard } from "./node-card";

/**
 * Showcases the {@link Polygram} node.
 * Animates `ratio` to collapse and sharpen the star points, then morphs
 * the sides count and rounds the vertices.
 */
export class PolygramScene extends Scene {
    *build() {
        this.set({ fill: 'bg' });

        const leftRef = createRef<Polygram>();
        const rightRef = createRef<Polygram>();

        this.add(
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
            leftRef().to({ ratio: 0.35 }, 1.5, easeInOutQuad),
            rightRef().to({ cornerRadius: 18 }, 1.2, easeInOutQuad),
        );
        yield* parallel(
            leftRef().to({ sides: 8, ratio: 0.6 }, 1.5, easeInOutQuad),
            rightRef().to({ sides: 4, ratio: 0.4 }, 1.5, easeInOutQuad),
        );
        yield* wait(0.8);
    }
}
