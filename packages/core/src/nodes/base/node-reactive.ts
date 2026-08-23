import { Signal, SignalSnapshot, type SignalOwner } from "@/signals/signal";
import { SignalHost, TweenFn } from "@/signals/host";
import { EasingFunction } from "@/tween/ease/type";
import { driveCommand, type Command } from "@/tween/command";
import { TweenStepper } from "@/tween/stepper";
import { getPropertyMeta, PropOptions } from "@/attributes/properties/decorator";

/**
 * Companion implementation of {@link Node2D}'s reactive-property machinery and its
 * save/restore state stack. The bodies live here as free functions over a
 * narrow {@link ReactiveHost} so `node.ts` keeps only thin delegators (and the
 * hot-path `set`/`_writeProp`, which stay inline on the class). Mirrors the
 * existing `getSignal(host, name)` pattern in `signals/host.ts`.
 */

/**
 * The slice of a {@link Node2D} these helpers touch: the {@link SignalHost} maps
 * plus the internal write/tween seams. `_writeProp` and `_prepareStep` remain
 * methods on `Node2D`; the helpers call back through them so subclass behaviour
 * and the inline hot path are preserved.
 */
/** @internal */
export interface ReactiveHost extends SignalHost {
    _writeProp(field: string, value: unknown): void;
    _prepareStep(to: Record<string, unknown>, duration: number, easing?: EasingFunction): TweenStepper;
    /** LIFO stack of save() snapshot layers; owned as an instance field on Node2D. */
    _stateStack: Map<string, SignalSnapshot<any>>[];
    /** Told when any of this host's cells goes stale; see {@link SignalOwner}. */
    markDirty(): void;
}

/**
 * Create the Signal cell + accessor for a freshly-declared prop and register its
 * tween/mapper metadata. Extracted from `Node2D._registerProp`; defines the
 * getter/setter on `host` so reads track the cell and writes route through
 * `host._writeProp` (mapper-aware, binding-aware).
 */
/** @internal */
export function registerProp<Int>(host: ReactiveHost, field: string, options?: PropOptions<any, Int>): void {
    const cell = new Signal<Int>(undefined as unknown as Int);
    // The one place every animatable prop is created, and therefore the one place
    // to say who owns it. Without this a node cannot tell whether anything about
    // it changed this frame — see `Node2D.markDirty`.
    cell.owner = host as unknown as SignalOwner;
    if (!host.__signals) host.__signals = new Map();
    host.__signals.set(field, cell);
    if (!host.__upgraders) host.__upgraders = new Map();
    host.__upgraders.set(field, () => cell);
    if (options?.tween) {
        if (!host.__tweens) host.__tweens = new Map();
        host.__tweens.set(field, options.tween as TweenFn<any>);
    }
    if (options?.mapper) {
        if (!host.__mappers) host.__mappers = new Map();
        host.__mappers.set(field, options.mapper as (ext: any, prev?: any) => any);
    }
    Object.defineProperty(host, field, {
        get: () => cell.get(),
        set: (value: any) => host._writeProp(field, value),
        enumerable: true,
        configurable: true,
    });
}

/**
 * Apply (or re-apply) a prop's initial value plus optional tween/mapper. A first
 * call creates the cell via {@link registerProp}; a subsequent call for the same
 * field reuses the cell and only refines its tween/mapper (so a subclass can
 * override a parent default without losing the cell or its bindings), then
 * writes the value. Extracted from `Node2D.applyProp`.
 */
/** @internal */
export function applyProp<Ext, Int = Ext>(
    host: ReactiveHost,
    field: string,
    initial: Ext | (() => Ext) | undefined,
    options?: PropOptions<Ext, Int>,
): void {
    const existing = host.__signals?.get(field);
    if (!existing) {
        registerProp<Int>(host, field, options);
    } else if (options) {
        // Allow subclasses to refine tween/mapper on an inherited field.
        if (options.tween) {
            if (!host.__tweens) host.__tweens = new Map();
            host.__tweens.set(field, options.tween as TweenFn<any>);
        }
        if (options.mapper) {
            if (!host.__mappers) host.__mappers = new Map();
            host.__mappers.set(field, options.mapper as (ext: any, prev?: any) => any);
        }
    }
    host._writeProp(field, initial);
}

