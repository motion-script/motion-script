import { describe, it, expect } from 'vitest';
import {
    linear,
    easeInQuad,
    easeOutQuad,
    easeOutQuart,
    easeInOutQuad,
    easeOutBack,
    easeInBack,
    easeInOutBack,
    easeOutElastic,
    easeInElastic,
    easeInOutElastic,
} from '@/tween/ease/constants';

function endpoints(fn: (t: number) => number, atOne = 1) {
    expect(fn(0)).toBeCloseTo(0, 5);
    expect(fn(1)).toBeCloseTo(atOne, 5);
}

describe('linear', () => {
    it('is identity in [0,1]', () => {
        expect(linear(0)).toBe(0);
        expect(linear(0.5)).toBe(0.5);
        expect(linear(1)).toBe(1);
    });
    it('clamps below 0 and above 1', () => {
        expect(linear(-0.5)).toBe(0);
        expect(linear(2)).toBe(1);
    });
});

describe('easeInQuad / easeOutQuad', () => {
    it('endpoints', () => {
        endpoints(easeInQuad);
        endpoints(easeOutQuad);
    });
    it('easeInQuad(0.5) < 0.5', () => {
        expect(easeInQuad(0.5)).toBeLessThan(0.5);
    });
    it('easeOutQuad(0.5) > 0.5', () => {
        expect(easeOutQuad(0.5)).toBeGreaterThan(0.5);
    });
    it('clamps to [0,1] range', () => {
        expect(easeInQuad(-1)).toBe(0);
        expect(easeOutQuad(2)).toBe(1);
    });
});

describe('easeOutQuart', () => {
    it('endpoints', () => endpoints(easeOutQuart));
    it('decelerates strongly (f(0.5) > easeOutQuad(0.5))', () => {
        expect(easeOutQuart(0.5)).toBeGreaterThan(easeOutQuad(0.5));
    });
});

describe('easeInOutQuad', () => {
    it('endpoints', () => endpoints(easeInOutQuad));
    it('symmetric around 0.5', () => {
        expect(easeInOutQuad(0.5)).toBeCloseTo(0.5, 5);
        expect(easeInOutQuad(0.25)).toBeCloseTo(1 - easeInOutQuad(0.75), 5);
    });
});

describe('easeOutBack', () => {
    it('endpoints (default overshoot)', () => endpoints(easeOutBack()));
    it('overshoots above 1 before reaching endpoint', () => {
        const fn = easeOutBack();
        let overshot = false;
        for (let t = 0; t <= 1; t += 0.02) {
            if (fn(t) > 1.01) overshot = true;
        }
        expect(overshot).toBe(true);
    });
});

describe('easeInBack', () => {
    it('endpoints', () => endpoints(easeInBack()));
    it('dips below 0 before settling', () => {
        const fn = easeInBack();
        let dipped = false;
        for (let t = 0; t <= 1; t += 0.02) {
            if (fn(t) < -0.01) dipped = true;
        }
        expect(dipped).toBe(true);
    });
});

describe('easeInOutBack', () => {
    it('endpoints', () => endpoints(easeInOutBack()));
    it('midpoint is ~0.5', () => {
        expect(easeInOutBack()(0.5)).toBeCloseTo(0.5, 5);
    });
});

describe('elastic eases', () => {
    it('endpoints for easeOutElastic', () => endpoints(easeOutElastic()));
    it('endpoints for easeInElastic', () => endpoints(easeInElastic()));
    it('endpoints for easeInOutElastic', () => endpoints(easeInOutElastic()));

    it('oscillates somewhere in the middle', () => {
        const fn = easeOutElastic();
        let above1 = false;
        for (let t = 0; t <= 1; t += 0.01) {
            if (fn(t) > 1.001) above1 = true;
        }
        expect(above1).toBe(true);
    });
});
