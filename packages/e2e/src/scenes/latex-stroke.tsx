import { createScene, createRef, Rect, easeInOut } from 'motion-script';
import { Latex } from '@/components/latex';
import { holdTail } from './_lib';

/** Latex `stroke`: an outlined-only formula (transparent fill) thickening its stroke weight. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const formula = createRef<Latex>();
    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'freeform'} align={{ x: 0, y: 0 }}>
            <Latex
                ref={formula}
                latex={'\\Sigma'}
                fontSize={160}
                fill={'transparent'}
                stroke={{ weight: 1, fill: 'accent' }}
            />
        </Rect>,
    );

    yield* formula().strokeTo({ weight: 5, fill: 'accent' }, 1.4, { ease: easeInOut('quad') });
    yield* holdTail(1.4);
});
