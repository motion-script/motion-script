import { createScene, createRef, Rect, Fills, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/**
 * Fill-level `blend` on a layered fill stack: a base color layer plus a
 * `'multiply'`-blended gradient layer plus a `'screen'`-blended noise layer,
 * all composited within one fill via `Fills.color/linearGradient/noise`
 * concatenation, with the gradient and noise layers' opacity ramping in.
 */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const card = createRef<Rect>();
    stage.add(
        <Rect
            ref={card}
            width={360}
            height={240}
            cornerRadius={20}
            fill={[
                ...Fills.color('#3a4a6b'),
                ...Fills.linearGradient(['#e8617c', '#f2c94c'], { blend: 'multiply', opacity: 0 }),
                ...Fills.noise({ color: '#ffffff', density: 0.4, blend: 'screen', opacity: 0 }),
            ]}
            center={() => stage.root.center}
        />,
    );

    yield* card().to(
        {
            fill: [
                ...Fills.color('#3a4a6b'),
                ...Fills.linearGradient(['#e8617c', '#f2c94c'], { blend: 'multiply', opacity: 0.9 }),
                ...Fills.noise({ color: '#ffffff', density: 0.4, blend: 'screen', opacity: 0.3 }),
            ],
        },
        1.2,
        easeInOut('quad'),
    );
    yield* holdTail(1.2);
});
