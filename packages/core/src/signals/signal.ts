import type { Subscriber, Unsubscribe } from "./subscriber";

/**
 * Reactive cell that stores a value and tracks dependencies.
 *
 * A cell can be a plain value (set/get) or bound to a computation fn.
 * Reads during a bound fn's execution are recorded as dependencies; when any
 * dep is set, the cell is marked dirty and recomputes lazily on next read.
 *
 * Subscribers fire only when the cell's value actually changes. Bound cells
 * without listeners stay lazy — they recompute on the next read. Bound cells
 * with listeners recompute eagerly when dirtied so subscribers can be notified
 * with a fresh value.
 */
export class Signal<T> {
    private _value: T;
    private _fn: (() => T) | null = null;
    private _dirty = false;
    // Bound cells that read this one (i.e. downstream dependents).
    private _subs: Set<Signal<any>> = new Set();
    // Cells this one reads (only populated while bound).
    private _deps: Set<Signal<any>> = new Set();
    // External subscribers (not part of the cell graph).
    private _listeners: Set<Subscriber<T>> = new Set();

    constructor(initial: T | (() => T)) {
        if (typeof initial === "function") {
            this._fn = initial as () => T;
            this._dirty = true;
            this._value = undefined as unknown as T;
        } else {
            this._value = initial;
        }
    }

    get(): T {
        if (currentReader && currentReader !== this) {
            this._subs.add(currentReader);
            currentReader._deps.add(this);
        }
        if (this._fn && this._dirty) this._recompute();
        return this._value;
    }

    peek(): T {
        if (this._fn && this._dirty) this._recompute();
        return this._value;
    }

    set(value: T): void {
        if (this._fn) this._detach();
        if (Object.is(this._value, value)) return;
        const prev = this._value;
        this._value = value;
        this._propagateDirty();
        this._notify(prev);
    }

    bind(fn: () => T): void {
        this._detach();
        this._fn = fn;
        this._dirty = true;
        this._propagateDirty();
        if (this._listeners.size > 0) {
            const prev = this._value;
            this._recompute();
            if (!Object.is(prev, this._value)) this._notify(prev);
        }
    }

    unbind(): void {
        this._detach();
    }

    /**
     * Permanently severs all graph edges and releases closures.
     *
     * - Upstream: removes this cell from every dep's `_subs` (same as unbind).
     * - Downstream: removes this cell from every subscriber's `_deps` so they
     *   stop tracking it, then clears `_subs`.
     * - External: clears all `_listeners` so subscriber callbacks are released.
     *
     * After `dispose()` the cell is inert. Do not read or write it.
     */
    dispose(): void {
        // Sever upstream (this cell → deps).
        this._detach();
        // Sever downstream (deps → this cell tracked via their _deps sets).
        for (const sub of this._subs) sub._deps.delete(this);
        this._subs.clear();
        // Release external subscriber callbacks.
        this._listeners.clear();
        // Drop any reference held by the value slot to aid GC.
        this._value = undefined as unknown as T;
    }

    isBound(): boolean {
        return this._fn !== null;
    }

    subscribe(fn: Subscriber<T>): Unsubscribe {
        this._listeners.add(fn);
        return () => {
            this._listeners.delete(fn);
        };
    }

    private _notify(prev: T): void {
        if (this._listeners.size === 0) return;
        if (Object.is(prev, this._value)) return;
        for (const sub of this._listeners) sub(this._value);
    }

    private _detach(): void {
        if (!this._fn) return;
        this._fn = null;
        this._dirty = false;
        for (const d of this._deps) d._subs.delete(this);
        this._deps.clear();
    }

    private _recompute(): void {
        for (const d of this._deps) d._subs.delete(this);
        this._deps.clear();
        const prev = currentReader;
        currentReader = this;
        try {
            this._value = this._fn!();
            this._dirty = false;
        } finally {
            currentReader = prev;
        }
    }

    private _propagateDirty(): void {
        const stack: Signal<any>[] = [];
        for (const sub of this._subs) stack.push(sub);
        while (stack.length > 0) {
            const s = stack.pop()!;
            if (s._dirty) continue;
            s._dirty = true;
            for (const next of s._subs) stack.push(next);
            // Eagerly recompute listened-to derived cells so subscribers fire
            // with a fresh value. Lazy cells just stay dirty until pulled.
            if (s._listeners.size > 0) {
                const prevVal = s._value;
                s._recompute();
                if (!Object.is(prevVal, s._value)) {
                    for (const fn of s._listeners) fn(s._value);
                }
            }
        }
    }
}

let currentReader: Signal<any> | null = null;

export function isTracking(): boolean {
    return currentReader !== null;
}
