import { createScene, createRef, Rect, Fills, Adjustments, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/**
 * A media fill's `preset.intensity`: the whole grade dialled in as one number,
 * with every adjustment in the chain left at the value it was authored with.
 *
 * The thing to look at is that this is *not* the same as animating the chain's
 * own values toward neutral. The grade here is a hard one — fully desaturated,
 * heavily crushed — and at 0.5 it reads as half of that look rather than as a
 * separate, milder look, because the renderer mixes the graded pixels against
 * the ungraded ones instead of re-running a weaker chain.
 */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const rect = createRef<Rect>();

    const look = Adjustments.grayscale(1).colorAdjustment({ contrast: 1.8, brightness: -0.05 });
    const graded = (intensity: number) =>
        Fills.image('kingfisher.jpg', { fit: 'fill', preset: { adjustments: look, intensity } });

    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'freeform'} align={{ x: 0, y: 0 }}>
            <Rect ref={rect} width={320} height={320} cornerRadius={24} fill={graded(0)} />
        </Rect>,
    );

    yield* rect().to({ fill: graded(1) }, 1.2, easeInOut('quad'));
    yield* holdTail(1.2);
});
