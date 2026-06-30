import { createScene, createRef, Rect, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/** Uniform scale animation on a centered square. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const box = createRef<Rect>();
    stage.add(
        <Rect width={'fill'} height={'fill'} group={'stack'} align={{ x: 0, y: 0 }}>
            <Rect ref={box} width={180} height={180} cornerRadius={18} fill={'primary'} scale={0.4} />
        </Rect>,
    );

    yield* box().to({ scale: 1.4 }, 1.3, easeInOut('cubic'));
    yield* holdTail(1.3);
});
