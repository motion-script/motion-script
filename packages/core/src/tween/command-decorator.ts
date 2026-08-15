/**
 * Marks a method as a **command**: a named, parameterised animation a host can
 * offer, place on a timeline and store by name.
 *
 * Metadata only — it changes nothing about how the method runs. What it buys is
 * that a node's animations become *enumerable*. A host building a timeline from
 * data needs to know which of a class's methods are offerable and what they take;
 * without this it has to be told separately, in a table that drifts from the
 * class the moment either is edited. The same problem `@property` solves for
 * props, and solved the same way — read the class, don't restate it.
 *
 * The method must return a {@link Command}, because a host that places an
 * animation at a time must also be able to evaluate it at one.
 *
 * ```ts
 * @command()
 * showSeries(index: number, duration = 1, easing?: EasingFunction): Command<ChartProps> {
 *     …
 * }
 * ```
 *
 * By convention the trailing parameters are `duration` and `easing`: every
 * built-in command already takes them last, and a host that knows the convention
 * can render a form for the leading arguments and drive timing itself.
 */

/** Symbol under which `@command` metadata is stored on class prototypes. */
export const COMMAND_META = Symbol("commandMeta");

export interface CommandMeta {
    /** The method name — the key a host stores and dispatches on. */
    key: string;
    /**
     * A display name, for a package with no localization of its own.
     *
     * Built-ins leave this unset: their names live in the host's i18n catalogue,
     * keyed by {@link key}, so a command is named once per language rather than
     * once in the source. A third-party package has nowhere else to put it.
     */
    name?: string;
}

export interface CommandOptions {
    /** Overrides the method name as the stable key. Rarely wanted. */
    key?: string;
    /** See {@link CommandMeta.name}. */
    name?: string;
}

/**
 * Every `@command` on an instance's class, including inherited ones.
 *
 * Ordered base class → subclass, matching {@link getPropertyMeta}, so a host
 * listing a node's commands sees the inherited ones first and a subclass can
 * shadow one by name.
 */
export function getCommandMeta(instance: object): CommandMeta[] {
    const result: CommandMeta[] = [];
    const chain: object[] = [];
    let proto = Object.getPrototypeOf(instance);
    while (proto && proto !== Object.prototype) {
        chain.unshift(proto);
        proto = Object.getPrototypeOf(proto);
    }
    const seen = new Set<string>();
    for (const p of chain) {
        const own: CommandMeta[] | undefined = (p as Record<symbol, unknown>)[COMMAND_META] as CommandMeta[] | undefined;
        if (!own) continue;
        for (const meta of own) {
            if (seen.has(meta.key)) continue;
            seen.add(meta.key);
            result.push(meta);
        }
    }
    return result;
}

/** See the module docblock. */
export function command(options?: CommandOptions) {
    return function (target: object, propertyKey: string | symbol): void {
        const key = options?.key ?? (propertyKey as string);
        // Own property, so `getCommandMeta` can tell each class's own entries
        // from the ones it inherited — same shape as `PROPERTY_META`.
        if (!Object.prototype.hasOwnProperty.call(target, COMMAND_META)) {
            (target as Record<symbol, unknown>)[COMMAND_META] = [];
        }
        const list = (target as Record<symbol, unknown>)[COMMAND_META] as CommandMeta[];
        if (list.some(m => m.key === key)) return;
        list.push({ key, ...(options?.name ? { name: options.name } : {}) });
    };
}
