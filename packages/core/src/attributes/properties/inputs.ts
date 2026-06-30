/**
 * Reactive-prop input shapes. A `@property`-backed field accepts either a plain
 * value or a `() => value` callback that binds the prop to a derived value
 * (re-evaluated whenever its dependencies change).
 */

/** @internal A single prop input: a constant value or a reactive callback producing it. */
export type PropInput<T> = T | (() => T);

/** @internal Maps every key of a props object to its {@link PropInput} form. */
export type PropInputs<P> = {
    [K in keyof P]?: P[K] | (() => P[K]);
};
