import {
    createScene, createRef, Text, Rect, Fills, Alignment,
    easeInOut, sequence, parallel,
} from "motion-script";
import { DrawnPivot } from "../nodes/drawn-pivot";

/** Gradient shared by every figure so only the pivot differs between them. */
const GRADIENT = ['#6990DD', '#E8617C', '#F5C26B'];

/**
 * Shows the graphics-level **pivot** — the `center` argument to
 * `Graphics.rotation(angle, center)`.
 *
 * Three *identical* drawn clock-hand figures sit side by side, each spun about a
 * different pivot — given as **named anchors** (the same `'center'` / `'topRight'`
 * / `'bottomLeft'` vocabulary as node `align`), resolved against the figure's box:
 *  - **center**     — pivots at the figure's middle, spinning in place.
 *  - **topRight**   — pivots at the top-right corner of its box.
 *  - **bottomLeft** — pivots at the bottom-left corner of its box.
 *
 * Every figure animates the *same* `angle`, so the only variable is the pivot —
 * making its effect directly comparable. A ✕ marker (drawn after the rotation,
 * so it stays put) pins each pivot point. (Pivots may also be given as an explicit
 * `Vector2` in local pixels — see {@link DrawnPivot}.)
 */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });

    const e = 220;

    // Same gradient for all three figures (pinned to each figure via `local`),
    // so differences on screen come from the pivot alone, not the fill.
    const figureFill = Fills.linearGradient(GRADIENT, {
        space: 'local', start: { x: 0, y: -1 }, end: { x: 0, y: 1 },
    });

    // The three pivots, given as named anchors (resolved against the figure's
    // [-extent..+extent] box inside DrawnPivot). A pivot can also be an explicit
    // Vector2 in local pixels — the named anchors are the convenient shorthand.
    const pivots: { label: string; pivot: Alignment }[] = [
        { label: 'center',     pivot: 'center' },
        { label: 'topRight',   pivot: 'topRight' },
        { label: 'bottomLeft', pivot: 'bottomLeft' },
    ];

    const refs = pivots.map(() => createRef<DrawnPivot>());

    // One labelled cell per pivot: heading on top, the figure centred in a card.
    const cells = pivots.map((p, i) => (
        <Rect width={'fill'} height={'fill'} group={'column'} gap={16}>
            <Text
                fontFamily={'Pixelify Sans'} text={`pivot — ${p.label}`}
                fontSize={44} fill={'gray'} width={'fill'} textAlign={'center'}
            />
            <Rect width={'fill'} height={'fill'} clip={true} cornerRadius={32} group={'stack'} fill={'card'}>
                <DrawnPivot
                    ref={refs[i]} extent={e} spinPivot={p.pivot} angle={0} fill={figureFill}
                    stroke={{ weight: 4, fill: Fills.color('#0D0F15', { opacity: 0.6 }) }}
                />
            </Rect>
        </Rect>
    ));

    stage.add(
        <Rect width={'fill'} height={'fill'} group={'column'} padding={80} gap={32}>
            <Text fontFamily={'Pixelify Sans'} text={'Graphics pivot'} fontSize={96} fill={'gray'} width={'fill'} textAlign={'start'} />
            <Rect width={'fill'} height={'fill'} group={'row'} gap={48}>
                {cells}
            </Rect>
        </Rect>
    );

    // Animate every figure's angle in lockstep so the pivot is the only variable:
    // swing a full turn one way, then back, for a seamless loop.
    const spin = (deg: number, dur: number) =>
        parallel(...refs.map(r => r().to({ angle: deg } as any, dur, easeInOut('quad'))));

    yield* sequence(
        spin(360, 3),
        spin(0, 3),
    );
});
