import { describe, it, expect } from 'vitest';
import { createRef } from '@/util/reference';

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
