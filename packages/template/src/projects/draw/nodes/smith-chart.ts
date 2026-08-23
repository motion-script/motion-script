import {
    ShapeNode, ShapeProps, NodeConfig, RenderContext2D, Graphics2D, Clip,
    Fills, property,
} from "motion-script";

export interface SmithChartProps extends ShapeProps {
    /** Boundary radius of the chart, in local px. The figure spans `[-radius, radius]`. */
    radius: number;
    /**
     * Whole-chart rotation in degrees. The reference orients the singularity
     * (the reactance-arc convergence point) at the bottom by turning 90°.
     */
    orientation: number;
    /** Colour of every line (grid, boundary, ticks, labels). */
    ink: string;
}

/** The Smith-chart "major" reactance/resistance values, drawn brighter and heavier. */
const MAJOR_STEPS = new Set([0, 0.2, 0.5, 1, 2, 5, 10]);

/**
 * Populate the resistance/reactance value ladder: ultra-fine near 0, expanding
 * out toward infinity. Mirrors the reference's `generateValues()` — dense low,
 * sparse high — so the conformal grid keeps a uniform *visual* density.
 */
function generateValues(): number[] {
    const vals: number[] = [];
    const addRange = (start: number, end: number, step: number) => {
        for (let i = start; i <= end + 0.0001; i += step) {
            vals.push(parseFloat(i.toFixed(3)));
        }
    };
    addRange(0, 1, 0.05);
    addRange(1.1, 2, 0.1);
    addRange(2.2, 5, 0.2);
    addRange(5.5, 10, 0.5);
    addRange(11, 20, 1);
    addRange(25, 50, 5);
    return [...new Set(vals)].sort((a, b) => a - b);
}

const VALUES = generateValues();

/**
 * A Smith chart painted *entirely from draw commands* — the whole conformal grid,
 * boundary ring and degree scale as one {@link Graphics2D} list inside
 * {@link renderSelf}, no Canvas 2D and no rAF loop.
 *
 * The figure is authored y-up in a box centred on the node origin spanning
 * `[-radius, radius]` (the renderer flips y to canvas), so there is no
 * `translate(cx, cy)` — the origin is already the centre. It reproduces the
 * reference HTML canvas exactly:
 *
 *  - a radial-gradient background glow (an `.ellipse()` filled with
 *    {@link Fills.radialGradient});
 *  - **constant-resistance** circles — nested `.ellipse()`s whose centres slide
 *    along the axis toward the singularity;
 *  - **constant-reactance** arcs — full circles orthogonal to the resistance
 *    family, drawn inside a `.mask()` clipped to the boundary so they can't spill
 *    (the reference used `ctx.clip()`); the `val === 0` limit degenerates to the
 *    straight axis, drawn as a `.line()`;
 *  - the boundary ring plus two faint outer rings, then a 360° tick scale with
 *    major/medium/minor `.line()` hierarchy and `.text()` labels every 20°.
 *
 * Each grid family is batched by style tier (major vs minor) and painted with a
 * single `.stroke()` so the whole tier joins as one union — matching how the
 * reference toggled `lineWidth`/`strokeStyle` between the two tiers. The whole
 * union is turned by {@link orientation} (default 90°) via the graphics-level
 * `.rotation()`, putting the singularity at the bottom like the reference.
 */
export class SmithChart extends ShapeNode<SmithChartProps> {

    @property({ default: 420 }) declare readonly radius: number;
    @property({ default: 90 }) declare readonly orientation: number;
    @property({ default: '#ffffff' }) declare readonly ink: string;

    constructor(props: NodeConfig<SmithChart, SmithChartProps>) {
        super(props);
        // Self-size to the design box (with headroom for the outer rings/labels)
        // so a bare <SmithChart /> lays out at its natural size in any container.
        const box = Number(props.radius ?? 420) * 2.3;
        this.applyProp("width", props.width ?? box);
        this.applyProp("height", props.height ?? box);
    }

