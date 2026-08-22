import { Vector2 } from "@/attributes/layout/vector2";

/**
 * A 2D transform stored as the members of a 3×3 matrix:
 *
 * ```
 * | a c e |
 * | b d f |
 * | g h i |
 * ```
 *
 * Point mapping is `x' = (a·x + c·y + e) / w`, `y' = (b·x + d·y + f) / w`, with
 * `w = g·x + h·y + i`. This is the same column-order convention CanvasKit/DOM
 * use, so matrices compose in draw order: `parent.multiply(child)` is the world
 * transform of `child`.
 *
 * **The bottom row is optional, and leaving it off means `[0 0 1]`** — an
 * ordinary affine transform, where `w` is 1 everywhere and the divide falls
 * away. Every matrix in the engine was exactly that until
 * {@link nodeProjectedMatrix} arrived: a node tilted out of its own plane
 * projects through a *homography*, and a homography does not fit in six numbers.
 * Rather than a second matrix type — with a second `multiply`, `invert` and
 * `applyToPoint` beside it, which is precisely how a renderer and a hit test end
 * up disagreeing about where a node is — the row lives here, and everything that
 * has no use for it simply omits it.
 */
/** @internal */
export interface Matrix2D {
    a: number; b: number; c: number; d: number; e: number; f: number;
    /** Perspective row, x term. Omitted on an affine transform (means `0`). */
    g?: number;
    /** Perspective row, y term. Omitted on an affine transform (means `0`). */
    h?: number;
    /** Perspective row, constant term. Omitted on an affine transform (means `1`). */
    i?: number;
}

/** @internal Whether `m` carries a perspective row — i.e. whether `w` is not always 1. */
export function isProjective(m: Matrix2D): boolean {
    return (m.g ?? 0) !== 0 || (m.h ?? 0) !== 0 || (m.i ?? 1) !== 1;
}

/**
 * Guard the perspective divide. A point on the vanishing line has `w = 0` and
 * projects to infinity, which is a real answer no coordinate can hold; clamping
 * to a tiny same-signed `w` sends it far off-screen instead, which is where it
 * belongs and is a number the caller can keep doing arithmetic with. Without
 * this, one degenerate corner turns an anchor set into `Infinity`/`NaN` and
 * takes the selection box, the hit test and any layout reading it with it.
 */
const MIN_W = 1e-6;
function safeW(w: number): number {
    if (w > MIN_W || w < -MIN_W) return w;
    return w < 0 ? -MIN_W : MIN_W;
}

/** @internal The identity transform — maps every point to itself. */
export function identity(): Matrix2D {
    return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
}

/** @internal Pure translation by (tx, ty). */
export function translation(tx: number, ty: number): Matrix2D {
    return { a: 1, b: 0, c: 0, d: 1, e: tx, f: ty };
}

/**
 * `m1 · m2` — the transform that applies `m2` first, then `m1`. Composing an
 * ancestor with a descendant (`ancestor.multiply(descendant)`) yields the
 * descendant's world transform.
 *
 * Two affine matrices take the six-member path they always did — that is every
 * composition in a scene with no 3D in it, once per node per parent per frame —
 * and the general 3×3 product runs only when one side actually carries a
 * perspective row.
 */
/** @internal */
export function multiply(m1: Matrix2D, m2: Matrix2D): Matrix2D {
    if (isProjective(m1) || isProjective(m2)) return multiplyProjective(m1, m2);
    return {
        a: m1.a * m2.a + m1.c * m2.b,
        b: m1.b * m2.a + m1.d * m2.b,
        c: m1.a * m2.c + m1.c * m2.d,
        d: m1.b * m2.c + m1.d * m2.d,
        e: m1.a * m2.e + m1.c * m2.f + m1.e,
        f: m1.b * m2.e + m1.d * m2.f + m1.f,
    };
}

/** The full 3×3 product, rows `[a c e] [b d f] [g h i]`. See {@link multiply}. */
function multiplyProjective(m1: Matrix2D, m2: Matrix2D): Matrix2D {
    const g1 = m1.g ?? 0, h1 = m1.h ?? 0, i1 = m1.i ?? 1;
    const g2 = m2.g ?? 0, h2 = m2.h ?? 0, i2 = m2.i ?? 1;
    return {
        a: m1.a * m2.a + m1.c * m2.b + m1.e * g2,
        c: m1.a * m2.c + m1.c * m2.d + m1.e * h2,
        e: m1.a * m2.e + m1.c * m2.f + m1.e * i2,
        b: m1.b * m2.a + m1.d * m2.b + m1.f * g2,
        d: m1.b * m2.c + m1.d * m2.d + m1.f * h2,
        f: m1.b * m2.e + m1.d * m2.f + m1.f * i2,
        g: g1 * m2.a + h1 * m2.b + i1 * g2,
        h: g1 * m2.c + h1 * m2.d + i1 * h2,
        i: g1 * m2.e + h1 * m2.f + i1 * i2,
    };
}

