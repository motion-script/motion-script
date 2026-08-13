import { Signal, SignalSnapshot, type SignalOwner } from "@/signals/signal";
import { SignalHost, TweenFn } from "@/signals/host";
import { EasingFunction } from "@/tween/ease/type";
import { FrameGenerator } from "@/tween/generator";
import { getPropertyMeta, PropOptions } from "@/attributes/properties/decorator";

/**
 * Companion implementation of {@link Node}'s reactive-property machinery and its
 * save/restore state stack. The bodies live here as free functions over a
 * narrow {@link ReactiveHost} so `node.ts` keeps only thin delegators (and the
 * hot-path `set`/`_writeProp`, which stay inline on the class). Mirrors the
 * existing `getSignal(host, name)` pattern in `signals/host.ts`.
 */

/**
 * The slice of a {@link Node} these helpers touch: the {@link SignalHost} maps
 * plus the internal write/tween seams. `_writeProp` and `_toGen` remain methods
 * on `Node`; the helpers call back through them so subclass behaviour and the
 * inline hot path are preserved.
 */
/** @internal */
export interface ReactiveHost extends SignalHost {
    _writeProp(field: string, value: unknown): void;
    _toGen(to: Record<string, unknown>, duration: number, easing?: EasingFunction): FrameGenerator;
    /** LIFO stack of save() snapshot layers; owned as an instance field on Node. */
    _stateStack: Map<string, SignalSnapshot<any>>[];
    /** Told when any of this host's cells goes stale; see {@link SignalOwner}. */
    markDirty(): void;
}

/**
 * Create the Signal cell + accessor for a freshly-declared prop and register its
 * tween/mapper metadata. Extracted from `Node._registerProp`; defines the
 * getter/setter on `host` so reads track the cell and writes route through
 * `host._writeProp` (mapper-aware, binding-aware).
 */
/** @internal */
export function registerProp<Int>(host: ReactiveHost, field: string, options?: PropOptions<any, Int>): void {
    const cell = new Signal<Int>(undefined as unknown as Int);
    // The one place every animatable prop is created, and therefore the one place
    // to say who owns it. Without this a node cannot tell whether anything about
    // it changed this frame — see `Node.markDirty`.
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
 * writes the value. Extracted from `Node.applyProp`.
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
 * restoring values. Drives `Node.reinitProps`; the method keeps the
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

/** Push a snapshot of every reactive cell (value or binding) onto the stack. */
/** @internal */
export function saveState(host: ReactiveHost): void {
    const signals = host.__signals;
    if (!signals) return;
    const layer = new Map<string, SignalSnapshot<any>>();
    for (const [key, cell] of signals) {
        layer.set(key, cell.snapshot());
    }
    host._stateStack.push(layer);
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
 * Extracted from `Node._restoreAnimated`.
 */
/** @internal */
export function* restoreAnimated(
    host: ReactiveHost,
    layer: Map<string, SignalSnapshot<any>> | undefined,
    duration: number,
    easing?: EasingFunction,
): FrameGenerator {
    if (!layer) { yield* host._toGen({}, duration, easing); return; }

    // `to()` reads each snapshot's resolved `value` (correct even for a bound
    // cell), so the node animates back to where it *was*.
    const target: Record<string, unknown> = {};
    for (const [key, snap] of layer) {
        target[key] = snap.value;
    }
    yield* host._toGen(target, duration, easing);

    applySnapshotLayer(host, layer);
}
