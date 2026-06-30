import { createScene, createRef, Rect, Fills, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/** {@link Fills.noise}: grain density ramping from sparse to dense. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const rect = createRef<Rect>();
    stage.add(
        <Rect width={'fill'} height={'fill'} group={'stack'} align={{ x: 0, y: 0 }}>
            <Rect
                ref={rect}
                width={360}
                height={240}
                cornerRadius={20}
                fill={Fills.noise({ color: '#f4f6ff', density: 0.05 })}
            />
        </Rect>,
    );

    yield* rect().to({ fill: Fills.noise({ color: '#f4f6ff', density: 1 }) }, 1.4, easeInOut('quad'));
    yield* holdTail(1.4);
});
