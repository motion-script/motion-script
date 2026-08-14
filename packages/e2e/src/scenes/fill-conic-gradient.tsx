import { createScene, createRef, Rect, Fills, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/** {@link Fills.conicGradient}: a color wheel sweeping its `startAngle` around the center. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const rect = createRef<Rect>();
    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'freeform'} align={{ x: 0, y: 0 }}>
            <Rect
                ref={rect}
                width={320}
                height={320}
                cornerRadius={160}
                fill={Fills.conicGradient(['#6990dd', '#e8617c', '#f2c94c', '#6990dd'], { startAngle: 0 })}
            />
        </Rect>,
    );

    yield* rect().to({ fill: Fills.conicGradient(['#6990dd', '#e8617c', '#f2c94c', '#6990dd'], { startAngle: 360 }) }, 1.6, easeInOut('quad'));
    yield* holdTail(1.6);
});
