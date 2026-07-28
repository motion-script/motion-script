import { createScene, createRef, Text, Rect, easeInOut, wait } from "motion-script";

/**
 * First scene of the globals showcase. Its `fill` is translucent (`bg/70`) so
 * the project-level background image reads through it — an opaque scene fill
 * would hide the background entirely.
 */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg/70', padding: 120, group: 'column', gap: 40 });

    const card = createRef<Rect>();

    stage.add(
        <Rect width={'fill'} height={'fill'} group={'column'} gap={32} align={'centerLeft'}>
            <Text fontFamily={'Pixelify Sans'} text={'Global backgrounds'} fontSize={110} fill={'white'} />
            <Rect ref={card} width={0} height={12} fill={'primary'} cornerRadius={6} />
            <Text fontFamily={'Pixelify Sans'} text={'one image, every scene'} fontSize={52} fill={'white/60'} />
        </Rect>,
    );

    yield* card().to({ width: 720 }, 1.2, easeInOut('quad'));
    yield* wait(0.8);
});
