import { describe, it, expect } from 'vitest';
import { property, getPropertyMeta, PROPERTY_META } from '@/attributes/properties/decorator';

describe('property decorator + getPropertyMeta', () => {
    it('registers a property with its default on the prototype', () => {
        class Node2D { }
        property({ default: 0 })(Node2D.prototype, 'x');

        const meta = getPropertyMeta(new Node2D());
        expect(meta).toHaveLength(1);
        expect(meta[0]).toMatchObject({ key: 'x', default: 0 });
    });

    it('omits options when neither mapper nor tween is given', () => {
        class Node2D { }
        property({ default: 1 })(Node2D.prototype, 'a');
        expect(getPropertyMeta(new Node2D())[0].options).toBeUndefined();
    });

    it('captures mapper/tween into options when provided', () => {
        class Node2D { }
        const mapper = (v: number) => v * 2;
        property({ mapper })(Node2D.prototype, 'scaled');
        const meta = getPropertyMeta(new Node2D())[0];
        expect(meta.options?.mapper).toBe(mapper);
    });

    it('does not register the same key twice on one class', () => {
        class Node2D { }
        property({ default: 0 })(Node2D.prototype, 'x');
        property({ default: 5 })(Node2D.prototype, 'x');
        const meta = getPropertyMeta(new Node2D());
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
        class Node2D { }
        property({ default: 0 })(Node2D.prototype, 'x');
        expect(Array.isArray((Node2D.prototype as any)[PROPERTY_META])).toBe(true);
    });
});
