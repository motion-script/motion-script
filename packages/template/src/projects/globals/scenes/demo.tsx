import { createScene, createRef, Text, Rect, easeInOut, wait } from "motion-script";

/**
 * Second scene. Identical global treatment to `intro` — the watermark overlay
 * and the background come from the project config, not from here.
 */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg/70', padding: 120, flow: 'vertical', gap: 40 });

    const row = createRef<Rect>();

    stage.add(
        <Rect ref={row} width={'fill'} height={'fill'} flow={'horizontal'} gap={40} align={'center'}>
            <Rect width={260} height={260} fill={'primary'} cornerRadius={32} />
            <Rect width={260} height={260} fill={'card'} cornerRadius={32} />
            <Rect width={260} height={260} fill={'primary/50'} cornerRadius={32} />
        </Rect>,
    );

    yield* row().to({ gap: 120 }, 1.2, easeInOut('quad'));
    yield* wait(0.8);
});
