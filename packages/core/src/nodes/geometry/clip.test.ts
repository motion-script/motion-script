import { describe, it, expect } from 'vitest';
import { Rect } from '@/nodes/geometry/rect-node';
import { Ellipse } from '@/nodes/geometry/ellipse-node';
import { Polygon } from '@/nodes/geometry/polygon-node';
import { Polygram } from '@/nodes/geometry/polygram-node';
import { Grid } from '@/nodes/geometry/grid-node';
import { ShapeNode, ShapeProps } from '@/nodes/geometry/shape-node';
import { Clip } from '@/render/clip';
import { NodeConfig } from '@/nodes/base/node';
import type { RenderContext } from '@/render/render-context';
import type { BoxBounds } from '@/attributes/layout/bounds';

/**
 * Records the clip / scope calls a node issues during render so tests can assert
 * the begin/end balance without a real CanvasKit surface. Every other
 * RenderContext method the ShapeNode pipeline touches is a no-op.
 */
class ClipRecorderContext {
    /** One entry per beginClip(), holding the Clip it was passed. */
    clips: Clip[] = [];
    /** Running depth of open clip scopes — must return to 0. */
    depth = 0;
    /** Max simultaneous open clips, for balance assertions. */
    private maxDepth = 0;

    beginClip(clip: Clip): void {
        this.clips.push(clip);
        this.depth++;
        if (this.depth > this.maxDepth) this.maxDepth = this.depth;
    }
    endClip(): void {
        this.depth--;
    }

    // ── Everything else the ShapeNode render path calls: no-ops ──────────────
    transform(): this { return this; }
    draw(): void { }
    begin(): void { }
    end(): void { }
    beginBackdropFilter(): void { }
    endBackdropFilter(): void { }
    beginBackgroundDistortion(): void { }
    endBackgroundDistortion(): void { }
    beginBackdropSkSL(): void { }
    endBackdropSkSL(): void { }
    beginForegroundDistortion(): void { }
    endForegroundDistortion(): void { }
    beginPosterize(): void { }
    endPosterize(): void { }
    beginBackdropPosterize(): void { }
    endBackdropPosterize(): void { }

    asCtx(): RenderContext {
        return this as unknown as RenderContext;
    }
}

/** Force a node's layout rect without running the layout pass. */
function setLayout(node: { layout: (r: BoxBounds, s: any) => void }, rect: BoxBounds): void {
    node.layout(rect, {} as any);
}

const RECT: BoxBounds = { x: 0, y: 0, width: 200, height: 120 };

describe('ShapeNode.clipSelf — geometry nodes describe their outline', () => {
    it('Rect clips to a rounded rect matching its layout + cornerRadius', () => {
        const rect = new Rect({ cornerRadius: 16 });
        setLayout(rect, RECT);

        const clip = (rect as any).clipSelf() as Clip;
        const ops = clip.ops();
        expect(ops).toHaveLength(1);
        expect(ops[0].kind).toBe('rect');
        expect((ops[0] as any).state).toMatchObject({ width: 200, height: 120 });
        expect((ops[0] as any).state.cornerRadius).toBeDefined();
    });

    it('Ellipse clips to an ellipse carrying its arc params', () => {
        const ell = new Ellipse({ sweep: 270, startAngle: 30, ratio: 0.8 });
        setLayout(ell, RECT);

        const ops = ((ell as any).clipSelf() as Clip).ops();
        expect(ops).toHaveLength(1);
        expect(ops[0].kind).toBe('ellipse');
        expect((ops[0] as any).state).toMatchObject({
            width: 200, height: 120, sweep: 270, startAngle: 30, ratio: 0.8,
        });
    });

    it('Polygon clips to a polygon with its side count', () => {
        const poly = new Polygon({ sides: 6, cornerRadius: 4 });
        setLayout(poly, RECT);

        const ops = ((poly as any).clipSelf() as Clip).ops();
        expect(ops).toHaveLength(1);
        expect(ops[0].kind).toBe('polygon');
        expect((ops[0] as any).state).toMatchObject({ sides: 6, cornerRadius: 4 });
    });

    it('Polygram clips to a star with its sides/ratio', () => {
        const star = new Polygram({ sides: 5, ratio: 0.4 });
        setLayout(star, RECT);

        const ops = ((star as any).clipSelf() as Clip).ops();
        expect(ops).toHaveLength(1);
        expect(ops[0].kind).toBe('polygram');
        expect((ops[0] as any).state).toMatchObject({ sides: 5, ratio: 0.4 });
    });

    it('Grid clips to a rounded rect like Rect', () => {
        const grid = new Grid({ columns: 2, cornerRadius: 8 });
        setLayout(grid, RECT);

        const ops = ((grid as any).clipSelf() as Clip).ops();
        expect(ops).toHaveLength(1);
        expect(ops[0].kind).toBe('rect');
        expect((ops[0] as any).state).toMatchObject({ width: 200, height: 120 });
    });
});

