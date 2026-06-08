/**
 * A range over a code document. Lines and columns are 1-indexed.
 *
 * `endLine`/`endCol` may be `Infinity` to mean "to the end of the line" or
 * "to the end of the document".
 */
export interface CodeRange {
    startLine: number;
    startCol: number;
    endLine: number;
    endCol: number;
}

/**
 * Create a range that spans `length` characters starting at (line, col).
 * If `length` is omitted, the range extends to the end of the line.
 *
 * Example:
 *   word(1, 3, 3)   // line 1, column 3, spans 3 characters
 *   word(1, 3)      // line 1, column 3, to end of line
 */
export function word(line: number, col: number, length?: number): CodeRange {
    return {
        startLine: line,
        startCol: col,
        endLine: line,
        endCol: length === undefined ? Infinity : col + length,
    };
}

/**
 * Create a range that covers entire lines from `from` to `to` (inclusive).
 * If `to` is omitted, only line `from` is covered.
 *
 * Example:
 *   lines(1, 3)   // lines 1 through 3
 *   lines(2)      // line 2 only
 */
export function lines(from: number, to?: number): CodeRange {
    return {
        startLine: from,
        startCol: 1,
        endLine: to ?? from,
        endCol: Infinity,
    };
}

/**
 * Create an arbitrary range from (startLine, startCol) to (endLine, endCol).
 */
export function range(
    startLine: number,
    startCol: number,
    endLine: number,
    endCol: number,
): CodeRange {
    return { startLine, startCol, endLine, endCol };
}

/**
 * Convert a CodeRange to absolute character offsets [start, end) in the joined
 * source text, given the per-line lengths of that source. Lines/columns are
 * clamped into the document so out-of-bounds inputs produce a valid range.
 */
export function rangeToCharOffsets(
    r: CodeRange,
    lineLengths: number[],
): { start: number; end: number } {
    if (lineLengths.length === 0) return { start: 0, end: 0 };

    // Cumulative line starts in the joined string (lines joined with '\n').
    const lineStart: number[] = new Array(lineLengths.length);
    let acc = 0;
    for (let i = 0; i < lineLengths.length; i++) {
        lineStart[i] = acc;
        acc += lineLengths[i] + 1; // +1 for the joining newline
    }
    const docEnd = acc > 0 ? acc - 1 : 0; // strip trailing newline

    const clampLine = (n: number) =>
        Math.max(0, Math.min(lineLengths.length - 1, n - 1)); // to 0-indexed

    const sLine = clampLine(r.startLine);
    const eLine = clampLine(r.endLine);
    const sColMax = lineLengths[sLine];
    const eColMax = lineLengths[eLine];

    // Columns are 1-indexed; clamp to [1, lineLength+1] so endCol can sit past
    // the last char (one-past-end).
    const sCol = Math.max(0, Math.min(sColMax, r.startCol - 1));
    const eCol = r.endCol === Infinity
        ? eColMax
        : Math.max(0, Math.min(eColMax, r.endCol - 1));

    const start = Math.min(docEnd, lineStart[sLine] + sCol);
    const end = Math.min(docEnd, lineStart[eLine] + eCol);
    return { start: Math.min(start, end), end: Math.max(start, end) };
}

/**
 * Convert [start, end) character offsets in joined source to a CodeRange.
 * Lines/cols in the returned range are 1-indexed.
 */
export function charOffsetsToRange(
    start: number,
    end: number,
    lineLengths: number[],
): CodeRange {
    let off = 0;
    let startLine = 1, startCol = 1, endLine = 1, endCol = 1;
    let foundStart = false;
    for (let li = 0; li < lineLengths.length; li++) {
        const lineStart = off;
        const lineEnd = off + lineLengths[li];
        if (!foundStart && start >= lineStart && start <= lineEnd) {
            startLine = li + 1;
            startCol = (start - lineStart) + 1;
            foundStart = true;
        }
        if (end >= lineStart && end <= lineEnd) {
            endLine = li + 1;
            endCol = (end - lineStart) + 1;
            break;
        }
        off = lineEnd + 1;
    }
    return { startLine, startCol, endLine, endCol };
}
