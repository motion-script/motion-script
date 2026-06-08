import { Signal } from "@/signals/signal";
import { EaseFunction } from "@/tween/ease/type";
import { linear } from "@/tween/ease/constants";
import { tween as tweenGenerator } from "@/tween/tween";
import { FrameGenerator } from "@/tween/generator";

type LerpFn<T> = (from: T, to: T, t: number) => T;

/**
 * Callable signal returned by {@link createSignal}: a function for
 * get/set/tween shorthand plus the same methods as named properties.
 */
export interface ReactiveSignal<T> {
    (): T;
    (next: T | ((prev: T) => T) | (() => T)): void;
    (next: T, duration: number, easing?: EaseFunction, lerp?: LerpFn<T>): FrameGenerator;
    get(): T;
    set(next: T | ((prev: T) => T) | (() => T)): void;
    subscribe: Signal<T>["subscribe"];
    tween(next: T, duration: number, easing?: EaseFunction, lerp?: LerpFn<T>): FrameGenerator;
}

export type SignalInput<T> = T | ReactiveSignal<T> | (() => T);

function isSignal<T>(value: any): value is ReactiveSignal<T> {
    return (
        typeof value === "function" &&
        "get" in value &&
        "set" in value &&
        "subscribe" in value
    );
}

function lerpNullable(from: number | null, next: number | null, t: number): number | null {
    if (from === null && next === null) return null;
    const f = from ?? next ?? 0;
    const n = next ?? from ?? 0;
    return f + (n - f) * t;
}

export function createSignal<T>(
    initial: SignalInput<T>,
    defaultLerp?: LerpFn<T>
): ReactiveSignal<T> {
    if (isSignal<T>(initial)) return initial;

    const cell = new Signal<T>(initial as T | (() => T));

    const signal = (function (
        arg?: any,
        duration?: number,
        easing?: any,
        lerp?: any
    ): any {
        if (arguments.length === 0) return signal.get();
        if (arguments.length >= 2 && typeof duration === "number") {
            return signal.tween(arg as T, duration, easing, lerp);
        }
        return signal.set(arg);
    } as unknown) as ReactiveSignal<T>;

    signal.get = () => cell.get();

    signal.set = (next: any) => {
        if (typeof next === "function") {
            // Arity disambiguates: (prev) => ... is an updater, () => ... binds
            // a tracked computation.
            const fn = next as ((prev: T) => T) | (() => T);
            if (fn.length >= 1) {
                cell.set((fn as (p: T) => T)(cell.peek()));
            } else {
                cell.bind(fn as () => T);
            }
            return;
        }
        cell.set(next);
    };

    signal.subscribe = (fn) => cell.subscribe(fn);

    function* tweenRunner(
        next: T,
        duration: number,
        easing: (t: number) => number,
        lerpFn: LerpFn<T> | undefined
    ): Generator<void, void, number | undefined> {
        const from = signal.get();
        const gen = tweenGenerator(duration, (t) => {
            const eased = easing(t);
            let v: any;
            if (lerpFn) {
                v = lerpFn(from, next, eased);
            } else if (typeof from === "number" || typeof next === "number") {
                v = lerpNullable(from as any, next as any, eased);
            } else {
                v = eased === 1 ? next : from;
            }
            signal.set(v);
        });

        let res = gen.next();
        if (res.done) return;
        while (!res.done) {
            const dt = yield;
            res = gen.next(dt as any);
        }
    }

    signal.tween = (
        next: T,
        duration: number,
        easing?: (t: number) => number,
        lerp?: LerpFn<T>
    ) => tweenRunner(next, duration, easing ?? linear, lerp ?? defaultLerp);

    return signal;
}

export default createSignal;
