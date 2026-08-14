

import { createScene, createRef, Text, Rect, wait, parallel, easeInOut, easeOut, PathBuilder } from "motion-script";

const BG = '#0D0F15';
const CREAM = '#F5ECD7';

const circle = (r: number) =>
    new PathBuilder()
        .moveTo(0, -r)
        .arc(r, r, 0, 1, 1, 0, r)
        .arc(r, r, 0, 1, 1, 0, -r)
        .toCommands();

const arc = (r: number, sweep: number) =>
    new PathBuilder()
        .moveTo(-r * Math.sin(sweep / 2), -r * Math.cos(sweep / 2))
        .arc(r, r, 0, sweep > Math.PI ? 1 : 0, 1, r * Math.sin(sweep / 2), -r * Math.cos(sweep / 2))
        .toCommands();

/**
 * `path` isn't itself a tweenable property (v1) — but it can be swapped
 * instantly via `set()`. This stamps one badge-style label onto a full ring,
 * then a half-arc, while everything else about the node (`letterSpacing`,
 * `rotation`, `fill`) keeps animating continuously across the swap.
 */
export default createScene(function* (stage) {
    stage.set({ fill: BG, flow: 'freeform', padding: 80 });

    const ring = createRef<Text>();

    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'freeform'}>
            <Text
                ref={ring}
                path={circle(220)}
                text={'MOTION  SCRIPT  •  TEXT  ON  PATH  •  '}
                fontSize={36}
                fontWeight={700}
                letterSpacing={0}
                fill={CREAM}
            />
        </Rect>
    );

    yield* wait(0.4);

    yield* parallel(
        ring().to({ rotation: 360 }, 5, easeInOut('quad')),
        ring().to({ letterSpacing: 6 }, 1.2, easeOut('quad')),
    );

    // Swap the underlying path while the node keeps spinning — the glyphs
    // re-flow onto the new contour instantly, no tween between shapes.
    ring().set({ path: arc(260, Math.PI * 1.2), text: 'swapped to a half-arc baseline' });

    yield* ring().to({ rotation: 720 }, 4, easeInOut('quad'));

    yield* wait(1);
});
