import { createScene, createRef, Rect, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/** A node's `shadow` accepts an array: a tight contact shadow plus a soft ambient shadow stacked together, both growing in sync. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const card = createRef<Rect>();
    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'freeform'} align={{ x: 0, y: 0 }}>
            <Rect
                ref={card}
                width={300}
                height={200}
                cornerRadius={20}
                fill={'#f4f6ff'}
                shadow={[
                    { blur: 2, offset: { x: 0, y: 1 }, fill: '#00000080' },
                    { blur: 6, offset: { x: 0, y: 4 }, fill: '#00000040' },
                ]}
            />
        </Rect>,
    );

    yield* card().to(
        {
            shadow: [
                { blur: 8, offset: { x: 0, y: 4 }, fill: '#00000080' },
                { blur: 48, offset: { x: 0, y: 28 }, fill: '#00000040' },
            ],
        },
        1.4,
        easeInOut('quad'),
    );
    yield* holdTail(1.4);
});
