import { createScene, createRef, Rect, Fills, Effects, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/** {@link Effects.scanlines}: CRT bands darken across a bright card as `darkness` ramps up. */
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
                fill={Fills.linearGradient(['#7ad9ff', '#f4f6ff'])}
                effects={Effects.scanlines({ darkness: 0, spacing: 8 })}
            />
        </Rect>,
    );

    yield* card().to({ effects: Effects.scanlines({ darkness: 0.9, spacing: 8 }) }, 1.2, easeInOut('quad'));
    yield* holdTail(1.2);
});