/** @internal Map a point through the transform. */
export function applyToPoint(m: Matrix2D, p: Vector2): Vector2 {
    const x = m.a * p.x + m.c * p.y + m.e;
    const y = m.b * p.x + m.d * p.y + m.f;
    if (!isProjective(m)) return { x, y };
    const w = safeW((m.g ?? 0) * p.x + (m.h ?? 0) * p.y + (m.i ?? 1));
    return { x: x / w, y: y / w };
}

/**
 * The inverse transform, or `null` when `m` is singular (a zero scale collapses
 * the plane, so no inverse exists). Used to map a viewport-space point back into
 * a node's local space for hit testing.
 */
/** @internal */
export function invert(m: Matrix2D): Matrix2D | null {
    if (isProjective(m)) return invertProjective(m);
    const det = m.a * m.d - m.b * m.c;
    if (det === 0 || !Number.isFinite(det)) return null;
    const inv = 1 / det;
    return {
        a: m.d * inv,
        b: -m.b * inv,
        c: -m.c * inv,
        d: m.a * inv,
        e: (m.c * m.f - m.d * m.e) * inv,
        f: (m.b * m.e - m.a * m.f) * inv,
    };
}

/**
 * The inverse of a homography — the adjugate over the determinant, written out
 * in this module's row naming. A projective inverse is still a homography, which
 * is what lets picking keep mapping a viewport point back into a node's local
 * space with nothing but {@link applyToPoint} once the node is tilted.
 */
function invertProjective(m: Matrix2D): Matrix2D | null {
    const { a, b, c, d, e, f } = m;
    const g = m.g ?? 0, h = m.h ?? 0, i = m.i ?? 1;
    // Cofactors of the 3×3 | a c e | / | b d f | / | g h i |.
    const A = d * i - f * h;
    const C = f * g - b * i;
    const E = b * h - d * g;
    const det = a * A + c * C + e * E;
    if (det === 0 || !Number.isFinite(det)) return null;
    const inv = 1 / det;
    return {
        a: A * inv,
        c: (e * h - c * i) * inv,
        e: (c * f - e * d) * inv,
        b: C * inv,
        d: (a * i - e * g) * inv,
        f: (e * b - a * f) * inv,
        g: E * inv,
        h: (c * g - a * h) * inv,
        i: (a * d - c * b) * inv,
    };
}

/**
 * The viewport transform a camera scope pushes, in canvas (y-down) space — a
 * literal transcription of `RenderContext.beginCamera`:
 *
 *   translate(vx, vy) · rotate(-heading) · scale(zoom) · translate(-lookAt.x, +lookAt.y)
 *
 * `lookAt` is a y-up world point, hence the sign flip on its y. `vx`/`vy` are the
 * viewport centre the camera's callers pass (`layoutRect.x`, `-layoutRect.y`).
 * Kept next to {@link nodeLocalMatrix} so the two stay in step with the renderer.
 */
