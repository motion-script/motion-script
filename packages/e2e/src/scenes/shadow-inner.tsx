import { createScene, createRef, Rect, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/** `shadow.inner: true` casts the shadow inward (inset) instead of as a drop shadow, deepening as blur grows. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const card = createRef<Rect>();
    stage.add(
        <Rect width={'fill'} height={'fill'} group={'stack'} align={{ x: 0, y: 0 }}>
            <Rect
                ref={card}
                width={320}
                height={220}
                cornerRadius={20}
                fill={'card'}
                shadow={{ blur: 6, offset: { x: 0, y: 4 }, fill: '#000000', inner: true }}
            />
        </Rect>,
    );

    yield* card().to({ shadow: { blur: 40, offset: { x: 0, y: 18 }, fill: '#000000', inner: true } }, 1.4, easeInOut('quad'));
    yield* holdTail(1.4);
});
