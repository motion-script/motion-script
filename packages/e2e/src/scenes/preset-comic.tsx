import { createRef, Rect, Image, Effects, EffectChain, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/**
 * Coverage for `halftone`'s `'cmyk'` separation — `effect-halftone` screens in
 * mono, and the two take different paths.
 *
 * The separation is what makes a process screen work at all: an RGB screen has
 * no K plate, so every neutral prints three overlapping colour dots and the page
 * turns to confetti. With darkness on its own plate, paper stays paper and the
 * inks only carry hue.
 */
const at = (t: number, neutral: number, full: number) => neutral + (full - neutral) * t;

/** Flat colour behind a process dot screen. */
const comic = (amount: number): EffectChain => Effects
    .halftone({ size: at(amount, 0.5, 7), angle: 15, separation: 'cmyk' })
    .colorAdjustment({
        saturation: at(amount, 1, 1.35),
        contrast: at(amount, 1, 1.15) });

const photo = createRef<Image>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'freeform'} align={{ x: 0, y: 0 }}>
            <Rect width={480} height={320} cornerRadius={20} clip={true} flow={'freeform'}>
                <Image ref={photo} src={'./cat.jpg'} fit={'fill'} width={'fill'} height={'fill'}
                    effects={comic(0)} />
            </Rect>
        </Rect>,
    );
}, [
    () => photo().to({ effects: comic(1) }, 1.2, easeInOut('quad')),
    holdTail(1.2),
]);
