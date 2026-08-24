import { describe, it, expect } from 'vitest';
import { getPropertyMeta } from '@/attributes/properties/decorator';
import {
    anchorProperty,
    colorProperty,
    cornerRadiusProperty,
    effectsProperty,
    fillProperty,
    insetsProperty,
    pathProperty,
    shadowProperty,
    sizeProperty,
    strokeProperty,
    textProperty,
    vector2Property,
} from '@/attributes/properties/typed';
import { resolveFillArray, lerpFillArray } from '@/attributes/shape/fill/registry';
import { Fills } from '@/attributes/shape/fill/chain';
import { Effects } from '@/attributes/shape/effects/chain';
import { Rect, RectProps } from '@/nodes/geometry/rect-node';
import { Node2D } from '@/nodes/2d/node2d';
import type { Fill } from '@/attributes/shape/fill/chain';
import type { Stroke } from '@/attributes/shape/stroke/mapper';
import type { Shadow } from '@/attributes/shape/shadow/resolver';
import type { Effect } from '@/attributes/shape/effects/chain';
import type { Color } from '@/attributes/shape/fill/color/parser';
import { attached } from '@/nodes/node/node.fixtures';

/** Read the single @property entry a decorator registered on a throwaway class. */
function metaFor(decorate: (target: object, key: string) => void, key = 'p') {
    class Host { }
    decorate(Host.prototype, key);
    return getPropertyMeta(new Host())[0];
}

describe('attribute-typed property decorators', () => {
    it('fillProperty registers the canonical fill mapper/tween pair', () => {
        const meta = metaFor(fillProperty(), 'glow');
        expect(meta.key).toBe('glow');
        expect(meta.options?.mapper).toBe(resolveFillArray);
        expect(meta.options?.tween).toBe(lerpFillArray);
        expect(meta.default).toEqual([]);
    });

    it('gives each declaration its own default array', () => {
        const a = metaFor(fillProperty(), 'a');
        const b = metaFor(strokeProperty(), 'b');
        expect(a.default).not.toBe(b.default);
        expect(a.default).toEqual([]);
    });

    it('takes a default in the loose author-facing form', () => {
        expect(metaFor(fillProperty({ default: 'red' })).default).toBe('red');
        expect(metaFor(cornerRadiusProperty({ default: 12 })).default).toBe(12);
        expect(metaFor(textProperty({ default: 'hi' })).default).toBe('hi');
    });

    it('lets mapper/tween be overridden per declaration', () => {
        const mapper = (v: Fill) => resolveFillArray(v);
        const tween = lerpFillArray;
        const meta = metaFor(fillProperty({ mapper, tween }));
        expect(meta.options?.mapper).toBe(mapper);
        expect(meta.options?.tween).toBe(tween);
    });

    it('carries a default for every attribute kind', () => {
        expect(metaFor(strokeProperty()).default).toEqual([]);
        expect(metaFor(shadowProperty()).default).toEqual([]);
        expect(metaFor(effectsProperty()).default).toEqual([]);
        expect(metaFor(colorProperty()).default).toBe('black');
        expect(metaFor(cornerRadiusProperty()).default).toBe(0);
        expect(metaFor(pathProperty()).default).toBe('');
        expect(metaFor(insetsProperty()).default).toBe(0);
        expect(metaFor(anchorProperty()).default).toBe('center');
        expect(metaFor(vector2Property()).default).toEqual({ x: 0, y: 0 });
        expect(metaFor(sizeProperty()).default).toBe('fill');
        expect(metaFor(textProperty()).default).toBe('');
    });
});

describe('attribute-typed props on a real node', () => {
    interface CardProps extends RectProps {
        glow: Fill;
        edge: Stroke;
        halo: Shadow;
        fx: Effect;
        tint: Color;
    }

    class Card extends Rect<CardProps> {
        @fillProperty({ default: 'red' }) declare glow: Fill;
        @strokeProperty() declare edge: Stroke;
        @shadowProperty() declare halo: Shadow;
        @effectsProperty() declare fx: Effect;
        @colorProperty({ default: 'white' }) declare tint: Color;
    }

    it('resolves the declared default through the mapper', () => {
        const card = new Card({});
        expect(card.glow).toEqual([{ type: 'solid', color: [1, 0, 0, 1], opacity: undefined, blend: undefined }]);
        expect(card.edge).toEqual([]);
        expect(card.tint).toEqual([1, 1, 1, 1]);
    });

    it('maps loose author input on assignment, exactly like `fill`', () => {
        const card = new Card({});
        card.glow = Fills.color('blue');
        card.set({ fill: 'blue' });
        expect(card.glow).toEqual(card.fill);
    });

    it('accepts the prop through the constructor', () => {
        const card = new Card({ glow: 'lime', fx: Effects.blur(4) });
        expect((card.glow as any)[0].type).toBe('solid');
        expect((card.fx as any)[0]).toMatchObject({ type: 'blur' });
    });

    it('supports reactive bindings like any other prop', () => {
        const card = new Card({});
        let colour = 'red';
        card.glow = (() => colour) as unknown as Fill;
        expect((card.glow as any)[0].color).toEqual([1, 0, 0, 1]);
    });

    it('tweens with the attribute lerp via to()', () => {
        const card = attached(new Card({ glow: '#000000' }));
        const gen = card.to({ glow: '#ffffff' }, 1)[Symbol.iterator]();
        let res = gen.next();              // prime to the first yield
        while (!res.done) res = gen.next(0.5);
        expect((card.glow as any)[0].color).toEqual([1, 1, 1, 1]);
    });

    it('inherits through getPropertyMeta alongside the base class props', () => {
        const keys = getPropertyMeta(new Card({})).map(m => m.key);
        expect(keys).toEqual(expect.arrayContaining(['fill', 'stroke', 'glow', 'edge', 'halo', 'fx', 'tint']));
        // base-class props come first
        expect(keys.indexOf('fill')).toBeLessThan(keys.indexOf('glow'));
    });

    it('works on a bare Node2D subclass too', () => {
        class Blob extends Node2D {
            @fillProperty({ default: 'red' }) declare paint: Fill;
        }
        expect((new Blob({}).paint as any)[0].type).toBe('solid');
    });
});
