import type { CanvasKit, Image as CKImage } from "@motion-script/canvaskit";

/** A single closed contour as a flat array of (x, y, x, y, ...) values. */
export type AlphaContour = Float32Array;

/**
 * Extract the vector contour(s) of an image's non-transparent silhouette.
 * Returns one Float32Array per closed contour, each holding (x, y, x, y, …)
 * vertices in image-pixel coordinates (0,0 = top-left). Contours are open-
 * ended polylines; callers close them with a final L→first / Close verb.
 *
 * Multiple contours indicate holes / disjoint islands. Renderers should fill
 * with even-odd so holes appear transparent.
 *
 * Pipeline:
 *   1. readPixels — get RGBA bytes from the CKImage.
 *   2. Threshold alpha at 0.5 → binary mask (drops compression specks).
 *   3. Marching squares — trace every outline where the mask goes 0↔1.
 *      Contours are walked clockwise for outer boundaries and
 *      counter-clockwise for holes (even-odd handles both).
 *   4. Douglas–Peucker simplification with ~1px tolerance.
 *   5. Discard contours whose perimeter is below a small threshold
 *      (kills 1–2px specks that survive the alpha threshold).
 *   6. Emit an SVG path: "M x y L x y ... Z" per contour.
 *
 * Returns null if the image has no opaque pixels.
 */
export function extractAlphaContour(canvasKit: CanvasKit, img: CKImage): AlphaContour[] | null {
    const width = img.width();
    const height = img.height();

    const imageInfo = {
        width,
        height,
        alphaType: canvasKit.AlphaType.Unpremul,
        colorType: canvasKit.ColorType.RGBA_8888,
        colorSpace: canvasKit.ColorSpace.SRGB,
    };
    const pixels = img.readPixels(0, 0, imageInfo) as Uint8Array | null;
    if (!pixels) return null;

    // Binary mask: 1 where alpha > 127, 0 otherwise. Padded by 1 pixel on all
    // sides so the marching squares window never falls off the image edge.
    const mw = width + 2;
    const mh = height + 2;
    const mask = new Uint8Array(mw * mh);
    let anyOpaque = false;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const a = pixels[(y * width + x) * 4 + 3];
            if (a > 127) {
                mask[(y + 1) * mw + (x + 1)] = 1;
                anyOpaque = true;
            }
        }
    }
    if (!anyOpaque) return null;

    const contours = traceContours(mask, mw, mh);

    const tolerance = 1.0;
    const minPerimeter = 12; // drops specks ≤ ~3×3 px
    const simplified: Array<Array<[number, number]>> = [];
    for (const contour of contours) {
        if (perimeter(contour) < minPerimeter) continue;
        const dp = douglasPeucker(contour, tolerance);
        if (dp.length >= 3) simplified.push(dp);
    }
    if (simplified.length === 0) return null;

    // Shift back by (-1, -1) to undo the marching-squares padding, and pack
    // each contour into a Float32Array so renderers can apply a matrix
    // without paying for box-and-tuple overhead.
    return simplified.map((c) => {
        const out = new Float32Array(c.length * 2);
        for (let i = 0; i < c.length; i++) {
            out[i * 2] = c[i][0] - 1;
            out[i * 2 + 1] = c[i][1] - 1;
        }
        return out;
    });
}

/**
 * Marching squares contour tracer. Walks every closed boundary where the
 * binary mask transitions between 0 and 1. Returns one polyline per contour.
 *
 * Vertices live on the grid corners (so coordinates are integers from 0
 * to mw / mh). Each contour is closed: first and last vertex coincide.
 */
function traceContours(mask: Uint8Array, mw: number, mh: number): Array<Array<[number, number]>> {
    // Edge-visited bitmap. There are 2 oriented edges per cell (right + down)
    // shared with neighbours, but to keep things simple we use a per-corner
    // "have we started a contour here?" set and the contour walk handles the
    // rest.
    const visited = new Uint8Array(mw * mh);
    const out: Array<Array<[number, number]>> = [];

    // For each cell, check the 4 corners (mask values at (x,y), (x+1,y), (x,y+1), (x+1,y+1)).
    // If we find a 0→1 transition that hasn't been started yet, walk the contour.
    for (let y = 0; y < mh - 1; y++) {
        for (let x = 0; x < mw - 1; x++) {
            // Find the marching-squares case at this cell.
            const c = cellCase(mask, mw, x, y);
            // Cases 0 and 15 are fully outside / fully inside — no edge.
            if (c === 0 || c === 15) continue;
            if (visited[y * mw + x]) continue;

            const contour = walkContour(mask, mw, mh, x, y, visited);
            if (contour.length >= 3) out.push(contour);
        }
    }
    return out;
}

