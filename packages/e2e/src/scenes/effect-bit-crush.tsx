import { createScene, createRef, Rect, Fills, Effects, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/** {@link Effects.bitCrush}: a smooth gradient snaps to the four-colour Game Boy palette. */
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
                effects={Effects.bitCrush({ palette: 'gameboy', amount: 0 })}
            />
        </Rect>,
    );

    yield* card().to(
        { effects: Effects.bitCrush({ palette: 'gameboy', amount: 1 }) },
        1.2,
        easeInOut('quad'),
    );
    yield* holdTail(1.2);
});
