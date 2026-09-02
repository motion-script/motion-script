import { Signal } from "@/signals/signal";
import { EasingFunction } from "@/tween/ease/type";
import { linear } from "@/tween/ease/constants";
import { driveCommand, type Command } from "@/tween/command";

const DEFAULT_EASE = linear();

type LerpFn<T> = (from: T, to: T, t: number) => T;

/**
 * Callable signal returned by {@link createSignal}: a function for
 * get/set/tween shorthand plus the same methods as named properties.
 */
export interface ReactiveSignal<T> {
    (): T;
    (next: T | ((prev: T) => T) | (() => T)): void;
    (next: T, duration: number, easing?: EasingFunction, lerp?: LerpFn<T>): Command<Record<string, never>>;
    get(): T;
    set(next: T | ((prev: T) => T) | (() => T)): void;
    subscribe: Signal<T>["subscribe"];
    tween(next: T, duration: number, easing?: EasingFunction, lerp?: LerpFn<T>): Command<Record<string, never>>;
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

    /**
     * A {@link Command} rather than a generator: the value at `t` is a function
     * of `t` alone, so a host can ask what this signal holds at any time instead
     * of having to run every step before it.
     *
     * `from` is snapshotted on first evaluation rather than when the command is
     * built, so a tween placed later on a timeline still starts from whatever the
     * signal actually holds by then.
     */
    function tweenCommand(
        next: T,
        duration: number,
        easing: (t: number) => number,
        lerpFn: LerpFn<T> | undefined
    ): Command<Record<string, never>> {
        let from: T | undefined;
        let captured = false;

        return driveCommand(duration, (t) => {
            if (!captured) {
                from = signal.get();
                captured = true;
            }
            const eased = easing(t);
            let v: any;
            if (lerpFn) {
                v = lerpFn(from as T, next, eased);
            } else if (typeof from === "number" || typeof next === "number") {
                v = lerpNullable(from as any, next as any, eased);
            } else {
                v = eased === 1 ? next : from;
            }
            signal.set(v);
        });
    }

    signal.tween = (
        next: T,
        duration: number,
        easing?: (t: number) => number,
        lerp?: LerpFn<T>
    ) => tweenCommand(next, duration, easing ?? DEFAULT_EASE, lerp ?? defaultLerp);

    return signal;
}

export default createSignal;