/**
 * Re-apply every `@property` default to `host`, recreating disposed cells and
 * restoring values. Drives `Node2D.reinitProps`; the method keeps the
 * `if (__signals && !force) return` guard and the `super` seam.
 */
/** @internal */
export function reapplyDefaults(host: ReactiveHost): void {
    for (const meta of getPropertyMeta(host)) {
        applyProp(host, meta.key, meta.default, meta.options);
    }
}

/** Snapshot every registered prop's current value/binding into a plain object. */
/** @internal */
export function collectProperties(host: ReactiveHost): Record<string, any> {
    const result: Record<string, any> = {};
    if (host.__upgraders) {
        for (const key of host.__upgraders.keys()) {
            result[key] = (host as any)[key];
        }
    }
    return result;
}

// ---- State stack (save / restore) -----------------------------------------

/**
 * Every reactive prop of a node, captured as the value **or binding** its cell
 * holds — see {@link Node2D.captureProps}, which is the public way to make one.
 *
 * Keyed by prop name. Opaque on purpose: what a cell holds is the *mapped*,
 * internal form, and reading it out to write back through `set` is exactly the
 * round-trip a layer exists to avoid.
 */
export type PropLayer = Map<string, SignalSnapshot<any>>;

/** Snapshot every reactive cell (value or binding) into a fresh layer. */
/** @internal */
export function captureLayer(host: ReactiveHost): PropLayer {
    const layer: PropLayer = new Map();
    const signals = host.__signals;
    if (!signals) return layer;
    for (const [key, cell] of signals) {
        layer.set(key, cell.snapshot());
    }
    return layer;
}

/** Push a snapshot of every reactive cell (value or binding) onto the stack. */
/** @internal */
export function saveState(host: ReactiveHost): void {
    if (!host.__signals) return;
    host._stateStack.push(captureLayer(host));
}

/** Pop the top snapshot layer, or `undefined` if the stack is empty. */
/** @internal */
export function popState(host: ReactiveHost): Map<string, SignalSnapshot<any>> | undefined {
    return host._stateStack.pop();
}

/** Instantly reapply a snapshot layer to every captured cell. */
/** @internal */
export function applySnapshotLayer(host: ReactiveHost, layer: Map<string, SignalSnapshot<any>>): void {
    const signals = host.__signals;
    if (!signals) return;
    for (const [key, snap] of layer) {
        signals.get(key)?.restoreFrom(snap);
    }
}

/**
 * Animated restore: tween the numeric / custom-tweenable props toward their
 * saved resolved values, then reapply the full snapshot so reactive bindings are
 * restored (not frozen at the tween's landing value) and non-tweened props snap.
 *
 * A {@link Command} rather than a generator: `_prepareStep`'s stepper already
 * drives the tween as a pure function of elapsed time, so `driveCommand` wraps
 * it directly and fires the snapshot reapply exactly at `t === 1` — the same
 * "commit at the end, restore what came before below it" shape
 * `packages/components/code`'s `runTransition` uses.
 *
 * `_prepareStep` is called **lazily, on the command's first evaluation**, not
 * when this function runs — it snapshots each prop's `from` off the *live*
 * node, and a generator's body (what this replaces) never ran a line until the
 * caller's first `.next()` either. Building it eagerly would snapshot whatever
 * the node happened to hold at `restore()`-call time instead of at first-drive
 * time, which can differ if the caller does more to the node in between.
 */
/** @internal */
export function restoreAnimated(
    host: ReactiveHost,
    layer: Map<string, SignalSnapshot<any>> | undefined,
    duration: number,
    easing?: EasingFunction,
): Command<Record<string, never>> {
    let stepper: TweenStepper | null = null;

    return driveCommand(duration, (t) => {
        if (!stepper) {
            // `to()` reads each snapshot's resolved `value` (correct even for a
            // bound cell), so the node animates back to where it *was*.
            const target: Record<string, unknown> = {};
            if (layer) {
                for (const [key, snap] of layer) {
                    target[key] = snap.value;
                }
            }
            stepper = host._prepareStep(target, duration);
        }
        stepper.seek(t * duration);
        if (layer && t >= 1) applySnapshotLayer(host, layer);
    }, easing);
}
