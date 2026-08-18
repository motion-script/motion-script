import { InsetsProps, RectCornerRadius, RectCornerStyle, ShapeProps } from '@motion-script/core';
import { CodeTheme } from './style';

/**
 * Extends {@link ShapeProps} rather than the bare `NodeProps` this used to, so a
 * listing carries the four paint slots every other drawable has: a `fill` behind
 * the tokens, an `overlay` washed over them, a `stroke` framing the block and a
 * `shadow` under it.
 *
 * A code block is the one node that is nearly always set on a panel — an editor
 * chrome, a card, a terminal — and until this it could only get one by being
 * parented to a Rect sized to match, which stops matching the moment the listing
 * hugs a line more or a line fewer. Painting its own box is the same reasoning
 * `padding` is a prop here: the geometry is the node's, so the background that
 * tracks it should be too.
 */
export interface CodeProps extends ShapeProps {
    code: string;
    language: string;
    fontSize: number;
    fontFamily: string;
    /** A built-in/registered theme name (e.g. `'github-dark'`), or a {@link CodeHighlightStyle} object. */
    theme: CodeTheme;
    lineHeight: number;
    letterSpacing: number;
    showLineNumbers: boolean;
    lineNumberGap: number;
    padding: InsetsProps;
    /** Corner radius of the background box — uniform, per-corner, or per-axis. */
    cornerRadius: RectCornerRadius;
    /** How each corner is shaped once it has a radius: `'rounded'` or `'angled'`. */
    cornerStyle: RectCornerStyle;
}
