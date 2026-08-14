import { describe, it, expect } from 'vitest';
import { Rect } from '@/nodes/geometry/rect-node';
import { RootNode } from '@/nodes/scene/root-node';
import { Node } from '@/nodes/base/node';
import { FakeMeasureScope } from '@/runtime/runtime.fixtures';
import { BoxBounds } from '@/attributes/layout/bounds';
import { SizeInput } from '@/attributes/layout/size';

/**
 * A fixed-size leaf that exposes the box its parent laid it into. `layoutRect` is
 * protected on Node, so a test subclass is the supported seam for reading a
 * child's resolved position — same shape as the tile in rect-node.test.ts.
 */
class Tile extends Node {
    constructor(props: { width?: SizeInput; height?: SizeInput } & Record<string, unknown> = {}) {
        super(props as any);
    }
    get rect(): BoxBounds {
        return this.layoutRect;
    }
}

const VIEWPORT = { maxWidth: 1920, maxHeight: 1080 };

/** Build a laid-out scene root of the standard viewport size. */
function layoutStage(root: RootNode, scope: FakeMeasureScope): void {
    const size = root.measure(VIEWPORT, scope);
    root.layout({ x: 0, y: 0, width: size.width ?? 0, height: size.height ?? 0 }, scope);
}

describe('positioning — resolution', () => {
    it('defaults to relative, and a root has no parent to be absolute against', () => {
        const child = new Tile({ width: 10, height: 10 });
        const root = new RootNode({ width: 'fill', height: 'fill', children: [child] });
        expect(root.positioning).toBe('relative');
        expect(child.positioning).toBe('relative');
    });

    it("a child inherits its parent's childPositioning", () => {
        const child = new Tile({ width: 10, height: 10 });
        new Rect({ childPositioning: 'absolute', children: [child] });
        expect(child.positioning).toBe('absolute');
    });

    it('relativeToParent overrides the parent in both directions', () => {
        const pinned = new Tile({ width: 10, height: 10, relativeToParent: 'absolute' });
        new Rect({ children: [pinned] });
        expect(pinned.positioning).toBe('absolute');

        const flowed = new Tile({ width: 10, height: 10, relativeToParent: 'relative' });
        new Rect({ childPositioning: 'absolute', children: [flowed] });
        expect(flowed.positioning).toBe('relative');
    });
});

describe('positioning — absolute children leave the flow', () => {
    it('takes no gap and no flex share in a horizontal Rect', () => {
        const scope = new FakeMeasureScope();
        const a = new Tile({ width: 100, height: 100 });
        const b = new Tile({ width: 100, height: 100 });
        const pinned = new Tile({ width: 50, height: 50, relativeToParent: 'absolute' });
        const row = new Rect({ flow: 'horizontal', gap: 40, width: 'hug', height: 'hug', children: [a, pinned, b] });
        const root = new RootNode({ width: 'fill', height: 'fill', children: [row] });

        layoutStage(root, scope);

        // Two flow children, one gap: 100 + 40 + 100. The pinned tile neither
        // widens the hug nor opens a second gap.
        expect((row as any).layoutRect.width).toBe(240);
        expect(a.rect.x).toBe(-70);
        expect(b.rect.x).toBe(70);
    });

    it('does not contribute to a freeform hug size', () => {
        const scope = new FakeMeasureScope();
        const small = new Tile({ width: 100, height: 100 });
        const huge = new Tile({ width: 900, height: 900, relativeToParent: 'absolute' });
        const box = new Rect({ width: 'hug', height: 'hug', children: [small, huge] });
        const root = new RootNode({ width: 'fill', height: 'fill', children: [box] });

        layoutStage(root, scope);

        expect((box as any).layoutRect.width).toBe(100);
        expect((box as any).layoutRect.height).toBe(100);
    });

    it('a container holding only pinned children defaults to fill, like an empty one', () => {
        const pinned = new Tile({ width: 50, height: 50, relativeToParent: 'absolute' });
        const box = new Rect({ children: [pinned] });
        expect((box as any).width).toBe('fill');
        expect((box as any).height).toBe('fill');
    });
});

