import { createScene, createRef, Rect, Ellipse, Text, Effects, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/**
 * {@link Effects.godRays}: light streams out from a bright disc, past the bar
 * occluding it.
 *
 * The subject matters for this effect in a way it doesn't for most: rays are
 * only visible where something bright is partly blocked. A flat, evenly-lit
 * image has nothing to stream past and the result is just a gentle brightening.
 */
const LIGHT = { x: 0.5, y: 0.32 };

export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const card = createRef<Rect>();
    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'freeform'} align={{ x: 0, y: 0 }}>
            <Rect
                ref={card}
                width={520}
                height={360}
                cornerRadius={20}
                fill={'#05070d'}
                clip={true}
                flow={'freeform'}
                align={{ x: 0, y: 0 }}
                effects={Effects.godRays({ intensity: 0, threshold: 0.5, length: 0.8, center: LIGHT })}
            >
                <Ellipse width={150} height={150} fill={'#fff6d8'} y={65} />
                <Rect width={380} height={44} fill={'#05070d'} y={40} />
                <Text text={'RAYS'} fontFamily={'Inter'} fontWeight={800} fontSize={56} fill={'#05070d'} y={-70} />
            </Rect>
        </Rect>,
    );

    yield* card().to(
        { effects: Effects.godRays({ intensity: 2.4, threshold: 0.5, length: 0.8, center: LIGHT }) },
        1.2,
        easeInOut('quad'),
    );
    yield* holdTail(1.2);
});
