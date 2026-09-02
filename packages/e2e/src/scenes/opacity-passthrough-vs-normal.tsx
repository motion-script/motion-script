import { createRef, Rect } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/**
 * Two overlapping-children groups side by side, both fading via `opacity`: the
 * left uses the default `blend: 'pass-through'` (not isolated — each child's
 * opacity scales independently, so the overlap darkens/lightens like normal
 * alpha compositing), the right uses `blend: 'normal'` (isolated — children
 * flatten into one layer first, then *that* flat layer fades as a unit, so the
 * overlap seam stays put instead of blending through to the backdrop).
 */
const passThrough = createRef<Rect>();
const normal = createRef<Rect>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'horizontal'} gap={60} align={{ x: 0, y: 0 }}>
            <Rect ref={passThrough} width={260} height={260} flow={'freeform'} align={{ x: 0, y: 0 }} blend={'pass-through'} opacity={1}>
                <Rect width={160} height={160} cornerRadius={80} fill={'#28d6c8'} center={{ x: -30, y: 0 }} />
                <Rect width={160} height={160} cornerRadius={80} fill={'#e83fd6'} center={{ x: 30, y: 0 }} />
            </Rect>
            <Rect ref={normal} width={260} height={260} flow={'freeform'} align={{ x: 0, y: 0 }} blend={'normal'} opacity={1}>
                <Rect width={160} height={160} cornerRadius={80} fill={'#28d6c8'} center={{ x: -30, y: 0 }} />
                <Rect width={160} height={160} cornerRadius={80} fill={'#e83fd6'} center={{ x: 30, y: 0 }} />
            </Rect>
        </Rect>,
    );
}, [
    0.3,
    () => passThrough().to({ opacity: 0.3 }, 1, undefined),
    () => normal().to({ opacity: 0.3 }, 1, undefined),
    holdTail(1.3),
]);