/** @internal */
export function cameraMatrix(
    vx: number, vy: number, lookAt: Vector2, zoom: number, heading: number,
): Matrix2D {
    const rad = (-heading * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    // rotate(-heading) · scale(zoom), the same clockwise canvas convention as
    // nodeLocalMatrix's R·S block.
    const a = zoom * cos;
    const b = zoom * sin;
    const c = zoom * -sin;
    const d = zoom * cos;
    // Fold the trailing translate(-lookAt.x, +lookAt.y) into e/f.
    const tx = -lookAt.x;
    const ty = lookAt.y;
    return { a, b, c, d, e: vx + a * tx + c * ty, f: vy + b * tx + d * ty };
}

/**
 * Build the local transform for a node, matching the renderer's
 * `RenderContext.transform` exactly (canvas y-down space):
 * `T(cx + pivotX, cy + pivotY) · R(deg) · S(scale) · T(-pivotX, -pivotY)`.
 *
 * @param cx       Canvas-space x of the node's layout-cell lookAt.
 * @param cy       Canvas-space y of the node's layout-cell origin (y-down).
 * @param rotation Rotation in degrees, clockwise (canvas convention).
 * @param scale    Uniform scale factor.
 * @param pivotX   Pivot offset in pixels, x.
 * @param pivotY   Pivot offset in pixels, y (canvas y-down).
 */
/** @internal */
export function nodeLocalMatrix(
    cx: number, cy: number, rotation: number, scale: number, pivotX: number, pivotY: number,
): Matrix2D {
    const rad = (rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    // R(deg) · S(scale): clockwise rotation in canvas (y-down) is
    // | cos -sin | · | s 0 | = | s·cos -s·sin |
    // | sin  cos |   | 0 s |   | s·sin  s·cos |
    const a = scale * cos;
    const b = scale * sin;
    const c = scale * -sin;
    const d = scale * cos;
    // Fold the pivot translations into e/f:
    // T(cx+pivotX, cy+pivotY) · (RS) · T(-pivotX, -pivotY)
    return {
        a, b, c, d,
        e: cx + pivotX - (a * pivotX + c * pivotY),
        f: cy + pivotY - (b * pivotX + d * pivotY),
    };
}

/**
 * The out-of-plane half of a node's transform — the mirrors, the two extra
 * rotation axes, the push along z and the perspective divide that makes them
 * read as depth rather than as squashing. See {@link nodeProjectedMatrix}.
 */
/** @internal */
export interface Projection3D {
    /** Tilt about the horizontal axis, degrees. Positive tips the top away. */
    rotationX: number;
    /** Tilt about the vertical axis, degrees. Positive swings the right edge away. */
    rotationY: number;
    /**
     * In-plane rotation belonging to the 3D block, degrees clockwise — the Z axis
     * of `Rx · Ry · Rz`.
     *
     * A prop of its own rather than a second name for the node's `rotation`, and
     * that is a deliberate separation: `rotation` is the node's **shape** — it
     * turns the box, the selection outline turns with it, and handles follow —
     * while this is part of the projection, which is paint. The two compose (a
     * Z rotation is a Z rotation, so they add), but they are two independent
     * numbers and editing one never moves the other.
     */
    rotationZ: number;
    /** Push along the view axis in px, applied after the rotations. Inert without `perspective`. */
    depth: number;
    /** Viewer distance in px. `0` is no perspective at all — a parallel projection. */
    perspective: number;
    /** Mirror across the node's vertical centre line. */
    flipHorizontal: boolean;
    /** Mirror across the node's horizontal centre line. */
    flipVertical: boolean;
}

/** @internal Every field of a {@link Projection3D} at rest — the plain 2D node. */
export const NO_PROJECTION_3D: Projection3D = {
    rotationX: 0,
    rotationY: 0,
    rotationZ: 0,
    depth: 0,
    perspective: 0,
    flipHorizontal: false,
    flipVertical: false,
};

/**
 * Whether `p` asks for anything {@link nodeLocalMatrix} cannot already express.
 * The gate in front of every projective path in the engine: a scene with no 3D
 * in it keeps the six-number matrix, the decomposed `translate/rotate/scale`
 * render path, and the affine `multiply` it always had.
 */
/** @internal */
export function hasProjection3D(p: Projection3D): boolean {
    return (
        p.rotationX !== 0 ||
        p.rotationY !== 0 ||
        p.rotationZ !== 0 ||
        p.flipHorizontal ||
        p.flipVertical ||
        (p.perspective !== 0 && p.depth !== 0)
    );
}

/**
 * Whether a plane carrying this projection has turned its back on the viewer —
 * the test behind `backfaceVisible`.
 *
 * Read off the tilt alone. The plane's normal starts at `(0,0,1)` and comes out
 * of `Rx·Ry` with a z of `cos(rotationX)·cos(rotationY)`; the in-plane rotation
 * can't change which way it points, and neither, deliberately, can a *mirror*.
 * CSS derives the answer from the whole accumulated matrix, where a `scaleX(-1)`
 * inverts orientation and hides the element — which is a surprising way to lose
 * a node you only meant to flip. Here a flip is a flip and a turn is a turn.
 */
/** @internal */
export function facesAway(rotationX: number, rotationY: number): boolean {
    const rad = Math.PI / 180;
    return Math.cos(rotationX * rad) * Math.cos(rotationY * rad) < 0;
}

/**
 * A node's local transform with the out-of-plane half folded in — the same space
 * and the same pivot convention as {@link nodeLocalMatrix}, which this reduces to
 * exactly when {@link hasProjection3D} is false.
 *
 * The composition, innermost first:
 *
 *   `T(pivot) · P(perspective) · Tz(depth) · Rx · Ry · Rz(rotationZ + rotation) · S(scale) · T(-pivot) · F(flip)`
 *
 * — everything about the pivot except the mirrors, which reflect about the
 * node's own centre so that flipping cannot move the node (see `F` below),
 *
 * which is CSS's own order for `rotateX(a) rotateY(b) rotateZ(c)` — the in-plane
 * rotation innermost, so that adding a tilt never changes what the node's own
 * `rotation` already meant.
 *
 * The Z angle is the **sum** of the two in-plane rotations the node carries, and
 * they stay two: `rotation` turns the node's *shape* — its box turns with it, and
 * so does anything reading that box — while {@link Projection3D.rotationZ} is
 * part of the projection, which is paint (see `Node._localMatrix`). Summing them
 * is not a coupling but the definition of composing two rotations about one axis;
 * neither number moves when the other is edited.
 *
 * The content is planar — every point enters with `z = 0` — so the whole thing
 * collapses to a 3×3 homography over `(x, y, 1)` rather than needing a 4×4 and a
 * separate divide step. The projected z survives only as the perspective row.
 *
 * @param cx     Canvas-space x of the node's positioned centre.
 * @param cy     Canvas-space y of the node's positioned centre (y-down).
 * @param rotation In-plane rotation in degrees, clockwise (the Z axis).
 * @param scale  Uniform scale factor.
 * @param pivotX Pivot offset from the centre in px, x.
 * @param pivotY Pivot offset from the centre in px, y (canvas y-down).
 * @param p      The out-of-plane fields.
 */
/** @internal */
export function nodeProjectedMatrix(
    cx: number, cy: number, rotation: number, scale: number, pivotX: number, pivotY: number,
    p: Projection3D,
): Matrix2D {
    if (!hasProjection3D(p)) {
        return nodeLocalMatrix(cx, cy, rotation, scale, pivotX, pivotY);
    }
    const rad = Math.PI / 180;
    const ca = Math.cos(p.rotationX * rad), sa = Math.sin(p.rotationX * rad);
    const cb = Math.cos(p.rotationY * rad), sb = Math.sin(p.rotationY * rad);
    // The two in-plane rotations compose into one angle — see the note above.
    const cz = (rotation + p.rotationZ) * rad;
    const cc = Math.cos(cz), sc = Math.sin(cz);

    // The two columns of Rx·Ry·Rz that a z = 0 point can reach, scaled.
    const A = cb * cc * scale;
    const C = -cb * sc * scale;
    const B = (sa * sb * cc + ca * sc) * scale;
    const D = (ca * cc - sa * sb * sc) * scale;
    // The row that would have been the projected z, had we kept one.
    const G = (sa * sc - ca * sb * cc) * scale;
    const H = (ca * sb * sc + sa * cc) * scale;

    // Perspective: a point at depth z lands at x/w with w = 1 - z/perspective.
    // No perspective means a parallel projection — z is simply dropped, w stays
    // 1, and the result is affine (which is also why `depth` alone does nothing).
    const invP = p.perspective !== 0 ? 1 / p.perspective : 0;
    const g = -G * invP;
    const h = -H * invP;
    // The z the pivot itself sits at: -(G·pivotX + H·pivotY) is what the shift to
    // pivot-relative coordinates leaves in the z row, and `depth` is the push
    // along it, applied after the tilt (so it moves the whole tilted plane).
    const i = 1 - (p.depth - (G * pivotX + H * pivotY)) * invP;

    // Numerators about the pivot, then the trailing translate folded in. A
    // translate composes onto a homography as `+ t·w`, hence the g/h/i terms.
    const tx = cx + pivotX;
    const ty = cy + pivotY;

    // The mirrors, applied **innermost and about the node's own centre** — a
    // final column negation, which is what `M · diag(fx, fy, 1)` comes to.
    //
    // Not about the pivot, unlike everything else here, and that is the whole
    // point: a flip is an in-place reflection. Composing it with the pivot the
    // way CSS's `scaleX(-1)` does means a node hinged anywhere but its middle
    // *swings* when you flip it — its position readout changes, its corner
    // handles land somewhere else, and the gesture stops meaning "mirror this"
    // and starts meaning "mirror this and move it". Every design tool flips
    // about the selection's own centre for that reason. Written as a column
    // scale rather than a `T(c)·F·T(-c)` sandwich because that is what one
    // reduces to here — the local frame is already centred on the node — which
    // leaves `e`/`f`/`i` untouched and makes "a flip cannot move the node" a
    // property of the arithmetic rather than a thing to remember.
    const fx = p.flipHorizontal ? -1 : 1;
    const fy = p.flipVertical ? -1 : 1;
    return {
        a: (A + tx * g) * fx,
        c: (C + tx * h) * fy,
        e: -(A * pivotX + C * pivotY) + tx * i,
        b: (B + ty * g) * fx,
        d: (D + ty * h) * fy,
        f: -(B * pivotX + D * pivotY) + ty * i,
        g: g * fx,
        h: h * fy,
        i,
    };
}
