import { createScene, createRef, Rect, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/** Rect animating a uniform corner radius from sharp to fully rounded. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const rect = createRef<Rect>();
    stage.add(
        <Rect width={'fill'} height={'fill'} group={'stack'} align={{ x: 0, y: 0 }}>
            <Rect ref={rect} width={260} height={260} fill={'primary'} cornerRadius={0} />
        </Rect>,
    );

    yield* rect().to({ cornerRadius: 130 }, 1.2, easeInOut('quad'));
    yield* holdTail(1.2);
});
