import { Signal } from "./signal";

/** @internal */
export type TweenFn<T> = (from: T, to: T, t: number) => T;

/**
 * The reactive cells behind an object's `@property`-declared fields, plus the
 * per-field metadata `set()` and `to()` route through.
 *
 * One object rather than four loose maps on the host, because the host is a
 * `Node` and every public field it carries is published API. Grouping them means
 * a node exposes one internal name instead of four, and gives the thing a name a
 * reader can look up.
 *
 * @internal
 */
export interface SignalCells {
    /** Field → its live cell. Present for every registered prop. */
    signals: Map<string, Signal<any>>;
    /** Field → a thunk that returns (creating if needed) its cell. */
    upgraders: Map<string, () => Signal<any>>;
    /** Field → how it interpolates, for props a numeric lerp cannot cover. */
    tweens?: Map<string, TweenFn<any>>;
    /** Field → external prop value to internal cell value, for fields that need it. */
    mappers?: Map<string, (ext: any, prev?: any) => any>;
}

/** @internal */
export interface SignalHost {
    /** See {@link SignalCells}. Absent until the first prop is registered, and
     *  cleared by `dispose()`. */
    __cells?: SignalCells;
}

/** @internal */
export function getSignal(obj: SignalHost, name: string): Signal<any> | undefined {
    return obj.__cells?.signals.get(name);
}

/** @internal */
export function getOrCreateSignal(obj: SignalHost, name: string): Signal<any> | undefined {
    const cells = obj.__cells;
    return cells?.signals.get(name) ?? cells?.upgraders.get(name)?.();
}

/** The host's cells, created on first use. @internal */
export function ensureCells(obj: SignalHost): SignalCells {
    return obj.__cells ??= { signals: new Map(), upgraders: new Map() };
}
