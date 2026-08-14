import { createScene, createRef, Rect, Image, Effects, EffectChain, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/**
 * Regression guard: a chain spanning **both effect surfaces** composes correctly.
 *
 * `effect-chain-order` covers author order among shader effects. This covers the
 * other axis — filter-surface effects (`vintage` here) run after every
 * shader-surface one whatever the chain says, so a five-effect chain mixing the
 * two must still resolve to one stable image at every point of the tween.
 *
 * Written as a local `vhs(amount)` recipe because that is how a project composes
 * a named look: ramping every ingredient from its neutral setting, so `0` is a
 * no-op and `1` is the full look.
 */
const at = (t: number, neutral: number, full: number) => neutral + (full - neutral) * t;

/** Tape damage read back through a warm, soft tube — damage, separate, then screen. */
const vhs = (amount: number): EffectChain => Effects
    .blockDisplace({ amount: at(amount, 0, 40), size: 20, density: 0.4, seed: 7 })
    .rgbShift({
        red: { x: at(amount, 0, 7), y: 0 },
        blue: { x: at(amount, 0, -5), y: at(amount, 0, 2) },
    })
    .scanlines({ darkness: at(amount, 0, 0.55), spacing: 5 })
    .grain({ amount: at(amount, 0, 0.22), animated: true })
    .vintage({ amount: at(amount, 0, 0.5), warmth: at(amount, 0, -0.2) });

export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const card = createRef<Image>();
    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'freeform'} align={{ x: 0, y: 0 }}>
            <Rect width={480} height={320} cornerRadius={20} clip={true} flow={'freeform'}>
                <Image
                    ref={card}
                    src={'./cat.jpg'}
                    fit={'fill'}
                    width={'fill'}
                    height={'fill'}
                    effects={vhs(0)}
                />
            </Rect>
        </Rect>,
    );

    yield* card().to({ effects: vhs(1) }, 1.2, easeInOut('quad'));
    yield* holdTail(1.2);
});
