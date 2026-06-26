import { describe, it, expect } from 'vitest';
import { linear, easeIn, easeOut, easeInOut } from '@/tween/ease/constants';

function endpoints(fn: (t: number) => number, atOne = 1) {
    expect(fn(0)).toBeCloseTo(0, 5);
    expect(fn(1)).toBeCloseTo(atOne, 5);
}

describe('linear', () => {
    it('is identity in [0,1]', () => {
        expect(linear()(0)).toBe(0);
        expect(linear()(0.5)).toBe(0.5);
        expect(linear()(1)).toBe(1);
    });
    it('clamps below 0 and above 1', () => {
        expect(linear()(-0.5)).toBe(0);
        expect(linear()(2)).toBe(1);
    });
});

describe('easeIn(quad) / easeOut(quad)', () => {
    it('endpoints', () => {
        endpoints(easeIn('quad'));
        endpoints(easeOut('quad'));
    });
    it('easeIn(quad)(0.5) < 0.5', () => {
        expect(easeIn('quad')(0.5)).toBeLessThan(0.5);
    });
    it('easeOut(quad)(0.5) > 0.5', () => {
        expect(easeOut('quad')(0.5)).toBeGreaterThan(0.5);
    });
    it('clamps to [0,1] range', () => {
        expect(easeIn('quad')(-1)).toBe(0);
        expect(easeOut('quad')(2)).toBe(1);
    });
});

describe('easeOut(quart)', () => {
    it('endpoints', () => endpoints(easeOut('quart')));
    it('decelerates strongly (f(0.5) > easeOut(quad)(0.5))', () => {
        expect(easeOut('quart')(0.5)).toBeGreaterThan(easeOut('quad')(0.5));
    });
});

describe('easeInOut(quad)', () => {
    it('endpoints', () => endpoints(easeInOut('quad')));
    it('symmetric around 0.5', () => {
        expect(easeInOut('quad')(0.5)).toBeCloseTo(0.5, 5);
        expect(easeInOut('quad')(0.25)).toBeCloseTo(1 - easeInOut('quad')(0.75), 5);
    });
});

describe('easeOut(back)', () => {
    it('endpoints (default overshoot)', () => endpoints(easeOut('back')));
    it('overshoots above 1 before reaching endpoint', () => {
        const fn = easeOut('back');
        let overshot = false;
        for (let t = 0; t <= 1; t += 0.02) {
            if (fn(t) > 1.01) overshot = true;
        }
        expect(overshot).toBe(true);
    });
});

describe('easeIn(back)', () => {
    it('endpoints', () => endpoints(easeIn('back')));
    it('dips below 0 before settling', () => {
        const fn = easeIn('back');
        let dipped = false;
        for (let t = 0; t <= 1; t += 0.02) {
            if (fn(t) < -0.01) dipped = true;
        }
        expect(dipped).toBe(true);
    });
});

describe('easeInOut(back)', () => {
    it('endpoints', () => endpoints(easeInOut('back')));
    it('midpoint is ~0.5', () => {
        expect(easeInOut('back')(0.5)).toBeCloseTo(0.5, 5);
    });
});

describe('elastic eases', () => {
    it('endpoints for easeOut(elastic)', () => endpoints(easeOut('elastic')));
    it('endpoints for easeIn(elastic)', () => endpoints(easeIn('elastic')));
    it('endpoints for easeInOut(elastic)', () => endpoints(easeInOut('elastic')));

    it('oscillates somewhere in the middle', () => {
        const fn = easeOut('elastic');
        let above1 = false;
        for (let t = 0; t <= 1; t += 0.01) {
            if (fn(t) > 1.001) above1 = true;
        }
        expect(above1).toBe(true);
    });
});

describe('config object overrides', () => {
    it('back honors custom overshoot', () => {
        const mild = easeOut({ type: 'back', overshoot: 0.5 });
        const wild = easeOut({ type: 'back', overshoot: 4 });
        expect(Math.max(...Array.from({ length: 50 }, (_, i) => wild(i / 49))))
            .toBeGreaterThan(Math.max(...Array.from({ length: 50 }, (_, i) => mild(i / 49))));
    });

    it('elastic honors custom amplitude/period', () => {
        const fn = easeOut({ type: 'elastic', amplitude: 2, period: 0.5 });
        endpoints(fn);
    });
});
