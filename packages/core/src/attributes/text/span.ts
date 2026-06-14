import { FillResolved } from "../shape/fill/union";
import { Fill } from "../shape/fill/chain";
import { StrokeProp, StrokeResolved } from "../shape/stroke/mapper";

export type FontStyle = 'normal' | 'italic' | 'oblique';

/**
 * A styled run of text. Spans may nest — children inherit any style fields
 * the parent set and override the ones they redeclare (Flutter-style
 * TextSpan). A span with `children` and no `text` acts as a pure style
 * scope; a span with both contributes its `text` before its children.
 */
export interface TextSpan {
    text?: string;
    fontFamily?: string;
    fontSize?: number;
    fontWeight?: number;
    fontStyle?: FontStyle;
    letterSpacing?: number;
    fill?: Fill;
    stroke?: StrokeProp | StrokeProp[];
    children?: TextSpan[];
}

/**
 * A span flattened against its parents — every style field is concrete and
 * fills/strokes are resolved. Newlines in `text` are preserved; the renderer
 * splits on `\n` to lay out lines.
 */
export interface ResolvedTextSpan {
    text: string;
    fontFamily: string;
    fontSize: number;
    fontWeight: number;
    fontStyle: FontStyle;
    letterSpacing: number;
    fill: FillResolved[];
    stroke: StrokeResolved[];
}