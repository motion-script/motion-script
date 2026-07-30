import { createScene, createSignal, Rect, Text, Fills, easeInOut, wait } from "motion-script";
import type { Fill } from "motion-script";

const CLIP = 'video.mp4';
const HEADING = '#C9D2E4';

/**
 * `timestamp` and `playing`, the two knobs that decide *which* frame a video fill
 * paints — four of them side by side, so the difference is visible in one frame.
 *
 * | card                          | shows                                    |
 * | ----------------------------- | ---------------------------------------- |
 * | (default)                     | plays, timed from the node's appearance   |
 * | `playing: false`              | the clip's first frame, held              |
 * | `timestamp: 3`                | second 3, held — an override outranks play |
 * | `timestamp: <signal>`         | wherever the scene puts the playhead      |
 *
 * The last card scrubs by hand, then passes control back with `timestamp: null`
 * (`null`, not `undefined` — `set()` merges a partial and skips `undefined`) and
 * snaps to where the clock had got to, matching the first card.
 */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });

    // null = derived from the node's clock; a number takes the playhead.
    const at = createSignal<number | null>(2);

    const card = (label: string, note: string, fill: Fill | (() => Fill)) => (
        <Rect width={'fill'} height={'fill'} group={'column'} gap={12}>
            <Text text={label} fontSize={30} fill={HEADING} width={'fill'} textAlign={'center'} />
            <Text text={note} fontSize={22} fill={'gray'} width={'fill'} textAlign={'center'} />
            <Rect width={'fill'} height={'fill'} cornerRadius={24} fill={fill} />
        </Rect>
    );

    stage.add(
        <Rect width={'fill'} height={'fill'} group={'column'} padding={64} gap={28}>
            <Text fontFamily={'Pixelify Sans'} text={'Video: timestamp'} fontSize={96} fill={'gray'} width={'fill'} textAlign={'start'} />
            <Rect width={'fill'} height={'fill'} group={'row'} gap={32}>
                {card('derived', 'plays on its own',
                    Fills.video(CLIP, { fit: 'fill' }))}
                {card('playing: false', 'holds the first frame',
                    Fills.video(CLIP, { fit: 'fill', playing: false }))}
                {card('timestamp: 3', 'holds second 3',
                    Fills.video(CLIP, { fit: 'fill', timestamp: 3 }))}
                {card('timestamp: signal', 'scrubbed, then handed back',
                    () => Fills.video(CLIP, { fit: 'fill', timestamp: at() }))}
            </Rect>
        </Rect>
    );

    // Scrub the last card backwards while the first one keeps playing forwards.
    yield* wait(1);
    yield* at(0, 2, easeInOut('quad'));
    yield* wait(0.5);

    // Hand the playhead back: the clock never stopped, so it jumps to where an
    // un-overridden clip would be — the first card's frame.
    at(null);
    yield* wait(2);
});
