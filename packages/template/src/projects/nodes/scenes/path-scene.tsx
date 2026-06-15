/** @jsxImportSource @motion-script/core/jsx */

import { Scene, createRef, Path, Rect, easeInOutQuad, parallel, wait } from "@motion-script/core";
import { nodeCard } from "./node-card";

/**
 * Showcases the {@link Path} node.
 * Three SVG paths with `end` animated from 0→1 to draw them on.
 * Left: a triangle. Center: a wave. Right: a heart.
 */
export class PathScene extends Scene {
    *build() {
        this.set({ fill: 'bg' });

        const triRef = createRef<Path>();
        const waveRef = createRef<Path>();
        const heartRef = createRef<Path>();

        this.add(
            nodeCard({
                label: 'Path',
                stage: 'row',
                gap: 64,
                children: (
                    <>
                        <Rect width={'fill'} height={'fill'} group={'stack'} cornerRadius={24} fill={'bg'}>
                            <Path
                                ref={triRef}
                                d={'M 0 -100 L 87 50 L -87 50 Z'}
                                fill={'#6990DD'}
                                end={0}
                            />
                        </Rect>
                        <Rect width={'fill'} height={'fill'} group={'stack'} cornerRadius={24} fill={'bg'}>
                            <Path
                                ref={waveRef}
                                d={'M -120 0 C -80 -80 -40 80 0 0 C 40 -80 80 80 120 0'}
                                stroke={{ fill: '#F5C26B', weight: 8 }}
                                end={0}
                            />
                        </Rect>
                        <Rect width={'fill'} height={'fill'} group={'stack'} cornerRadius={24} fill={'bg'}>
                            <Path
                                ref={heartRef}
                                d={'M 0 40 C -70 -20 -90 -70 0 -20 C 90 -70 70 -20 0 40 Z'}
                                fill={'#E8617C'}
                                end={0}
                            />
                        </Rect>
                    </>
                ),
            })
        );

        yield* parallel(
            triRef().to({ end: 1 }, 1.2, easeInOutQuad),
            waveRef().to({ end: 1 }, 1.6, easeInOutQuad),
            heartRef().to({ end: 1 }, 1.4, easeInOutQuad),
        );
        yield* wait(0.8);
        yield* parallel(
            triRef().to({ end: 0 }, 1.0, easeInOutQuad),
            waveRef().to({ end: 0 }, 1.2, easeInOutQuad),
            heartRef().to({ end: 0 }, 1.0, easeInOutQuad),
        );
        yield* wait(0.3);
    }
}
