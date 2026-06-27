import { clamp01 } from "@/util/clamp";
import { EasingFunction } from "./type";

export type StandardEase =
    | 'sine' | 'quad' | 'cubic' | 'quart' | 'quint'
    | 'expo' | 'circ' | 'back' | 'elastic' | 'bounce';

/** Default ease family used when no `type` is specified. */
export const DEFAULT_EASE: StandardEase = 'quad';

export interface EaseConfig {
    /** Standard ease family (default: 'quad'). */
    type?: StandardEase;
    /** Used by 'back' (default: 1.70158). */
    overshoot?: number;
    /** Used by 'elastic' (default: 1). */
    amplitude?: number;
    /** Used by 'elastic' (default: 0.3). */
    period?: number;
}

export type EaseParams = StandardEase | EaseConfig;

const PI = Math.PI;

type ResolvedConfig = EaseConfig & { type: StandardEase };

const parseConfig = (params?: EaseParams): ResolvedConfig => {
    if (params === undefined) return { type: DEFAULT_EASE };
    if (typeof params === 'string') return { type: params };
    return { ...params, type: params.type ?? DEFAULT_EASE };
};

// "Ease in" curve for each standard family, parameterized by an EaseConfig.
// easeOut/easeInOut are derived from this via reflection, matching the
// classic Penner construction.
const inMath: Record<StandardEase, (t: number, config: EaseConfig) => number> = {
    sine: (t) => 1 - Math.cos((t * PI) / 2),
    quad: (t) => t * t,
    cubic: (t) => t * t * t,
    quart: (t) => t * t * t * t,
    quint: (t) => t * t * t * t * t,
    expo: (t) => (t === 0 ? 0 : Math.pow(2, 10 * (t - 1))),
    circ: (t) => 1 - Math.sqrt(1 - t * t),
    back: (t, config) => {
        const s = config.overshoot ?? 1.70158;
        return t * t * ((s + 1) * t - s);
    },
    elastic: (t, config) => {
        if (t === 0 || t === 1) return t;
        const a = config.amplitude ?? 1;
        const p = config.period ?? 0.3;
        const s = (p / (2 * PI)) * Math.asin(1 / a);
        return -(a * Math.pow(2, 10 * (t - 1)) * Math.sin(((t - 1 - s) * 2 * PI) / p));
    },
    bounce: (t) => {
        const bounceOut = (x: number) => {
            const n1 = 7.5625;
            const d1 = 2.75;
            if (x < 1 / d1) return n1 * x * x;
            if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
            if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
            return n1 * (x -= 2.625 / d1) * x + 0.984375;
        };
        return 1 - bounceOut(1 - t);
    },
};

export const linear = (): EasingFunction => (t) => clamp01(t);

export const easeIn = (params?: EaseParams): EasingFunction => {
    const config = parseConfig(params);
    return (t) => inMath[config.type](clamp01(t), config);
};

export const easeOut = (params?: EaseParams): EasingFunction => {
    const config = parseConfig(params);
    return (t) => 1 - inMath[config.type](1 - clamp01(t), config);
};

export const easeInOut = (params?: EaseParams): EasingFunction => {
    const config = parseConfig(params);
    // 'back' and 'elastic' need different default tuning at the midpoint than
    // their easeIn/easeOut counterparts (the classic Penner in-out variants
    // scale overshoot and default period differently), so resolve those here
    // rather than reusing the easeIn/easeOut defaults verbatim.
    const inOutConfig: ResolvedConfig = config.type === 'back'
        ? { ...config, overshoot: (config.overshoot ?? 1.70158) * 1.525 }
        : config.type === 'elastic'
            ? { ...config, period: config.period ?? 0.45 }
            : config;
    return (t) => {
        t = clamp01(t);
        return t < 0.5
            ? inMath[inOutConfig.type](2 * t, inOutConfig) / 2
            : 1 - inMath[inOutConfig.type](2 * (1 - t), inOutConfig) / 2;
    };
};
