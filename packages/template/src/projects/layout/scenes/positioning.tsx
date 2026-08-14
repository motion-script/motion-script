

import { createScene, createRef, Rect, Text, easeInOut, wait } from "motion-script";
import { layoutCard, tile } from "./layout-card";

/**
 * Demonstrates `childPositioning` / `relativeToParent` — stepping a node out of
 * its parent's layout and pinning it to the **stage** instead.
 *
 * The card holds an ordinary hugging row of three tiles, deliberately pushed
 * off-centre by its own `x`. Two extra nodes live *inside* that row but are
 * absolutely positioned, so they take no gap, no flex share, contribute nothing
 * to the row's hug size, and read their `x`/`y` as plain scene coordinates:
 *
 * - a corner badge, parked at a fixed spot on the stage;
 * - a full-bleed banner, whose `width: 'fill'` fills the *scene*, not the row.
 *
 * The row then slides across and re-flows (its `gap` opens up). Its three flow
 * tiles ride along and spread out, as children do; the two pinned nodes hold
 * their scene position exactly. Finally the badge is handed back with
 * `relativeToParent: 'relative'` and drops into the row, widening its hug by one
 * more child and one more gap — the same node, the same tree, one prop apart.
 *
 * Note what an absolute child does *not* escape: it still renders inside its
 * parent's scope, so a rotated or faded ancestor still rotates and fades it.
 * Only where its box is anchored changes.
 */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });

    const row = createRef<Rect>();
    const badge = createRef<Rect>();

    stage.add(
        layoutCard({
            label: 'absolute vs relative',
            stage: 'freeform',
            children: (
                // A perfectly ordinary hug row — nothing here knows about the
                // two pinned children it happens to hold.
                <Rect ref={row} flow={'horizontal'} gap={32} width={'hug'} height={'hug'} x={-360}>
                    {tile({ color: '#6990DD', width: 200, height: 200, label: '1' })}
                    {tile({ color: '#E8617C', width: 200, height: 200, label: '2' })}
                    {tile({ color: '#F0C05A', width: 200, height: 200, label: '3' })}

                    {/* Pinned to the scene: x/y are stage coordinates, so this
                        sits in the card's corner no matter where the row goes. */}
                    <Rect
                        ref={badge}
                        relativeToParent={'absolute'}
                        x={620} y={300}
                        width={'hug'} height={'hug'}
                        flow={'freeform'} padding={24}
                        fill={'primary'} cornerRadius={16}
                    >
                        <Text fontFamily={'Pixelify Sans'} text={'PINNED'} fontSize={40} fill={'bg'} />
                    </Rect>

                    {/* Also pinned — and measured against the stage, so 'fill'
                        spans the whole scene rather than the row's 700px. */}
                    <Rect
                        relativeToParent={'absolute'}
                        y={-400}
                        width={'fill'} height={80}
                        flow={'freeform'}
                        fill={'#161a21'} cornerRadius={16}
                    >
                        <Text fontFamily={'Pixelify Sans'} text={"width 'fill' fills the stage"} fontSize={40} fill={'gray'} />
                    </Rect>
                </Rect>
            ),
        })
    );

    // Slide the row across. The three flow tiles travel with it; the badge and
    // the banner hold their scene position.
    yield* row().to({ x: 360 }, 1.4, easeInOut('quad'));

    // Re-flow it in place: the gap opens, the hug widens, the tiles spread.
    // The pinned pair still doesn't move.
    yield* row().to({ gap: 140 }, 1, easeInOut('quad'));
    yield* row().to({ gap: 32 }, 1, easeInOut('quad'));

    // Hand the badge back to the row: it takes a cell in the flow, widening the
    // row's hug by one more child and one more gap. `x`/`y` don't change
    // meaning quietly — they stop being scene coordinates and become an offset
    // from that cell, so the same (620, 300) now throws it off to the right.
    // Easing them to zero settles it into its slot.
    badge().set({ relativeToParent: 'relative' });
    yield* badge().to({ x: 0, y: 0 }, 0.9, easeInOut('quad'));
    yield* wait(0.6);
});