// A ShapeNode subclass with no clipSelf() override — the base behaviour.
class OutlinelessShape extends ShapeNode<ShapeProps> {
    constructor(props: NodeConfig<OutlinelessShape, ShapeProps>) { super(props); }
    protected renderSelf(): void { }
}

describe('ShapeNode clip scope balance during onRender', () => {
    it('clip=true on a shape with an outline opens exactly one balanced clip', () => {
        const rect = new Rect({ clip: true });
        setLayout(rect, RECT);

        const ctx = new ClipRecorderContext();
        rect.onRender(ctx.asCtx());

        expect(ctx.clips).toHaveLength(1);
        // The clip pushed is this node's own outline.
        expect(ctx.clips[0].ops()[0].kind).toBe('rect');
        // begin/end stayed balanced.
        expect(ctx.depth).toBe(0);
    });

    it('clip=false opens no clip scope', () => {
        const rect = new Rect({ clip: false });
        setLayout(rect, RECT);

        const ctx = new ClipRecorderContext();
        rect.onRender(ctx.asCtx());

        expect(ctx.clips).toHaveLength(0);
        expect(ctx.depth).toBe(0);
    });

    it('clip=true but no outline (base ShapeNode) opens no clip — stays balanced', () => {
        const shape = new OutlinelessShape({ clip: true });
        setLayout(shape, RECT);

        const ctx = new ClipRecorderContext();
        shape.onRender(ctx.asCtx());

        // clipSelf() is null → applyClip is a no-op → no dangling endClip.
        expect(ctx.clips).toHaveLength(0);
        expect(ctx.depth).toBe(0);
    });
});

describe('ShapeNode.applyClip (private) — pushes only a real outline', () => {
    it('returns true and pushes the outline when one exists', () => {
        const ell = new Ellipse({});
        setLayout(ell, RECT);
        const ctx = new ClipRecorderContext();

        const pushed = (ell as any).applyClip(ctx.asCtx());
        expect(pushed).toBe(true);
        expect(ctx.clips).toHaveLength(1);
        expect(ctx.clips[0].ops()[0].kind).toBe('ellipse');
    });

    it('returns false and pushes nothing when clipSelf() is null', () => {
        const shape = new OutlinelessShape({});
        setLayout(shape, RECT);
        const ctx = new ClipRecorderContext();

        const pushed = (shape as any).applyClip(ctx.asCtx());
        expect(pushed).toBe(false);
        expect(ctx.clips).toHaveLength(0);
    });

    it('returns false for an empty Clip outline', () => {
        const shape = new OutlinelessShape({});
        setLayout(shape, RECT);
        // Override clipSelf to return an empty Clip (only a cut, no shapes).
        (shape as any).clipSelf = () => new Clip().cut();
        const ctx = new ClipRecorderContext();

        expect((shape as any).applyClip(ctx.asCtx())).toBe(false);
        expect(ctx.clips).toHaveLength(0);
    });
});

describe('ShapeNode backdrop effects clip to clipSelf()', () => {
    it('a backdrop-blur shape clips its backdrop to its own outline', () => {
        const rect = new Rect({ effects: [{ type: 'blur', blur: 8, backdrop: true }] });
        setLayout(rect, RECT);

        const ctx = new ClipRecorderContext();
        rect.onRender(ctx.asCtx());

        // The backdrop layer is confined to the node's outline (one clip opened
        // for the backdrop scope), and the scope is balanced.
        expect(ctx.clips.length).toBeGreaterThanOrEqual(1);
        expect(ctx.clips[0].ops()[0].kind).toBe('rect');
        expect(ctx.depth).toBe(0);
    });

    it('a no-effects shape opens no backdrop clip', () => {
        const rect = new Rect({});
        setLayout(rect, RECT);

        const ctx = new ClipRecorderContext();
        rect.onRender(ctx.asCtx());

        // No backdrop effects and clip=false → no clip scope at all.
        expect(ctx.clips).toHaveLength(0);
        expect(ctx.depth).toBe(0);
    });
});
