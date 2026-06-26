/** @jsxImportSource @motion-script/core/jsx */

import { createScene, createRef, Ellipse, Rect, easeInOut, parallel, wait, Fills } from "@motion-script/core";
import { nodeCard } from "./node-card";

/**
 * Showcases the {@link Ellipse} node.
 * Full circle on the left; progress-ring arc on the right that sweeps from
 * 0 to 360 degrees.
 */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });

    const ringRef = createRef<Ellipse>();
    const circleRef = createRef<Ellipse>();

    stage.add(
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
                            fill={Fills.color('red', { opacity: 1 })}
                            stroke={{ fill: Fills.color('white', { opacity: 0.4, }), weight: 20, align: 'inside' }}
                        />
                    </Rect>
                </>
            ),
        })
    );

    yield* parallel(
        ringRef().to({ sweep: 360 }, 2.0, easeInOut('quad')),
        circleRef().to({ sweep: 220 }, 1.5, easeInOut('quad')),
    );
    yield* wait(0.5);
    yield* parallel(
        ringRef().to({ sweep: 0 }, 1.2, easeInOut('quad')),
        circleRef().to({ sweep: 360 }, 1.0, easeInOut('quad')),
    );

    yield* wait(0.3);
});