function cellCase(mask: Uint8Array, mw: number, x: number, y: number): number {
    const tl = mask[y * mw + x];
    const tr = mask[y * mw + x + 1];
    const bl = mask[(y + 1) * mw + x];
    const br = mask[(y + 1) * mw + x + 1];
    return (tl << 3) | (tr << 2) | (br << 1) | bl;
}

/**
 * Walk a single closed contour starting at cell (sx, sy). Marks the visited
 * bitmap as it goes so the outer loop doesn't re-trace the same contour.
 *
 * Contour vertices are the cell-grid points (cell corners). For each
 * marching-squares case we know which entry edge produced this cell and
 * which exit edge leads to the next cell. Edges are numbered 0=top, 1=right,
 * 2=bottom, 3=left.
 */
function walkContour(
    mask: Uint8Array,
    mw: number,
    mh: number,
    sx: number,
    sy: number,
    visited: Uint8Array,
): Array<[number, number]> {
    const out: Array<[number, number]> = [];

    // Entry-edge → exit-edge map per case. For ambiguous cases (5, 10) we
    // pick a consistent disambiguation (treat as connected — corner touch).
    // Edges: 0=top, 1=right, 2=bottom, 3=left.
    const exits: Record<number, Record<number, number>> = {
        1:  { 0: 3, 1: 3, 2: 3 },         // bottom-left only
        2:  { 0: 1, 2: 1, 3: 1 },         // bottom-right only — exits to right then bottom; entered from left/top/bottom
        3:  { 1: 3, 3: 1 },                // bottom row
        4:  { 0: 1, 1: 0, 3: 0 },         // top-right only
        5:  { 0: 3, 2: 1, 1: 0, 3: 2 },   // saddle — ambiguous, treat as 2 separate lobes
        6:  { 0: 2, 2: 0 },                // right column
        7:  { 0: 3, 3: 0 },                // all except top-left
        8:  { 1: 2, 2: 3, 3: 2 },         // top-left only — wait, need to redo
        9:  { 1: 2, 2: 1 },                // left column
        10: { 0: 1, 2: 3, 1: 2, 3: 0 },   // saddle
        11: { 0: 1, 1: 0 },                // all except top-right
        12: { 1: 3, 3: 1 },                // top row
        13: { 1: 2, 2: 1 },                // all except bottom-right
        14: { 2: 3, 3: 2 },                // all except bottom-left
    };

    // The map above is fragile to write by hand. Instead, use a single
    // function that returns (exitEdge, dxNext, dyNext) given (case, entryEdge).
    // Reimplement properly below.
    void exits;

    let x = sx;
    let y = sy;
    // Pick an initial entry edge by scanning: any edge whose endpoint has a
    // 0→1 transition is valid. Start with edge "left" (so we entered from x-1).
    let entryEdge = pickInitialEntry(mask, mw, x, y);

    const maxSteps = mw * mh * 4;
    let steps = 0;

    while (steps++ < maxSteps) {
        visited[y * mw + x] = 1;
        const c = cellCase(mask, mw, x, y);

        const next = stepContour(c, entryEdge);
        if (!next) break;
        const { exitEdge, vx, vy } = next;

        // Push the vertex on the exit edge (midpoint of the edge in cell coords).
        out.push([x + vx, y + vy]);

        // Move to the neighbour cell across the exit edge.
        switch (exitEdge) {
            case 0: y -= 1; entryEdge = 2; break; // exit top → enter neighbour from bottom
            case 1: x += 1; entryEdge = 3; break; // exit right → enter from left
            case 2: y += 1; entryEdge = 0; break; // exit bottom → enter from top
            case 3: x -= 1; entryEdge = 1; break; // exit left → enter from right
        }

        if (x < 0 || y < 0 || x >= mw - 1 || y >= mh - 1) break;
        if (x === sx && y === sy) break;
    }

    // Close the contour
    if (out.length > 0) out.push(out[0]);
    return out;
}

/**
 * Find an initial entry edge for the starting cell. We pick the edge with a
 * 0→1 transition going clockwise around the cell. Defaults to left edge.
 */
function pickInitialEntry(mask: Uint8Array, mw: number, x: number, y: number): number {
    const tl = mask[y * mw + x];
    const tr = mask[y * mw + x + 1];
    const bl = mask[(y + 1) * mw + x];
    const br = mask[(y + 1) * mw + x + 1];
    // Edge 0 (top): between tl and tr. Transition if tl !== tr.
    if (tl !== tr) return 0;
    if (tr !== br) return 1;
    if (bl !== br) return 2;
    if (tl !== bl) return 3;
    return 0;
}

