import { createScene, createRef, MaskGroup, Ellipse, Rect, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/** {@link MaskGroup} clipping a card's combined fill and stroke down to a growing circular window. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const mask = createRef<Ellipse>();
    stage.add(
        <MaskGroup mode={'vector'} width={'fill'} height={'fill'}>
            <Ellipse ref={mask} width={100} height={100} fill={'#ffffff'} />
            <Rect width={360} height={240} cornerRadius={20} fill={'primary'} stroke={{ weight: 10, align: 'inside', fill: '#f4f6ff' }} />
        </MaskGroup>,
    );

    yield* mask().to({ width: 320, height: 320 }, 1.4, easeInOut('quad'));
    yield* holdTail(1.4);
});
