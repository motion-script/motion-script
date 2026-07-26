import { createScene, createRef, Rect, Effects, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/** {@link Effects.colorAdjustment}: contrast, saturation and warmth pushed on a group of shapes, not a photo. */
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
                fill={'card'}
                group={'row'}
                gap={16}
                padding={20}
                effects={Effects.colorAdjustment({ contrast: 1, saturation: 1, temperature: 0 })}
            >
                <Rect width={'fill'} height={'fill'} cornerRadius={12} fill={'#6990dd'} />
                <Rect width={'fill'} height={'fill'} cornerRadius={12} fill={'#e8617c'} />
                <Rect width={'fill'} height={'fill'} cornerRadius={12} fill={'#f2c94c'} />
            </Rect>
        </Rect>,
    );

    yield* card().to(
        { effects: Effects.colorAdjustment({ contrast: 1.6, saturation: 1.8, temperature: 0.6 }) },
        1.2,
        easeInOut('quad'),
    );
    yield* holdTail(1.2);
});
