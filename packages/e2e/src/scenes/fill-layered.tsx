import { createRef, Rect, Fills, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** A node's `fill` accepts an array: solid base + gradient wash + noise grain, painted bottom-to-top. */
const rect = createRef<Rect>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
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
}, [
    () => rect().to(
        { fill: [...Fills.color('#23283a'), ...Fills.linearGradient(['#6990dd', 'transparent'], { opacity: 0.8 }), ...Fills.noise({ density: 0.5, opacity: 0.15 })] },
        1.4,
        easeInOut('quad'),
    ),
    holdTail(1.4),
]);
