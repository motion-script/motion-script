import { createScene, createRef, Rect, Fills, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/** {@link Fills.radialGradient}: the glow radius grows from a tight pool of light to filling the shape. */
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
                fill={Fills.radialGradient(['#f2c94c', '#23283a'], { radius: 30 })}
            />
        </Rect>,
    );

    yield* rect().to({ fill: Fills.radialGradient(['#f2c94c', '#23283a'], { radius: 280 }) }, 1.4, easeInOut('quad'));
    yield* holdTail(1.4);
});
