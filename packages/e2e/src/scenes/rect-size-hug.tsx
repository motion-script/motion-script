import { createScene, createRef, Rect, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/**
 * `width={'hug'} height={'hug'}` (the default for a `group={'column'}` Rect):
 * the card's own size tracks its content, so growing the inner child also
 * grows the surrounding card with no explicit size set on the card itself.
 */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const content = createRef<Rect>();
    stage.add(
        <Rect width={'fill'} height={'fill'} group={'stack'} align={{ x: 0, y: 0 }}>
            <Rect group={'column'} fill={'card'} cornerRadius={16} padding={24}>
                <Rect ref={content} width={120} height={120} fill={'accent'} cornerRadius={8} />
            </Rect>
        </Rect>,
    );

    yield* content().to({ width: 360, height: 280 }, 1.4, easeInOut('quad'));
    yield* holdTail(1.4);
});
