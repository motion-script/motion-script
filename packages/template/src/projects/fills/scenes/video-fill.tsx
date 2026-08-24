import {
    Node,
    createScene, fillProperty, Node2D, Rect, Text, Graphics2D, Fills, wait,
} from "motion-script";
import type { Fill, FillResolved, Node2DProps, RenderContext2D } from "motion-script";

const CLIP = 'video.mp4';
const HEADING = '#C9D2E4';

/** One playing clip, shared by every sample — nothing advances it. */
const clip = () => Fills.video(CLIP, { fit: 'fill', loop: 'forward' });

/**
 * A custom node painting the clip through raw `Graphics2D`. It declares its paint
 * with `@fillProperty` (so the fill tweens like any built-in node's) and
 * overrides nothing but `renderSelf`: a video fill resolves the frame to show as
 * it paints, from the node's own clock, so there is no `tick` to write.
 */

interface VideoBlobProps extends Node2DProps {
    fill: Fill;
}
class VideoBlob extends Node2D<VideoBlobProps> {
    @fillProperty() declare fill: Fill;

    protected renderSelf(ctx: RenderContext2D): void {
        const { width, height } = this.layoutBounds;
        ctx.draw(new Graphics2D().ellipse({ width, height }).fill(this.fill as FillResolved[]));
    }
}

/**
 * One video fill, painted four ways at once — as a `fill`, inside a `stroke`,
 * through a `Text` node's glyphs, and by a custom node's raw `Graphics2D`.
 *
 * All four run in lockstep with nothing in the scene advancing them: each
 * resolves the source frame as it paints, from how long the node carrying it has
 * existed. Only the first of those was possible when a fill's timestamp had to be
 * stepped from a node's `tick`.
 *
 * See `video-timestamp` for driving the playhead by hand and `video-loop` for the
 * trim/loop/speed knobs.
 */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });

    const card = (label: string, sample: Node) => (
        <Rect width={'fill'} height={'fill'} flow={'vertical'} gap={16}>
            <Text text={label} fontSize={30} fill={HEADING} width={'fill'} textAlign={'center'} />
            {sample}
        </Rect>
    );

    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'vertical'} padding={64} gap={28}>
            <Text fontFamily={'Pixelify Sans'} text={'Video Fills'} fontSize={96} fill={'gray'} width={'fill'} textAlign={'start'} />
            <Rect width={'fill'} height={'fill'} flow={'horizontal'} gap={40}>
                {card('fill', <Rect width={'fill'} height={'fill'} cornerRadius={24} fill={clip()} />)}
                {card('stroke',
                    <Rect width={'fill'} height={'fill'} cornerRadius={24} fill={'card'}
                        stroke={{ weight: 48, fill: clip() }} />)}
            </Rect>
            <Rect width={'fill'} height={'fill'} flow={'horizontal'} gap={40}>
                {card('text',
                    <Rect width={'fill'} height={'fill'} flow={'freeform'} cornerRadius={24} fill={'card'}>
                        <Text text={'PLAY'} fontSize={150} fontWeight={800} fill={clip()} />
                    </Rect>)}
                {card('custom node Graphics2D', <VideoBlob width={'fill'} height={'fill'} fill={clip()} />)}
            </Rect>
        </Rect>
    );

    yield* wait(5);
});
