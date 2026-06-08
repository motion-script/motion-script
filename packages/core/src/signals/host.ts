import { Signal } from "./signal";

export type TweenFn<T> = (from: T, to: T, t: number) => T;

export interface SignalHost {
    __signals?: Map<string, Signal<any>>;
    __upgraders?: Map<string, () => Signal<any>>;
    __tweens?: Map<string, TweenFn<any>>;
    __mappers?: Map<string, (ext: any) => any>;
}

export function getSignal(obj: SignalHost, name: string): Signal<any> | undefined {
    return obj.__signals?.get(name);
}

export function getOrCreateSignal(obj: SignalHost, name: string): Signal<any> | undefined {
    const existing = obj.__signals?.get(name);
    if (existing) return existing;
    return obj.__upgraders?.get(name)?.();
}
