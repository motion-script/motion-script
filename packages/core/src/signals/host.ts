import { Signal } from "./signal";

/** @internal */
export type TweenFn<T> = (from: T, to: T, t: number) => T;

/** @internal */
export interface SignalHost {
    __signals?: Map<string, Signal<any>>;
    __upgraders?: Map<string, () => Signal<any>>;
    __tweens?: Map<string, TweenFn<any>>;
    __mappers?: Map<string, (ext: any) => any>;
}

/** @internal */
export function getSignal(obj: SignalHost, name: string): Signal<any> | undefined {
    return obj.__signals?.get(name);
}

/** @internal */
export function getOrCreateSignal(obj: SignalHost, name: string): Signal<any> | undefined {
    const existing = obj.__signals?.get(name);
    if (existing) return existing;
    return obj.__upgraders?.get(name)?.();
}
