/** @jsxImportSource @motion-script/core/jsx */

import { Scene, createRef, LineGrid, Rect, Fills, easeInOutQuad, parallel, wait } from "@motion-script/core";
import { nodeCard } from "./node-card";

/**
 * Showcases the {@link LineGrid} node.
 * Left grid pans its origin diagonally. Right grid densifies its subdivisions
 * from 1 to 5 and has a contrasting subStroke.
 */
export class LineGridScene extends Scene {
    *build() {
        this.set({ fill: 'bg' });

        const panRef = createRef<LineGrid>();
        const fineRef = createRef<LineGrid>();

        this.add(
            nodeCard({
                label: 'LineGrid',
                stage: 'row',
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
                            shadow={{ fill: Fills.color('black', { opacity: 0.4 }), dx: 0, dy: 12, blur: 24 }}
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
                            shadow={{ fill: Fills.color('black', { opacity: 0.4 }), dx: 0, dy: 12, blur: 24 }}
                        />
                    </>
                ),
            })
        );

        yield* parallel(
            panRef().to({ origin: { x: 120, y: 120 } }, 2.0, easeInOutQuad),
            fineRef().to({ subdivisions: 5 }, 2.0, easeInOutQuad),
        );
        yield* parallel(
            panRef().to({ origin: { x: 0, y: 0 } }, 1.5, easeInOutQuad),
            fineRef().to({ subdivisions: 1 }, 1.5, easeInOutQuad),
        );
        yield* wait(0.5);
    }
}
