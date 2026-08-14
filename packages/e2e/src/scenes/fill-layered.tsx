import { createScene, createRef, Rect, Fills, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/** A node's `fill` accepts an array: solid base + gradient wash + noise grain, painted bottom-to-top. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const rect = createRef<Rect>();
    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'freeform'} align={{ x: 0, y: 0 }}>
            <Rect
                ref={rect}
                width={360}
                height={240}
                cornerRadius={20}
                fill={[
                    ...Fills.color('#23283a'),
                    ...Fills.linearGradient(['#6990dd', 'transparent'], { opacity: 0 }),
                    ...Fills.noise({ density: 0.5, opacity: 0.15 }),
                ]}
            />
        </Rect>,
    );

    yield* rect().to(
        { fill: [...Fills.color('#23283a'), ...Fills.linearGradient(['#6990dd', 'transparent'], { opacity: 0.8 }), ...Fills.noise({ density: 0.5, opacity: 0.15 })] },
        1.4,
        easeInOut('quad'),
    );
    yield* holdTail(1.4);
});