    /** `rgba` helper so a single ink colour drives every tier's opacity, like the reference. */
    private rgba(alpha: number): string {
        // Accepts the common `#rrggbb`; falls back to the raw string otherwise.
        const hex = this.ink;
        if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
            const r = parseInt(hex.slice(1, 3), 16);
            const g = parseInt(hex.slice(3, 5), 16);
            const b = parseInt(hex.slice(5, 7), 16);
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        }
        return hex;
    }

    protected renderSelf(draw: RenderContext2D): void {
        const R = this.radius;
        const spin = this.orientation;

        // ── Pass 1: background glow + boundary-clipped conformal grid ─────────
        // The reactance arcs are full circles far larger than the disc, so — like
        // the reference's `ctx.clip()` — the grid is drawn inside a clip scope
        // shaped to the boundary. `beginClip`/`endClip` wrap *only* this draw, so
        // the crisp rings/ticks in pass 2 stay unclipped and can extend past the
        // disc. The clip disc is a circle centred on the origin, so the grid's own
        // group rotation doesn't disturb it.
        draw.beginClip(new Clip().ellipse({ x: 0, y: 0, width: R * 2, height: R * 2 }));

        const grid = new Graphics2D();

        // Background glow: faint centre → brighter rim, matching the reference's
        // radial gradient over the disc.
        grid.ellipse({ x: 0, y: 0, width: R * 2, height: R * 2 })
            .fill(Fills.radialGradient(
                [this.rgba(0.02), this.rgba(0.08)],
                { space: 'local', radius: 1 },
            ));

        // Each grid curve is its own shape+stroke pair. Accumulating many
        // concentric circles before a single stroke would union them into one
        // merged silhouette (interior edges vanish, like DrawnShape's blob); a
        // grid needs every circle stroked *independently*, so we pair one
        // `.ellipse()`/`.line()` with one `.stroke()` per curve — matching the
        // reference's per-curve `ctx.stroke()`.
        for (const val of VALUES) {
            const isMajor = MAJOR_STEPS.has(val);
            const stroke = {
                weight: isMajor ? 1.5 : 0.4,
                fill: isMajor ? this.rgba(0.9) : this.rgba(0.25),
            };

            // Family 1 — constant resistance: nested circles whose centres march
            // toward the singularity as val grows.
            const rCx = (val / (val + 1)) * R;
            const rRad = (1 / (val + 1)) * R;
            grid.ellipse({ x: rCx, y: 0, width: rRad * 2, height: rRad * 2 }).stroke(stroke);

            // Family 2 — constant reactance: orthogonal circles tangent at the
            // singularity. Two mirrored arcs per value; val === 0 is the straight
            // axis limit (the horizontal diameter).
            if (val > 0) {
                const xCy = (1 / val) * R;
                const xRad = (1 / val) * R;
                grid.ellipse({ x: R, y: xCy, width: xRad * 2, height: xRad * 2 }).stroke(stroke);
                grid.ellipse({ x: R, y: -xCy, width: xRad * 2, height: xRad * 2 }).stroke(stroke);
            } else {
                grid.line({ points: [{ x: -R, y: 0 }, { x: R, y: 0 }] }).stroke(stroke);
            }
        }

        // Pivot about the chart's true centre (local origin), not the union bbox
        // — the reactance circles are far larger than the disc, so a bbox-derived
        // pivot would be wildly off-centre.
        grid.rotation(spin, { x: 0, y: 0 });
        draw.draw(grid);

        draw.endClip();

        // ── Pass 2: crisp boundary rings + degree scale (unclipped) ───────────
        const g = new Graphics2D();

        g.ellipse({ x: 0, y: 0, width: R * 2, height: R * 2 })
            .stroke({ weight: 2, fill: this.rgba(0.9) });
        g.ellipse({ x: 0, y: 0, width: R * 2.12, height: R * 2.12 })
            .stroke({ weight: 1, fill: this.rgba(0.4) });
        g.ellipse({ x: 0, y: 0, width: R * 2.02, height: R * 2.02 })
            .stroke({ weight: 1, fill: this.rgba(0.4) });

        // Degree scale: 360 ticks with major/medium/minor hierarchy.
        const tickFontSize = Math.max(8, R * 0.025);
        for (let a = 0; a < 360; a++) {
            const angle = (a * Math.PI) / 180;
            const isMajor = a % 10 === 0;
            const isMedium = a % 5 === 0;

            const rInner = R * 1.01;
            const rOuter = isMajor ? R * 1.06 : isMedium ? R * 1.04 : R * 1.02;

            g.line({
                points: [
                    { x: rInner * Math.cos(angle), y: rInner * Math.sin(angle) },
                    { x: rOuter * Math.cos(angle), y: rOuter * Math.sin(angle) },
                ],
            }).stroke({
                weight: isMajor ? 1.5 : isMedium ? 1 : 0.5,
                fill: isMajor ? this.rgba(0.9) : this.rgba(0.4),
            });

            // Numeric labels on every second major tick, rotated to follow the arc.
            if (isMajor && a % 20 === 0) {
                const textR = R * 1.1;
                g.text({
                    text: a.toString(),
                    fontSize: tickFontSize,
                    fontFamily: 'Space Mono',
                    x: textR * Math.cos(angle),
                    y: textR * Math.sin(angle),
                    // The label positions are authored y-up (the renderer flips the
                    // position y to canvas), but `text` rotation is applied in
                    // un-flipped canvas (y-down) space. The canvas reference used
                    // `rotate(angle + 90°)`; reconciling the y-flip makes the tangent
                    // angle `90 - angleDeg`, so glyphs sit radial around the ring.
                    rotation: 90 - (angle * 180) / Math.PI,
                    pivot: 'center',
                }).fill(this.rgba(0.7));
            }
        }

        // Turn the whole scale as one union so the singularity sits at the bottom.
        g.rotation(spin, { x: 0, y: 0 });
        draw.draw(g);
    }
}
