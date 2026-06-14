/** @jsxImportSource @motion-script/core/jsx */

import { Scene, createRef, Ellipse, Rect, easeInOutQuad, parallel, wait } from "@motion-script/core";
import { nodeCard } from "./node-card";

/**
 * Showcases the {@link Ellipse} node.
 * Full circle on the left; progress-ring arc on the right that sweeps from
 * 0 to 360 degrees.
 */
export class EllipseScene extends Scene {
    *build() {
        this.set({ fill: 'bg' });

        const ringRef = createRef<Ellipse>();
        const circleRef = createRef<Ellipse>();

        this.add(
            nodeCard({
                label: 'Ellipse',
                stage: 'row',
                gap: 80,
                children: (
                    <>
                        <Rect width={'fill'} height={'fill'} group={'stack'} cornerRadius={24} fill={'bg'}>
                            <Ellipse
                                ref={circleRef}
                                width={280}
                                height={280}
                                fill={'#6990DD'}
                            />
                        </Rect>
                        <Rect width={'fill'} height={'fill'} group={'stack'} cornerRadius={24} fill={'bg'}>
                            <Ellipse
                                ref={ringRef}
                                width={280}
                                height={280}
                                startAngle={-90}
                                sweep={0}
                                stroke={{ fill: '#E8617C', weight: 20 }}
                            />
                        </Rect>
                    </>
                ),
            })
        );

        yield* parallel(
            ringRef().to({ sweep: 360 }, 2.0, easeInOutQuad),
            circleRef().to({ sweep: 220 }, 1.5, easeInOutQuad),
        );
        yield* wait(0.5);
        yield* parallel(
            ringRef().to({ sweep: 0 }, 1.2, easeInOutQuad),
            circleRef().to({ sweep: 360 }, 1.0, easeInOutQuad),
        );
        yield* wait(0.5);
    }
}
