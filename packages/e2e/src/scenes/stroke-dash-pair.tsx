import { createScene, createRef, Rect, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/** `dash: [on, off]`: an explicit two-number pair gives uneven dash/gap lengths, here animating from short dashes/long gaps to long dashes/short gaps. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const rect = createRef<Rect>();
    stage.add(
        <Rect width={'fill'} height={'fill'} group={'stack'} align={{ x: 0, y: 0 }}>
            <Rect
                ref={rect}
                width={360}
                height={240}
                cornerRadius={16}
                fill={'card'}
                stroke={{ weight: 6, fill: 'primary', dash: [8, 32] }}
            />
        </Rect>,
    );

    yield* rect().strokeTo({ weight: 6, fill: 'primary', dash: [32, 8] }, 1.4, { ease: easeInOut('quad') });
    yield* holdTail(1.4);
});
