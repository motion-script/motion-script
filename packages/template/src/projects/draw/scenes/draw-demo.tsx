/** @jsxImportSource @motion-script/core/jsx */

import {
    Scene, createRef, Text, Rect, Fills, FillSpace, Node,
    easeInOutQuad, sequence,
} from "@motion-script/core";
import { DrawnShape } from "../nodes/drawn-shape";

/** Gradient colours shared by every scene's figure (and its backdrop). */
const GRADIENT = ['#6990DD', '#E8617C', '#F5C26B'];

/**
 * Where a scene paints a faded copy of the same gradient as a reference field
 * behind the figure, so you can see which slice the figure samples:
 *  - `'none'`   — no backdrop (the `local` scene; the fill is pinned to the
 *                 figure, so a backdrop would add nothing).
 *  - `'parent'` — fills the parent card; pairs with `space: 'parent'`.
 *  - `'scene'`  — full-bleed across the whole frame; pairs with `space: 'global'`
 *                 (the viewport).
 */
type Backdrop = 'none' | 'parent' | 'scene';

/**
 * Shared scaffolding for the per-fill-space showcase scenes.
 *
 * Every scene paints the *same* complex silhouette — built entirely from draw
 * commands inside {@link DrawnShape} (rect + ellipse + bezier path, with two
 * holes punched via `.cut()`) — and fills it with one linear gradient. The only
 * thing that changes between scenes is the fill {@link FillSpace}: `local`,
 * `parent`, or `global`. Because the gradient is identical, the way it lands on
 * the figure makes the space directly comparable.
 *
 * Only the figure's position animates — the gradient endpoints stay fixed — so
 * each space's behaviour is isolated to the motion. Under `local` the gradient
 * is pinned to the figure and travels with it (its look never changes); under
 * `parent`/`global` it stays anchored to the card/viewport, so the shape reveals
 * whichever slice it currently covers. The `parent` and `global` scenes paint a
 * faded copy of the same gradient over their reference rect (see {@link Backdrop})
 * so that slice is easy to read against the field it samples.
 */
export abstract class DrawDemoScene extends Scene {
    /** Fills space this scene demonstrates. */
    abstract readonly space: FillSpace;
    /** Card heading. */
    abstract readonly label: string;
    /** Reference-gradient backdrop to paint behind the figure. */
    readonly backdrop: Backdrop = 'none';

    *build() {
        this.set({ fill: 'bg' });

        const shapeRef = createRef<DrawnShape>();
        const space = this.space;

        // The figure's gradient. Endpoints are FIXED — only the figure's position
        // animates — so each space's behaviour is isolated to the motion: under
        // `local` the fill is pinned to the figure (its look never changes), while
        // under `parent`/`global` the figure slides across a fill anchored to the
        // card/viewport and reveals different slices of it.
        const figureFill = Fills.linearGradient(GRADIENT, {
            space, start: { x: -1, y: -1 }, end: { x: 1, y: 1 },
        });

        // A faded copy of the same gradient with the SAME endpoints, mapped over
        // the backdrop rect's own bounds (`space: 'local'`) so it shows the full
        // field the figure samples a slice of. Because both are static and share
        // endpoints, the figure lines up exactly with the field behind it.
        const backdropFill = Fills.linearGradient(GRADIENT, {
            space: 'local', opacity: 0.28, start: { x: -1, y: -1 }, end: { x: 1, y: 1 },
        });

        // Full-bleed reference field for the `global` (viewport) scene, painted
        // straight onto the scene behind the padded column.
        if (this.backdrop === 'scene') {
            this.add(<Rect width={'fill'} height={'fill'} fill={backdropFill} />);
        }

        // The card stacks an optional parent-space reference field behind the
        // figure. Built as a child array so the backdrop can be omitted cleanly.
        const cardChildren: Node[] = [];
        if (this.backdrop === 'parent') {
            cardChildren.push(<Rect width={'fill'} height={'fill'} fill={backdropFill} />);
        }
        cardChildren.push(
            <DrawnShape ref={shapeRef} space={space} extent={300} fill={figureFill} />,
        );

        this.add(
            <Rect width={'fill'} height={'fill'} group={'column'} padding={80} gap={24}>
                <Text fontFamily={'Pixelify Sans'} text={this.label} fontSize={96} fill={'gray'} width={'fill'} align={'start'} />
                <Rect width={'fill'} height={'fill'} clip={true} cornerRadius={32} group={'stack'} >
                    {cardChildren}
                </Rect>
            </Rect>
        );

        // Drift the shape across the card. The gradient is fixed, so position is
        // the only variable: `local` stays put-looking as it slides, while
        // `parent`/`global` reveal the static field they sit in.
        yield* sequence(
            shapeRef().to({ x: -360 } as any, 2, easeInOutQuad),
            shapeRef().to({ x: 360 } as any, 3, easeInOutQuad),
            shapeRef().to({ x: 0 } as any, 2, easeInOutQuad),
        );
    }
}
