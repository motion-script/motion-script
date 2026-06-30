import { createScene, createRef, Rect, Effects, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/** `Effects.pixelate(blocks, {backdrop: true})`: mosaics the content beneath the node, clipped to its silhouette, while the node's own edges stay sharp. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const lens = createRef<Rect>();
    stage.add(
        <Rect width={'fill'} height={'fill'} group={'row'} gap={16} padding={40} align={{ x: 0, y: 0 }}>
            <Rect width={'fill'} height={'fill'} cornerRadius={12} fill={'#6990dd'} />
            <Rect width={'fill'} height={'fill'} cornerRadius={12} fill={'#e8617c'} />
            <Rect width={'fill'} height={'fill'} cornerRadius={12} fill={'#f2c94c'} />
        </Rect>,
    );
    stage.add(
        <Rect
            ref={lens}
            width={260}
            height={260}
            cornerRadius={130}
            stroke={{ weight: 4, fill: '#f4f6ff' }}
            center={() => stage.root.center}
            effects={Effects.pixelate(64, { backdrop: true })}
        />,
    );

    yield* lens().to({ effects: Effects.pixelate(8, { backdrop: true }) }, 1.2, easeInOut('quad'));
    yield* holdTail(1.2);
});