describe('positioning — absolute children are placed against the stage', () => {
    it('cancels the offset of a nested parent, so x/y read as scene coordinates', () => {
        const scope = new FakeMeasureScope();
        const pinned = new Tile({ width: 100, height: 100, relativeToParent: 'absolute' });
        // A hug column pushed to the left half of the stage: its own centre is
        // nowhere near the stage centre, which is exactly what has to be undone.
        const inner = new Rect({ width: 400, height: 400, x: -300, y: 200, children: [pinned] });
        const spacer = new Tile({ width: 400, height: 400 });
        const row = new Rect({ flow: 'horizontal', gap: 0, children: [spacer, inner] });
        const root = new RootNode({ width: 'fill', height: 'fill', children: [row] });

        layoutStage(root, scope);

        // The pinned tile's own x/y are 0, so it lands on the stage centre no
        // matter where `inner` ended up.
        expect(pinned.global.x).toBeCloseTo(0, 6);
        expect(pinned.global.y).toBeCloseTo(0, 6);
    });

    it("the child's own x/y then offset from the stage origin", () => {
        const scope = new FakeMeasureScope();
        const pinned = new Tile({ width: 100, height: 100, x: 250, y: -120, relativeToParent: 'absolute' });
        const inner = new Rect({ width: 400, height: 400, x: -300, children: [pinned] });
        const root = new RootNode({ width: 'fill', height: 'fill', children: [inner] });

        layoutStage(root, scope);

        expect(pinned.global.x).toBeCloseTo(250, 6);
        expect(pinned.global.y).toBeCloseTo(-120, 6);
    });

    it('measures against the stage, so width="fill" fills the scene rather than the parent', () => {
        const scope = new FakeMeasureScope();
        const pinned = new Tile({ width: 'fill', height: 'fill', relativeToParent: 'absolute' });
        const inner = new Rect({ width: 200, height: 200, children: [pinned] });
        const root = new RootNode({ width: 'fill', height: 'fill', children: [inner] });

        layoutStage(root, scope);

        expect(pinned.rect.width).toBe(1920);
        expect(pinned.rect.height).toBe(1080);
    });

    it('stays correct through a rotated ancestor', () => {
        const scope = new FakeMeasureScope();
        const pinned = new Tile({ width: 100, height: 100, relativeToParent: 'absolute' });
        const inner = new Rect({ width: 400, height: 400, x: 300, y: 100, rotation: 30, children: [pinned] });
        const root = new RootNode({ width: 'fill', height: 'fill', children: [inner] });

        layoutStage(root, scope);

        expect(pinned.global.x).toBeCloseTo(0, 6);
        expect(pinned.global.y).toBeCloseTo(0, 6);
    });

    it('a childPositioning="absolute" container pins every child it holds', () => {
        const scope = new FakeMeasureScope();
        const a = new Tile({ width: 100, height: 100, x: -400 });
        const b = new Tile({ width: 100, height: 100, x: 400 });
        const canvas = new Rect({ childPositioning: 'absolute', width: 600, height: 600, x: 120, children: [a, b] });
        const root = new RootNode({ width: 'fill', height: 'fill', children: [canvas] });

        layoutStage(root, scope);

        expect(a.global.x).toBeCloseTo(-400, 6);
        expect(b.global.x).toBeCloseTo(400, 6);
    });

    it('works through a plain Node container (the default layout path)', () => {
        const scope = new FakeMeasureScope();
        const pinned = new Tile({ width: 100, height: 100, x: 200, relativeToParent: 'absolute' });
        const holder = new Tile({ width: 300, height: 300, x: -500 });
        holder.addChild(pinned);
        const root = new RootNode({ width: 'fill', height: 'fill', children: [holder] });

        layoutStage(root, scope);

        expect(pinned.global.x).toBeCloseTo(200, 6);
    });
});
