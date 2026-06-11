import { describe, it, expect } from "vitest";
import { resolveMotionBlur } from "@/effects/motion-blur";
import type { MotionBlurEffect } from "@motion-script/core";

const base: MotionBlurEffect = {
    type: "motionBlur",
    length: 100,
    alignment: "centered",
    samples: 16,
    strength: 1,
    axis: "both",
};

const dt = 1 / 60;

describe("resolveMotionBlur", () => {
    it("smears along the velocity direction with length = displacement * shutter * strength", () => {
        const r = resolveMotionBlur(base, { x: 100, y: 0 }, dt);
        expect(r).not.toBeNull();
        // length 100% * strength 1 → full per-frame displacement (100 px/s * dt).
        expect(r!.blurLength).toBeCloseTo(100 * dt, 6);
        expect(r!.direction).toBeCloseTo(0, 6);
        expect(r!.phase).toBe(0);
    });

    it("scales the smear by length% and strength", () => {
        const r = resolveMotionBlur({ ...base, length: 50, strength: 2 }, { x: 100, y: 0 }, dt);
        // 0.5 * 2 = 1.0 → same as the nominal case above.
        expect(r!.blurLength).toBeCloseTo(100 * dt, 6);
    });

    it("isolates an axis: 'x' suppresses smear from purely vertical motion", () => {
        expect(resolveMotionBlur({ ...base, axis: "x" }, { x: 0, y: 200 }, dt)).toBeNull();
    });

    it("returns null for a static node (zero velocity)", () => {
        expect(resolveMotionBlur(base, { x: 0, y: 0 }, dt)).toBeNull();
    });

    it("returns null when motion is unknown (dt <= 0)", () => {
        expect(resolveMotionBlur(base, { x: 100, y: 0 }, 0)).toBeNull();
    });

    it("carries the resolved shutter phase", () => {
        expect(resolveMotionBlur({ ...base, alignment: "ahead" }, { x: 100, y: 0 }, dt)!.phase).toBe(1);
    });
});
