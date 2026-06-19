/** @jsxImportSource @motion-script/core/jsx */

import { createScene, createRef, Text, Rect, wait, parallel, easeOutQuad, easeInOutQuad, PathBuilder } from "@motion-script/core";

const BG = '#0D0F15';
const CREAM = '#F5ECD7';
const COPPER = '#C07840';
const BLUE = '#6990DD';

// A full circle of radius `r` centered on the node origin, drawn as two arcs.
// Text laid on it rings the circle; anything past the circumference is clipped.
const circle = (r: number) =>
    new PathBuilder()
        .moveTo(0, -r)
        .arc(r, r, 0, 1, 1, 0, r)
        .arc(r, r, 0, 1, 1, 0, -r)
        .toCommands();

// A horizontal sine-like wave (two cubic humps) spanning [-w/2, w/2] in x,
// peaking at ±amp in y. Letters tilt with the slope of the curve.
const wave = (w: number, amp: number) =>
    new PathBuilder()
        .moveTo(-w / 2, 0)
        .bezierCurveTo(-w / 4, -amp * 2, -w / 4, amp * 2, 0, 0)
        .bezierCurveTo(w / 4, -amp * 2, w / 4, amp * 2, w / 2, 0)
        .toCommands();

// A plain straight baseline. Text on it is identical to normal one-line text —
// the path simply defines where the baseline sits.
const straight = (w: number) =>
    new PathBuilder().moveTo(-w / 2, 0).lineTo(w / 2, 0).toCommands();

/**
 * Showcases the Text `path` property (text-on-path): a string wrapped around a
 * circle, flexed along a wave, and laid on a straight baseline (which reproduces
 * normal one-line text). Each demo is anchored in its own stacked cell.
 */
export default createScene(function* (stage) {
        stage.set({ fill: BG, group: 'row', gap: 0, padding: 80 });

        const ring = createRef<Text>();
        const flex = createRef<Text>();
        const base = createRef<Text>();

        // Each cell stacks its label and the curved text on top of each other so
        // the path's node-local coordinates render centered in the cell.
        const cell = (label: string, node: any) => (
            <Rect width={'fill'} height={'fill'} group={'stack'}>
                <Text
                    text={label}
                    fontSize={28}
                    fill={'gray'}
                    y={-260}
                    align={'center'}
                />
                {node}
            </Rect>
        );

        stage.add(cell('around a circle',
            <Text
                ref={ring}
                path={circle(170)}
                text={'TEXT  WRAPPED  AROUND  A  CIRCLE  •  '}
                fontSize={34}
                fontWeight={600}
                fill={CREAM}
            />,
        ));

        stage.add(cell('along a wave',
            <Text
                ref={flex}
                path={wave(440, 70)}
                text={'riding the curve'}
                fontSize={48}
                fontWeight={600}
                fill={BLUE}
            />,
        ));

        stage.add(cell('on a straight baseline',
            <Text
                ref={base}
                path={straight(440)}
                text={'just like normal text'}
                fontSize={44}
                fontWeight={600}
                fill={COPPER}
            />,
        ));

        yield* wait(0.4);

        // The `path` itself isn't animatable (v1), but everything else is: spin
        // the ring, breathe the wave's tracking, and lift the baseline copy.
        yield* parallel(
            ring().to({ rotation: 360 }, 6, easeInOutQuad),
            flex().to({ letterSpacing: 6 }, 1.4, easeOutQuad),
            base().to({ y: -20, opacity: 0.85 }, 1.4, easeOutQuad),
        );

        yield* parallel(
            flex().to({ letterSpacing: 0 }, 1.4, easeOutQuad),
            base().to({ y: 0, opacity: 1 }, 1.4, easeOutQuad),
        );

        yield* wait(1);
});
