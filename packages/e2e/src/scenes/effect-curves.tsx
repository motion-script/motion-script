import { createScene, createRef, Rect, Fills, Effects, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/** {@link Effects.curves}: a lifted-shadow tone curve fades the blacks of a gradient card. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const card = createRef<Rect>();
    stage.add(
        <Rect width={'fill'} height={'fill'} group={'stack'} align={{ x: 0, y: 0 }}>
            <Rect
                ref={card}
                width={420}
                height={280}
                cornerRadius={20}
                fill={Fills.linearGradient(['#0d0f15', '#f4f6ff'])}
                effects={Effects.curves({ points: [[0, 0], [0.5, 0.5], [1, 1]] })}
            />
        </Rect>,
    );

    yield* card().to(
        { effects: Effects.curves({ points: [[0, 0.3], [0.5, 0.6], [1, 0.85]] }) },
        1.2,
        easeInOut('quad'),
    );
    yield* holdTail(1.2);
});
