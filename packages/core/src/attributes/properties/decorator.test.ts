import { describe, it, expect } from 'vitest';
import { property, getPropertyMeta, PROPERTY_META } from '@/attributes/properties/decorator';

describe('property decorator + getPropertyMeta', () => {
    it('registers a property with its default on the prototype', () => {
        class Node { }
        property({ default: 0 })(Node.prototype, 'x');

        const meta = getPropertyMeta(new Node());
        expect(meta).toHaveLength(1);
        expect(meta[0]).toMatchObject({ key: 'x', default: 0 });
    });

    it('omits options when neither mapper nor tween is given', () => {
        class Node { }
        property({ default: 1 })(Node.prototype, 'a');
        expect(getPropertyMeta(new Node())[0].options).toBeUndefined();
    });

    it('captures mapper/tween into options when provided', () => {
        class Node { }
        const mapper = (v: number) => v * 2;
        property({ mapper })(Node.prototype, 'scaled');
        const meta = getPropertyMeta(new Node())[0];
        expect(meta.options?.mapper).toBe(mapper);
    });

    it('does not register the same key twice on one class', () => {
        class Node { }
        property({ default: 0 })(Node.prototype, 'x');
        property({ default: 5 })(Node.prototype, 'x');
        const meta = getPropertyMeta(new Node());
        expect(meta.filter((m) => m.key === 'x')).toHaveLength(1);
    });

    it('orders inherited metadata base→subclass and dedupes by key', () => {
        class Base { }
        property({ default: 1 })(Base.prototype, 'base');

        class Sub extends Base { }
        property({ default: 2 })(Sub.prototype, 'sub');

        const meta = getPropertyMeta(new Sub());
        const keys = meta.map((m) => m.key);
        expect(keys).toEqual(['base', 'sub']);
    });

    it('stores metadata under the PROPERTY_META symbol', () => {
        class Node { }
        property({ default: 0 })(Node.prototype, 'x');
        expect(Array.isArray((Node.prototype as any)[PROPERTY_META])).toBe(true);
    });
});
