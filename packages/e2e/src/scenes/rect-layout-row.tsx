import { createScene, createRef, Rect, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/** {@link Rect} `flow={'horizontal'}`: three children laid left-to-right, with the gap animating wider. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const row = createRef<Rect>();
    stage.add(
        <Rect ref={row} width={700} height={220} flow={'horizontal'} gap={8} center={() => stage.root.center}>
            <Rect width={140} height={'fill'} fill={'primary'} cornerRadius={12} />
            <Rect width={140} height={'fill'} fill={'accent'} cornerRadius={12} />
            <Rect width={140} height={'fill'} fill={'primary'} cornerRadius={12} />
        </Rect>,
    );

    yield* row().to({ gap: 48 }, 1.4, easeInOut('quad'));
    yield* holdTail(1.4);
});
