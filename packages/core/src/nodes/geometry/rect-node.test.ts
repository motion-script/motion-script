import { describe, it, expect } from 'vitest';
import { Rect } from '@/nodes/geometry/rect-node';

describe('Rect – dispose then reuse (reinitProps)', () => {
    it('restores stroke and other signals to defaults after dispose + reinit', () => {
        const rect = new Rect({ stroke: { weight: 4, fill: 'red' }, group: 'column' });

        // Sanity: stroke resolves to an iterable array before disposal.
        expect(Array.isArray((rect as any).stroke)).toBe(true);

        // A prior playback controller's teardown frees every signal.
        rect.dispose();
        expect((rect as any).__signals).toBeUndefined();
        expect((rect as any).stroke).toBeUndefined();

        // Reusing the instance (StrictMode double-mount / HMR) must restore the
        // signal baseline so measure() can iterate stroke without crashing.
        (rect as any).reinitProps();

        const stroke = (rect as any).stroke;
        expect(Array.isArray(stroke)).toBe(true);
        // Back to the @property default, not the disposed undefined.
        expect(stroke).toEqual([]);
        // Rect's constructor-specific props are restored too.
        expect((rect as any).group).toBe('row');
        // The group tween closure works again (no throw, blends through).
        expect(() => rect.set({ group: 'stack' })).not.toThrow();
    });

    it('reinitProps is a no-op when signals are still live', () => {
        const rect = new Rect({ group: 'column' });
        const signalsBefore = (rect as any).__signals;
        (rect as any).reinitProps();
        // Same map instance — nothing was re-created.
        expect((rect as any).__signals).toBe(signalsBefore);
        expect((rect as any).group).toBe('column');
    });

    it('effectivePadding does not throw after dispose + reinit', () => {
        const rect = new Rect({ stroke: { weight: 6, align: -1 } });
        rect.dispose();
        (rect as any).reinitProps();
        // effectivePadding is private; reach it via measure which calls it.
        expect(() => (rect as any).effectivePadding()).not.toThrow();
    });
});