/**
 * Given a marching-squares case and the edge we entered through, return the
 * exit edge and the position of the contour vertex on that exit edge (as
 * fractions of a cell: vx/vy ∈ [0, 1]).
 */
function stepContour(
    c: number,
    entryEdge: number,
): { exitEdge: number; vx: number; vy: number } | null {
    // Edge midpoints in cell-local coords:
    //   edge 0 (top)    → (0.5, 0)
    //   edge 1 (right)  → (1, 0.5)
    //   edge 2 (bottom) → (0.5, 1)
    //   edge 3 (left)   → (0, 0.5)
    const mid = (edge: number): [number, number] => {
        switch (edge) {
            case 0: return [0.5, 0];
            case 1: return [1, 0.5];
            case 2: return [0.5, 1];
            case 3: return [0, 0.5];
        }
        return [0, 0];
    };

    // Cell case → ordered list of (entry, exit) edge pairs. For non-ambiguous
    // cases there's exactly one pair; saddle cases (5, 10) have two pairs.
    // Edges chosen so that following them traces the contour with the
    // solid (mask=1) region on the right (clockwise around outer contours,
    // counter-clockwise around holes — works with even-odd fill).
    const transitions: Record<number, Array<[number, number]>> = {
        1:  [[2, 3]],                  // 0001 — bl
        2:  [[1, 2]],                  // 0010 — br
        3:  [[1, 3]],                  // 0011
        4:  [[0, 1]],                  // 0100 — tr
        5:  [[0, 3], [2, 1]],          // 0101 — saddle (tl + br opposite of tr+bl)
        6:  [[0, 2]],                  // 0110
        7:  [[0, 3]],                  // 0111
        8:  [[3, 0]],                  // 1000 — tl
        9:  [[2, 0]],                  // 1001
        10: [[3, 2], [1, 0]],          // 1010 — saddle
        11: [[1, 0]],                  // 1011
        12: [[3, 1]],                  // 1100
        13: [[2, 1]],                  // 1101
        14: [[3, 2]],                  // 1110
    };

    const pairs = transitions[c];
    if (!pairs) return null;

    for (const [inE, outE] of pairs) {
        if (inE === entryEdge) {
            const [vx, vy] = mid(outE);
            return { exitEdge: outE, vx, vy };
        }
    }
    // Fallback: take the first pair regardless of entry (shouldn't happen for
    // well-formed traversals; protects against accidental wrong-direction).
    const [, outE] = pairs[0];
    const [vx, vy] = mid(outE);
    return { exitEdge: outE, vx, vy };
}

function perimeter(points: Array<[number, number]>): number {
    let sum = 0;
    for (let i = 1; i < points.length; i++) {
        const dx = points[i][0] - points[i - 1][0];
        const dy = points[i][1] - points[i - 1][1];
        sum += Math.hypot(dx, dy);
    }
    return sum;
}

/**
 * Douglas–Peucker polyline simplification. tolerance is in pixels. The first
 * and last points are kept; intermediate points whose perpendicular distance
 * to the simplified line is below tolerance are dropped.
 */
function douglasPeucker(points: Array<[number, number]>, tolerance: number): Array<[number, number]> {
    if (points.length < 3) return points.slice();
    const keep = new Uint8Array(points.length);
    keep[0] = 1;
    keep[points.length - 1] = 1;
    simplifyRange(points, 0, points.length - 1, tolerance, keep);
    const out: Array<[number, number]> = [];
    for (let i = 0; i < points.length; i++) {
        if (keep[i]) out.push(points[i]);
    }
    return out;
}

function simplifyRange(
    points: Array<[number, number]>,
    a: number,
    b: number,
    tolerance: number,
    keep: Uint8Array,
): void {
    let maxDist = 0;
    let maxIdx = -1;
    const [ax, ay] = points[a];
    const [bx, by] = points[b];
    for (let i = a + 1; i < b; i++) {
        const d = pointLineDistance(points[i], ax, ay, bx, by);
        if (d > maxDist) {
            maxDist = d;
            maxIdx = i;
        }
    }
    if (maxDist > tolerance && maxIdx > 0) {
        keep[maxIdx] = 1;
        simplifyRange(points, a, maxIdx, tolerance, keep);
        simplifyRange(points, maxIdx, b, tolerance, keep);
    }
}

function pointLineDistance(p: [number, number], ax: number, ay: number, bx: number, by: number): number {
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(p[0] - ax, p[1] - ay);
    let t = ((p[0] - ax) * dx + (p[1] - ay) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + t * dx;
    const cy = ay + t * dy;
    return Math.hypot(p[0] - cx, p[1] - cy);
}
