import { createScene, Rect, Text, Fills, wait, createRef, ShapeNode } from "motion-script";
import type { VideoFillOptions } from "motion-script";

const CLIP = 'video.mp4';
const HEADING = '#C9D2E4';

/** Every card plays the same 3s window of the clip, differing only in `options`. */
const WINDOW: VideoFillOptions = { fit: 'fill', trimStart: 0, trimEnd: 3 };

/**
 * What happens when a video fill reaches the end of its window: `loop`, plus the
 * `trimStart`/`trimEnd` that define the window and the `speed` that crosses it.
 *
 * All four cards run the same 0–3s slice of one clip, so by the time the scene is
 * a few seconds in they have visibly diverged: `none` is parked on the last
 * frame, `forward` has restarted, `reverse` is running backwards on its return
 * leg, and the half-speed card is only halfway through its first pass.
 *
 * `duration` (not shown) overrides the cycle length when you want the loop to
 * restart somewhere other than `trimEnd`.
 */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const ref = createRef<ShapeNode>();
    const card = (label: string, note: string, options: VideoFillOptions) => (
        <Rect ref={ref} width={'fill'} height={'fill'} group={'column'} gap={12}>
            <Text text={label} fontSize={30} fill={HEADING} width={'fill'} textAlign={'center'} />
            <Text text={note} fontSize={22} fill={'gray'} width={'fill'} textAlign={'center'} />
            <Rect width={'fill'} height={'fill'} cornerRadius={24}
                fill={Fills.video(CLIP, { ...WINDOW, ...options })} />
        </Rect>
    );

    stage.add(
        <Rect width={'fill'} height={'fill'} group={'column'} padding={64} gap={28}>
            <Text fontFamily={'Pixelify Sans'} text={'Video: loop & trim'} fontSize={96} fill={'gray'} width={'fill'} textAlign={'start'} />
            <Rect width={'fill'} height={'fill'} group={'row'} gap={32}>
                {card('none', 'stops on the last frame', { loop: 'none' })}
                {card('forward', 'restarts at trimStart', { loop: 'forward' })}
                {card('reverse', 'ping-pongs the window', { loop: 'reverse' })}
                {card('forward, speed 0.5', 'same window, half rate', { loop: 'forward', speed: 0.5 })}
            </Rect>
        </Rect>
    );

    yield* wait(6);
});
