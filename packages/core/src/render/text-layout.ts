/**
 * Where a laid-out run of text put its characters — the measurement an editor
 * needs in order to draw its own caret and selection over rendered glyphs.
 *
 * **Space.** Block-local canvas pixels: origin at the centre of the text block,
 * **y down**, before the node's own transform. That is exactly the space the
 * backend shapes into when handed origin `(0, 0)`, so a caret at x = 0 sits on
 * the block's centre line and nothing here has to know where the node is.
 * {@link nodeTextLayout} is what lifts it into viewport space.
 *
 * **Why carets rather than glyph boxes.** A text cursor lives *between*
 * characters, so a run of n characters has n + 1 positions — and the two extra
 * facts an editor needs (where the run starts, where it ends) are precisely the
 * ones a list of glyph boxes leaves implicit. Reporting the slots directly also
 * means the host never has to reason about advance widths, kerning or trailing
 * whitespace to place a cursor.
 */

/** One laid-out line of a text block. */
export interface TextBlockLine {
    /**
     * Character range this line covers, `[start, end)`, as offsets into the
     * block's whole string. A hard line break is *not* part of either line.
     */
    start: number;
    end: number;
    /** Top and bottom of the line box, block-local. */
    top: number;
    bottom: number;
    /**
     * The x of every caret slot on this line, block-local, in offset order:
     * `carets[i]` is the slot at character `start + i`, so there are
     * `end - start + 1` of them — one before each character plus one after the
     * last. Ordered left-to-right; bidirectional text is not modelled in v1.
     */
    carets: number[];
}

/**
 * A shaped text block: its lines, and the size the shaping produced.
 *
 * `width`/`height` are the block's own extent, which is what a hugging node
 * measures to — not the box it may have been aligned within.
 */
export interface TextBlockLayout {
    lines: TextBlockLine[];
    width: number;
    height: number;
}

/**
 * The caret slot count implied by a layout — i.e. one past the last character.
 *
 * Lines exclude their line break, so summing their slots would count the breaks
 * twice and lose the final position; this reads it off the last line instead.
 */
export function caretCount(layout: TextBlockLayout): number {
    const last = layout.lines[layout.lines.length - 1];
    return last ? last.end + 1 : 1;
}
