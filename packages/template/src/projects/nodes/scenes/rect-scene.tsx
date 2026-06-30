

import { createScene, createRef, Rect, Text, easeInOut, parallel, wait } from "motion-script";
import { nodeCard } from "./node-card";

/**
 * Showcases the {@link Rect} node.
 * Shows rounded corners, corner style animation, and the group layout modes
 * animating between row and column.
 */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });

    const containerRef = createRef<Rect>();
    const cornerRef = createRef<Rect>();

    stage.add(
        nodeCard({
            label: 'Rect',
            stage: 'row',
            gap: 40,
            children: (
                <>
                    {/* Layout demo */}
                    <Rect
                        ref={containerRef}
                        width={'fill'}
                        height={'fill'}
                        fill={'bg'}
                        cornerRadius={stage.variables<number>('rounded-lg')}
                        group={'row'}
                        gap={24}
                        padding={32}
                    >
                        <Rect width={'fill'} height={'fill'} fill={'#6990DD'} cornerRadius={16} />
                        <Rect width={'fill'} height={'fill'} fill={'#E8617C'} cornerRadius={16} />
                        <Rect width={'fill'} height={'fill'} fill={'#F5C26B'} cornerRadius={16} />
                    </Rect>

                    {/* Corner style demo */}
                    <Rect
                        ref={cornerRef}
                        width={320}
                        height={320}
                        fill={'#6990DD'}
                        cornerRadius={0}
                        cornerStyle={'rounded'}
                    />
                </>
            ),
        })
    );

    yield* parallel(
        containerRef().to({ group: 'column' }, 1.2, easeInOut('quad')),
        cornerRef().to({ cornerRadius: 64 }, 1.0, easeInOut('quad')),
    );

    yield* parallel(
        containerRef().to({ group: 'row' }, 1.2, easeInOut('quad')),
        cornerRef().to({ cornerStyle: 'angled' }, 0.8, easeInOut('quad')),
    );

    yield* wait(0.8);
});
