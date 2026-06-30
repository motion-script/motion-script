import { createScene, createRef, Rect, Text, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/** A card's resolved cardinal points (`topLeft`, `topCenter`, ..., `bottomRight`) tracked live by a marker that hops between them as the card rotates and scales. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const card = createRef<Rect>();
    const marker = createRef<Rect>();
    stage.add(
        <Rect width={'fill'} height={'fill'} group={'stack'} align={{ x: 0, y: 0 }}>
            <Rect ref={card} width={300} height={180} cornerRadius={16} fill={'card'} rotation={0} />
            <Rect ref={marker} width={16} height={16} cornerRadius={8} fill={'primary'} center={() => card().topRight} />
        </Rect>,
    );

    yield* card().to({ rotation: 35, scale: 1.2 }, 1.4, easeInOut('quad'));
    yield* holdTail(1.4);
});
