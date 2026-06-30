import { createScene, createRef, Rect, Fills, easeInOut } from 'motion-script';
import { Latex } from 'motion-script';
import { holdTail } from './_lib';

/** Latex `fill` as a linear gradient, sweeping its angle across the formula. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const formula = createRef<Latex>();
    stage.add(
        <Rect width={'fill'} height={'fill'} group={'stack'} align={{ x: 0, y: 0 }}>
            <Latex
                ref={formula}
                latex={'a^2 + b^2 = c^2'}
                fontSize={96}
                fill={Fills.linearGradient(['#6990dd', '#e8617c'])}
                rotation={0}
            />
        </Rect>,
    );

    yield* formula().to({ rotation: 360 }, 1.6, easeInOut('quad'));
    yield* holdTail(1.6);
});
