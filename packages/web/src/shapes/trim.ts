import type { CanvasKit, Path as CKPath } from "@motion-script/canvaskit";

/**
 * Returns the sub-path spanning [start, end] (fractions of total contour
 * length, measured across all contours combined) by walking each contour with
 * `ContourMeasureIter` and stitching the overlapping segments back into one
 * path. Falls back to the original path if it has zero length, and to a
 * degenerate point path if the range selects nothing.
 */
export function trimPath(canvasKit: CanvasKit, ckPath: CKPath, start: number, end: number): CKPath {
    let totalLength = 0;
    let iter = new canvasKit.ContourMeasureIter(ckPath, false, 1);
    let contour = iter.next();
    while (contour) {
        totalLength += contour.length();
        contour.delete();
        contour = iter.next();
    }
    iter.delete();

    if (totalLength <= 0) return ckPath;

    const startD = start * totalLength;
    const endD = end * totalLength;
    const segments: CKPath[] = [];

    iter = new canvasKit.ContourMeasureIter(ckPath, false, 1);
    let accumulated = 0;
    contour = iter.next();
    while (contour) {
        const len = contour.length();
        const contourStart = accumulated;
        const contourEnd = accumulated + len;
        if (contourEnd > startD && contourStart < endD) {
            const segStart = Math.max(0, startD - contourStart);
            const segEnd = Math.min(len, endD - contourStart);
            segments.push(contour.getSegment(segStart, segEnd, true));
        }
        accumulated = contourEnd;
        contour.delete();
        contour = iter.next();
    }
    iter.delete();

    if (segments.length === 0) {
        return canvasKit.Path.MakeFromSVGString("M 0 0") ?? ckPath;
    }
    if (segments.length === 1) return segments[0];

    const svgParts = segments.map(s => s.toSVGString());
    segments.forEach(s => s.delete());
    return canvasKit.Path.MakeFromSVGString(svgParts.join(" ")) ?? ckPath;
}
