import { describe, it, expect } from 'vitest';
import {

    ramp,

    fadeIn,
    fadeOut,
    isCurve,
    staticValue,
    lerpParam,
    equalsParam,
    integrateSpeedToSceneTime,
    sourceTimeAtSceneElapsed,
} from '@/attributes/audio/filters/curve';
import { easeInOutQuad } from '@/tween/ease/constants';

describe('Curve builders', () => {
    it('chains segments fluently', () => {
        const c = ramp(0, 1, 0.5).hold().ramp(1, 0, 1);
        expect(c.segments).toHaveLength(3);
        expect(c.segments[0]).toMatchObject({ from: 0, to: 1, duration: 0.5 });
        expect(c.segments[1].duration).toBeUndefined(); // auto-fill hold
        expect(c.segments[2]).toMatchObject({ from: 1, to: 0, duration: 1 });
    });

    it('is immutable — chaining returns a new Curve', () => {
        const base = ramp(0, 1, 0.5);
        const extended = base.hold(1);
        expect(base.segments).toHaveLength(1);
        expect(extended.segments).toHaveLength(2);
    });

    it('fadeIn / fadeOut produce 0-anchored and end-anchored ramps', () => {
        expect(fadeIn(0.5).segments[0]).toMatchObject({ from: 0, to: 1, duration: 0.5 });
        // fadeOut leaves `from` to be continued from the previous value; ends at 0.
        expect(fadeOut(1).segments[0]).toMatchObject({ to: 0, duration: 1 });
    });
});

describe('Curve.resolve', () => {
    it('auto-fills a bare hold to the middle and pins the last segment to the clip end', () => {
        // fade in 0.5 | hold (auto) | fade out 1, on a 5s clip → hold spans 3.5s.
        const resolved = ramp(0, 1, 0.5).hold().ramp(1, 0, 1).resolve(5, 0);
        expect(resolved).toHaveLength(3);
        expect(resolved[0]).toMatchObject({ startTime: 0, endTime: 0.5 });
        expect(resolved[1]).toMatchObject({ startTime: 0.5, endTime: 4 }); // 3.5s hold
        expect(resolved[2]).toMatchObject({ startTime: 4, endTime: 5 });   // ends at clip end
    });

    it('holds at the previous value (from === to) for a bare hold', () => {
        const resolved = ramp(0, 1, 0.5).hold().resolve(2, 0);
        expect(resolved[1]).toMatchObject({ from: 1, to: 1 });
    });

    it('end-anchors a trailing fadeOut, inserting a hold so it is the last N seconds', () => {
        // fadeIn 0.5 | (implicit hold) | fadeOut 1 on a 3s clip → fade out is 2..3s.
        const resolved = fadeIn(0.5).fadeOut(1).resolve(3, 0);
        expect(resolved).toHaveLength(3);
        expect(resolved[0]).toMatchObject({ startTime: 0, endTime: 0.5, from: 0, to: 1 });
        expect(resolved[1]).toMatchObject({ startTime: 0.5, endTime: 2, from: 1, to: 1 }); // hold
        expect(resolved[2]).toMatchObject({ startTime: 2, endTime: 3, from: 1, to: 0 });   // last 1s
    });

    it('clamps when explicit durations exceed the clip', () => {
        // 2s + 2s = 4s of explicit on a 3s clip → second segment squeezed.
        const resolved = ramp(0, 1, 2).ramp(1, 0, 2).resolve(3, 0);
        expect(resolved[0].endTime).toBeCloseTo(2);
        expect(resolved[1].startTime).toBeCloseTo(2);
        expect(resolved[1].endTime).toBeCloseTo(3); // clamped to clip end, not 4
    });

    it('marks linear segments and carries a custom ease', () => {
        const resolved = ramp(0, 1, 1, { ease: easeInOutQuad }).resolve(1, 0);
        expect(resolved[0].isLinear).toBe(false);
        expect(resolved[0].ease).toBe(easeInOutQuad);

        const lin = ramp(0, 1, 1).resolve(1, 0);
        expect(lin[0].isLinear).toBe(true);
    });
});

describe('Curve.sampleAt', () => {
    it('linearly interpolates within a segment', () => {
        const c = ramp(0, 1, 1); // 0→1 over the whole 1s clip
        expect(c.sampleAt(0, 1, 0)).toBeCloseTo(0);
        expect(c.sampleAt(0.5, 1, 0)).toBeCloseTo(0.5);
        expect(c.sampleAt(1, 1, 0)).toBeCloseTo(1);
    });

    it('holds the final value past the last segment', () => {
        const c = fadeIn(0.5); // reaches 1 at 0.5s, holds to clip end
        expect(c.sampleAt(1, 1, 0)).toBeCloseTo(1);
    });
});

describe('Param helpers', () => {
    it('isCurve / staticValue distinguish numbers from curves', () => {
        expect(isCurve(2)).toBe(false);
        expect(isCurve(ramp(0, 1, 1))).toBe(true);
        expect(staticValue(2)).toBe(2);
        expect(staticValue(ramp(0.3, 1, 1))).toBeCloseTo(0.3); // t=0 value
    });

    it('lerpParam lerps two numbers, hard-cuts when a curve is involved', () => {
        expect(lerpParam(0, 10, 0.5)).toBeCloseTo(5);
        const c = ramp(0, 1, 1);
        expect(lerpParam(2, c, 0.4)).toBe(2);   // t<0.5 → from
        expect(lerpParam(2, c, 0.6)).toBe(c);   // t≥0.5 → to
    });

    it('equalsParam compares numbers and curve identity', () => {
        const c = ramp(0, 1, 1);
        expect(equalsParam(2, 2)).toBe(true);
        expect(equalsParam(2, 3)).toBe(false);
        expect(equalsParam(c, c)).toBe(true);
        expect(equalsParam(c, ramp(0, 1, 1))).toBe(false); // different instances
    });
});

describe('Speed integration', () => {
    it('a constant 2× curve halves the scene time', () => {
        const speed = ramp(2, 2, 4); // constant 2 over the 4s source
        expect(integrateSpeedToSceneTime(speed, 4)).toBeCloseTo(2, 2);
    });

    it('a constant 0.5× curve doubles the scene time', () => {
        const speed = ramp(0.5, 0.5, 4);
        expect(integrateSpeedToSceneTime(speed, 4)).toBeCloseTo(8, 2);
    });

    it('the source-time inverse round-trips with the forward integral', () => {
        const speed = ramp(1, 2, 4); // ramps 1→2 over 4s of source
        const sourceLen = 4;
        const totalScene = integrateSpeedToSceneTime(speed, sourceLen);
        // Halfway through scene time should map back to a source offset whose forward
        // integral equals that scene time.
        const halfScene = totalScene / 2;
        const srcAtHalf = sourceTimeAtSceneElapsed(speed, sourceLen, halfScene);
        // Integrate up to srcAtHalf, resolving the curve against the FULL source length.
        expect(integrateSpeedToSceneTime(speed, sourceLen, srcAtHalf)).toBeCloseTo(halfScene, 2);
        // Endpoints.
        expect(sourceTimeAtSceneElapsed(speed, sourceLen, 0)).toBeCloseTo(0);
        expect(sourceTimeAtSceneElapsed(speed, sourceLen, totalScene)).toBeCloseTo(sourceLen, 1);
    });
});
