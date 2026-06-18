import { describe, it, expect } from 'vitest';
import { Text } from '@/nodes/text/text-node';
import { PathBuilder } from '@/render/descriptors/path-builder';
import { PathCommand } from '@/render/descriptors/path';

describe('Text – path property (text-on-path)', () => {
    it('defaults path to null', () => {
        const t = new Text({ text: 'hello' });
        expect(t.path).toBeNull();
    });

    it('accepts an SVG path string', () => {
        const d = 'M 0 0 L 100 0';
        const t = new Text({ text: 'hello', path: d });
        expect(t.path).toBe(d);
    });

    it('accepts a PathCommand[] unchanged', () => {
        const cmds: PathCommand[] = [
            { type: 'M', x: 0, y: 0 },
            { type: 'L', x: 100, y: 0 },
        ];
        const t = new Text({ text: 'hello', path: cmds });
        expect(t.path).toBe(cmds);
    });

    it('coerces a PathBuilder to its commands', () => {
        const pb = new PathBuilder().moveTo(0, 0).lineTo(100, 0);
        const t = new Text({ text: 'hello', path: pb });
        expect(t.path).toEqual(pb.toCommands());
        // Stored value is the command array, not the builder instance.
        expect(t.path).not.toBe(pb);
    });

    it('updates path via set()', () => {
        const t = new Text({ text: 'hi', path: 'M 0 0 L 10 0' });
        t.set({ path: 'M 0 0 L 20 0' });
        expect(t.path).toBe('M 0 0 L 20 0');
    });
});

describe('Text – path and selections are mutually exclusive', () => {
    // Read the private state the renderer would receive.
    const renderState = (t: Text): any => {
        let captured: any;
        const fakeCtx = { draw: (g: any) => { captured = g; } } as any;
        (t as any).renderSelf(fakeCtx);
        // The text op is the first op recorded on the Graphics.
        return (captured as any)._ops.find((o: any) => o.kind === 'text').state;
    };

    it('skips selection segments when a path is set', () => {
        const t = new Text({ text: 'a cat and a cat', path: 'M 0 0 L 100 0' });
        // Make the selection active (non-identity) by mutating its overrides.
        t.find('cat').overrides.opacity = 0.5;
        const state = renderState(t);
        expect(state.path).toBe('M 0 0 L 100 0');
        expect(state.segments).toBeUndefined();
    });

    it('still builds segments when no path is set', () => {
        const t = new Text({ text: 'a cat and a cat' });
        t.find('cat').overrides.opacity = 0.5;
        const state = renderState(t);
        expect(state.path).toBeNull();
        expect(state.segments).toBeDefined();
    });
});
