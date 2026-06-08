import { clamp01 } from "@/util/clamp";
import { EaseFunction } from "./type";



export const linear: EaseFunction = (t: number) => clamp01(t);

export const easeInQuad: EaseFunction = (t: number) => {
    t = clamp01(t); return t * t;
};

export const easeOutQuad: EaseFunction = (t: number) => {
    t = clamp01(t); return t * (2 - t);
};

export const easeOutQuart: EaseFunction = (t: number) => {
    t = clamp01(t);
    return 1 - Math.pow(1 - t, 4);
};

export const easeInOutQuad: EaseFunction = (t: number) => {
    t = clamp01(t);
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
};

export const easeOutBack = (
    overshoot = 1.70158
): EaseFunction => (t: number) => {
    t = clamp01(t) - 1;
    return 1 + t * t * ((overshoot + 1) * t + overshoot);
};

export const easeInBack = (
    overshoot = 1.70158
): EaseFunction => (t: number) => {
    t = clamp01(t);
    return t * t * ((overshoot + 1) * t - overshoot);
};

export const easeInOutBack = (
    overshoot = 1.70158
): EaseFunction => (t: number) => {
    t = clamp01(t) * 2;
    const s = overshoot * 1.525;
    if (t < 1) {
        return 0.5 * (t * t * ((s + 1) * t - s));
    }
    t -= 2;
    return 0.5 * (t * t * ((s + 1) * t + s) + 2);
};


export const easeOutElastic = (
    amplitude = 1,
    period = 0.3
): EaseFunction => (t: number) => {
    t = clamp01(t);
    if (t === 0 || t === 1) return t;

    const s = period / (2 * Math.PI) * Math.asin(1 / amplitude);
    return (
        amplitude *
        Math.pow(2, -10 * t) *
        Math.sin((t - s) * (2 * Math.PI) / period) +
        1
    );
};

export const easeInElastic = (
    amplitude = 1,
    period = 0.3
): EaseFunction => (t) => {
    t = clamp01(t);
    if (t === 0 || t === 1) return t;

    const s = period / (2 * Math.PI) * Math.asin(1 / amplitude);
    return -(
        amplitude *
        Math.pow(2, 10 * (t - 1)) *
        Math.sin((t - 1 - s) * (2 * Math.PI) / period)
    );
};

export const easeInOutElastic = (
    amplitude = 1,
    period = 0.45
): EaseFunction => (t: number) => {
    t = clamp01(t) * 2;
    if (t === 0 || t === 2) return t / 2;

    const s = period / (2 * Math.PI) * Math.asin(1 / amplitude);

    if (t < 1) {
        return -0.5 * (
            amplitude *
            Math.pow(2, 10 * (t - 1)) *
            Math.sin((t - 1 - s) * (2 * Math.PI) / period)
        );
    }

    return (
        amplitude *
        Math.pow(2, -10 * (t - 1)) *
        Math.sin((t - 1 - s) * (2 * Math.PI) / period) *
        0.5 +
        1
    );
};


