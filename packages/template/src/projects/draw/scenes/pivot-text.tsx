import {
    createScene, createRef, Text, Rect, Fills, Alignment,
    easeInOut, sequence, parallel,
} from "motion-script";
import { DrawnPivotText } from "../nodes/drawn-pivot-text";

/** Gradient shared by every word so only the pivot differs between them. */
const GRADIENT = ['#6990DD', '#E8617C', '#F5C26B'];

/**
 * Shows the graphics-level **pivot** applied to **drawn text** — the `center`
 * argument to `Graphics.rotation(angle, center)` on a text-only `Graphics`.
 *
 * Text contributes no bounds to a Graphics' measured union, so a graphics-level
 * rotation on text-only output falls back to pivoting about the local origin — a
 * pivot is the *only* way to steer where the text turns. The pivots are given as
 * **named anchors** (the same `'center'` / `'centerLeft'` / `'bottomCenter'`
 * vocabulary as node `align`), resolved against the word's estimated box; the
 * same word is spun about three of them side by side:
 *  - **center**       — pivots at the word's middle, so it spins in place.
 *  - **centerLeft**   — pivots at the word's left edge, swinging like a hinged sign.
 *  - **bottomCenter** — pivots under the word's middle, so the line tips over.
 *
 * Every word animates the *same* `angle`, so the only variable is the pivot. A ✕
 * marker (drawn after the rotation, so it stays put) pins each pivot point.
 * (Pivots may also be given as an explicit `Vector2` in local pixels — see
 * {@link DrawnPivotText}.)
 */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });

    const word = 'pivot';
    const fontSize = 120;

    // Same gradient for every word (pinned to each via `local`), so on-screen
    // differences come from the pivot alone, not the fill.
    const wordFill = Fills.linearGradient(GRADIENT, {
        space: 'local', start: { x: -1, y: 0 }, end: { x: 1, y: 0 },
    });

    // The three pivots, given as named anchors (resolved against the word's
    // estimated box inside DrawnPivotText). A pivot can also be an explicit
    // Vector2 in local pixels — the named anchors are the convenient shorthand.
    const pivots: { label: string; pivot: Alignment }[] = [
        { label: 'center', pivot: 'center' },
        { label: 'centerLeft', pivot: 'centerLeft' },
        { label: 'bottomCenter', pivot: 'bottomCenter' },
    ];

    const refs = pivots.map(() => createRef<DrawnPivotText>());

    // One labelled cell per pivot: heading on top, the spinning word in a card.
    const cells = pivots.map((p, i) => (
        <Rect width={'fill'} height={'fill'} group={'column'} gap={16}>
            <Text
                fontFamily={'Pixelify Sans'} text={`pivot — ${p.label}`}
                fontSize={44} fill={'gray'} width={'fill'} textAlign={'center'}
            />
            <Rect width={'fill'} height={'fill'} clip={true} cornerRadius={32} group={'stack'} fill={'card'}>
                <DrawnPivotText
                    ref={refs[i]} text={word} fontSize={fontSize} spinPivot={p.pivot} angle={0}
                    fill={wordFill}
                    stroke={{ weight: 3, fill: Fills.color('#0D0F15', { opacity: 0.6 }) }}
                />
            </Rect>
        </Rect>
    ));

    stage.add(
        <Rect width={'fill'} height={'fill'} group={'column'} padding={80} gap={32}>
            <Text fontFamily={'Pixelify Sans'} text={'Graphics pivot — text'} fontSize={96} fill={'gray'} width={'fill'} textAlign={'start'} />
            <Rect width={'fill'} height={'fill'} group={'row'} gap={48}>
                {cells}
            </Rect>
        </Rect>
    );

    // Animate every word's angle in lockstep so the pivot is the only variable:
    // a full turn one way, then back, for a seamless loop.
    const spin = (deg: number, dur: number) =>
        parallel(...refs.map(r => r().to({ angle: deg } as any, dur, easeInOut('quad'))));

    yield* sequence(
        spin(360, 3.5),
        spin(0, 3.5),
    );
});
