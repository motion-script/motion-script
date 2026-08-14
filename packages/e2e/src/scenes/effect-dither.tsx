import { createScene, createRef, Rect, Fills, Effects, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/** {@link Effects.dither}: a gradient drops to 1-bit output, the error becoming a Bayer crosshatch. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const card = createRef<Rect>();
    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'freeform'} align={{ x: 0, y: 0 }}>
            <Rect
                ref={card}
                width={420}
                height={280}
                cornerRadius={20}
                fill={Fills.linearGradient(['#0d0f15', '#f4f6ff'])}
                effects={Effects.dither({ levels: 64, matrix: 8, scale: 3 })}
            />
        </Rect>,
    );

    yield* card().to({ effects: Effects.dither({ levels: 2, matrix: 8, scale: 3 }) }, 1.2, easeInOut('quad'));
    yield* holdTail(1.2);
});
