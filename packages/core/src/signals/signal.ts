import type { Subscriber, Unsubscribe } from "./subscriber";

/**
 * A captured reactive state of a {@link Signal}. Either the cell was bound to a
 * computation (`bound: true`, with the `fn` to re-bind and the resolved `value`
 * at capture time) or it held a plain `value`. Produced by {@link Signal.snapshot}
 * and consumed by {@link Signal.restoreFrom}.
 */
/** @internal */
export interface SignalSnapshot<T> {
    bound: boolean;
    value: T;
    fn?: () => T;
}

/**
 * Something that wants to hear when one of its cells goes stale.
 *
 * A `Node` implements this so the render walk can skip a subtree nothing has
 * touched. Deliberately one method and no identity: the signal layer must not
 * learn what a node is.
 */
/** @internal */
export interface SignalOwner {
    markDirty(): void;
}

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

    /**
     * Told whenever this cell's value goes stale. See {@link SignalOwner}.
     *
     * A back-pointer rather than a version number the owner polls, for two
     * reasons. Polling is O(cells) per node per frame where this is O(1) per
     * *actual change*, and — the part that matters — reading a bound cell to
     * check its version would force it to **settle**, which is the expensive
     * thing the skip exists to avoid. Push, don't pull.
     */
    /** @internal */
    owner: SignalOwner | null = null;

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
        // A bound fn that reads its own cell (e.g. `cell.bind(() => mapper(ext(),
        // cell.get()))`, used for mapper "previous value" continuity) re-enters
        // get() while `currentReader === this` mid-_recompute(): `_dirty` is
        // still true until _fn() returns, so without this guard the re-entrant
        // call would call _recompute() again, calling _fn() again, forever.
        // Self-reads mid-computation get the last-settled value instead.
        if (this._fn && this._dirty && currentReader !== this) this._recompute();
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
        // After the bail, so a write of the value the cell already holds tells
        // nobody anything — which is the whole point of having a guard.
        this.owner?.markDirty();
        this._propagateDirty();
        this._notify(prev);
    }

    bind(fn: () => T): void {
        // Rebinding a cell to the function it already holds says nothing new: the
        // rule is the same, and if what it reads has moved the cell is dirty
        // already through the ordinary propagation. Bailing matters because a
        // host restoring a node's props every frame — see a driven scene's
        // baseline — would otherwise invalidate and recompute every bound cell on
        // every frame, for a value that cannot have changed because of the write.
        if (this._fn === fn) return;
        this._detach();
        this._fn = fn;
        this._dirty = true;
        // A rebind can change what the cell resolves to without anything being
        // `set`, so the owner has to hear about it here too.
        this.owner?.markDirty();
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

    /**
     * Capture this cell's current reactive state so it can be reapplied later
     * with {@link restoreFrom} — the backing primitive for node `save()`.
     *
     * A bound cell records its computation fn (so the binding, not just its
     * resolved value, is preserved); a plain cell records its value. Reading
     * is done via {@link peek}, so taking a snapshot never creates a tracking
     * dependency on this cell.
     */
    snapshot(): SignalSnapshot<T> {
        return this._fn
            ? { bound: true, fn: this._fn, value: this.peek() }
            : { bound: false, value: this._value };
    }

    /**
     * Reapply a snapshot taken by {@link snapshot}. A bound snapshot re-binds
     * the recorded computation; a plain snapshot sets the recorded value. Used
     * by node `restore()` to roll a cell back to a saved state.
     */
    restoreFrom(snap: SignalSnapshot<T>): void {
        if (snap.bound) this.bind(snap.fn!);
        else this.set(snap.value);
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
            // The load-bearing one, and it costs nothing new: this walk already
            // visits exactly the cells that just went stale, and exactly once
            // (the guard above). It also gets the *lazy* case right — a cell
            // bound to another node's prop is marked here, at propagate time,
            // rather than whenever someone next reads it, so its owner cannot be
            // skipped before that read happens.
            s.owner?.markDirty();
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
