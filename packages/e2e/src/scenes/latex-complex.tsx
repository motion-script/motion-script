import { createScene, createRef, Rect, easeOut } from 'motion-script';
import { Latex } from 'motion-script';
import { holdTail } from './_lib';

/** Latex node rendering a more complex multi-symbol formula (an integral), fading in. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const formula = createRef<Latex>();
    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'freeform'} align={{ x: 0, y: 0 }}>
            <Latex
                ref={formula}
                latex={'\\int_{0}^{\\infty} e^{-x^2} \\, dx = \\frac{\\sqrt{\\pi}}{2}'}
                fontSize={56}
                fill={'#f4f6ff'}
                opacity={0}
            />
        </Rect>,
    );

    yield* formula().to({ opacity: 1 }, 0.8, easeOut('quad'));
    yield* holdTail(0.8);
});
