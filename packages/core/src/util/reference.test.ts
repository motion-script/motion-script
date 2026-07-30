import { describe, it, expect } from 'vitest';
import { createRef } from '@/util/reference';
import { Rect } from '@/nodes/geometry/rect-node';
import { Ellipse } from '@/nodes/geometry/ellipse-node';
import { ShapeNode } from '@/nodes/geometry/shape-node';
import { Text } from '@/nodes/text/text-node';
import { Node } from '@/nodes/base/node';

describe('createRef', () => {
    it('throws when read before assignment', () => {
        const ref = createRef<number>();
        expect(() => ref()).toThrow(/not assigned/i);
    });

    it('returns the value after it is set', () => {
        const ref = createRef<string>();
        ref('hello');
        expect(ref()).toBe('hello');
    });

    it('overwrites the value on a second set', () => {
        const ref = createRef<number>();
        ref(1);
        ref(2);
        expect(ref()).toBe(2);
    });

    it('stores object references identically', () => {
        const ref = createRef<{ id: number }>();
        const obj = { id: 7 };
        ref(obj);
        expect(ref()).toBe(obj);
    });

    it('treats null as a cleared reference', () => {
        const ref = createRef<number>();
        ref(5);
        ref(null);
        expect(() => ref()).toThrow(/not assigned/i);
    });
});

/**
 * A node's `ref` slot is a `RefTarget`, not a `Reference`, so it accepts a ref
 * declared as a *supertype* of the node. These are compile-time assertions —
 * `typecheck` is what runs them; at runtime they only confirm the ref was
 * actually written. The `@ts-expect-error` lines are the load-bearing half: an
 * earlier attempt typed the slot as the bare setter, which looked equivalent
 * but let every one of them through (the zero-arg getter overload satisfies any
 * `(x) => void`).
 */
describe('ref variance', () => {
    it('accepts a ref declared as a supertype of the node', () => {
        const shape = createRef<ShapeNode>();
        const node = createRef<Node>();

        const rect = new Rect({ ref: shape, width: 10, height: 10 });
        new Ellipse({ ref: node, width: 10, height: 10 });

        expect(shape()).toBe(rect);
        // Reads narrow to what the ref was declared as, not what was stored.
        expect(typeof shape().fill).not.toBe('undefined');
    });

    it('rejects a ref declared as a subtype or sibling of the node', () => {
        // @ts-expect-error a `Reference<Rect>` would be handed a Text at runtime
        new Text({ ref: createRef<Rect>(), text: 'x' });
        // @ts-expect-error Ellipse is not a Rect
        new Rect({ ref: createRef<Ellipse>(), width: 10, height: 10 });
    });
});
