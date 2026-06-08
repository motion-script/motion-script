import { TweenFn } from "@/signals/host";

export interface PropOptions<Ext, Int> {
    /** Lerp the *internal* (post-mapper) value during `to()`. */
    tween?: TweenFn<Int>;
    /** Converts the external input into the internal stored value. Receives the previous internal value as the second arg when available. */
    mapper?: (ext: Ext, prev?: Int) => Int;
}


export interface PropertyMeta {
    key: string;
    default?: unknown;
    options?: PropOptions<any, any>;
}

/** Symbol used to store @property metadata on class prototypes. */
export const PROPERTY_META = Symbol("propertyMeta");

/**
 * Retrieve all @property() metadata for an instance's class, including
 * inherited metadata. Ordered base class → subclass so applyProp calls
 * happen in the same order as the original manual constructor calls.
 */
export function getPropertyMeta(instance: object): PropertyMeta[] {
    const result: PropertyMeta[] = [];
    const chain: object[] = [];
    let proto = Object.getPrototypeOf(instance);
    while (proto && proto !== Object.prototype) {
        chain.unshift(proto);
        proto = Object.getPrototypeOf(proto);
    }
    const seen = new Set<string>();
    for (const p of chain) {
        const own: PropertyMeta[] | undefined = (p as any)[PROPERTY_META];
        if (own) {
            for (const m of own) {
                if (!seen.has(m.key)) {
                    seen.add(m.key);
                    result.push(m);
                }
            }
        }
    }
    return result;
}

/**
 * Legacy property decorator (`experimentalDecorators: true`) that registers
 * a reactive property on a SceneNode subclass.
 *
 * @example
 * ```ts
 * @property({ default: 0 }) declare x: number;
 *
 * @property({ mapper: resolveFillArray, tween: FillRegistry.lerpArray })
 * declare fill: FillResolved[];
 * ```
 *
 * The `default` value is used when the corresponding key is absent from the
 * constructor `props` object. The `mapper` / `tween` options are forwarded
 * directly to `applyProp()`.
 */
export function property<Ext = any, Int = Ext>(opts?: {
    default?: Ext;
    mapper?: (ext: Ext, prev?: Int) => Int;
    tween?: TweenFn<Int>;
}) {
    // Legacy decorator: (target: object, propertyKey: string | symbol) => void
    return function (target: object, propertyKey: string | symbol): void {
        const key = propertyKey as string;
        const meta: PropertyMeta = {
            key,
            default: opts?.default,
            options: (opts?.mapper != null || opts?.tween != null)
                ? {
                    mapper: opts!.mapper as ((ext: any) => any) | undefined,
                    tween: opts!.tween as TweenFn<any> | undefined,
                }
                : undefined,
        };

        // Store metadata on the class prototype (own property so getPropertyMeta
        // can distinguish each class's own entries from inherited ones).
        if (!Object.prototype.hasOwnProperty.call(target, PROPERTY_META)) {
            (target as any)[PROPERTY_META] = [];
        }
        const list: PropertyMeta[] = (target as any)[PROPERTY_META];
        if (!list.some(m => m.key === key)) {
            list.push(meta);
        }
    };
}
