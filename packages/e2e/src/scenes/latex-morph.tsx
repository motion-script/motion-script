import { createScene, createRef, Rect, easeInOut } from 'motion-script';
import { Latex } from 'motion-script';
import { holdTail } from './_lib';

/** Latex `to({ latex })`: one formula morphs smoothly, token by token, into another. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const formula = createRef<Latex>();
    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'freeform'} align={{ x: 0, y: 0 }}>
            <Latex ref={formula} latex={'x^2 + y^2 = r^2'} fontSize={80} fill={'#f4f6ff'} />
        </Rect>,
    );

    yield* formula().to({ latex: 'e^{i\\pi} + 1 = 0' }, 1.5, easeInOut('quad'));
    yield* holdTail(1.5);
});
