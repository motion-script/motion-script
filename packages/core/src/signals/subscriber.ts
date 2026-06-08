/** Called whenever a signal emits a new value. */
export type Subscriber<T> = (value: T) => void;

/** Disposes a subscription created by a signal's `subscribe` method. Safe to call multiple times. */
export type Unsubscribe = () => void;
