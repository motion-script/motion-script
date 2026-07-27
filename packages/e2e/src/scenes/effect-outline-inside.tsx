import { createScene, createRef, Ellipse, Rect, Effects, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/** {@link Effects.outline} with `position: 'inside'`: the band eats inward, leaving the footprint unchanged. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const disc = createRef<Ellipse>();
    stage.add(
        <Rect width={'fill'} height={'fill'} group={'stack'} align={{ x: 0, y: 0 }}>
            <Ellipse
                ref={disc}
                width={280}
                height={280}
                fill={'primary'}
                effects={Effects.outline({ width: 0, color: '#f4f6ff', position: 'inside' })}
            />
        </Rect>,
    );

    yield* disc().to(
        { effects: Effects.outline({ width: 26, color: '#f4f6ff', position: 'inside' }) },
        1.2,
        easeInOut('quad'),
    );
    yield* holdTail(1.2);
});
