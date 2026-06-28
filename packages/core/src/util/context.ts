/**
 * Typed context tokens for passing inherited data down the node tree —
 * analogous to React's `createContext` / `useContext`, but resolved over the
 * scene-node tree rather than a render tree.
 *
 * A {@link Context} is an opaque token carrying a phantom type `T` and a
 * default value. Providers attach a value for a token to the {@link ContextMap}
 * pushed to their descendants; a descendant reads the nearest ancestor's value
 * (or the token's default) via `node.useContext(token)`.
 *
 * Mirrors the {@link createRef} factory style: a small typed helper rather than
 * a class the author has to instantiate.
 */
export interface Context<T> {
    /** Identity used as the map key. Unique per `createContext` call. */
    readonly id: symbol;
    /** Value returned by `useContext` when no ancestor provides this token. */
    readonly defaultValue: T;
    /** Optional label, surfaced on the symbol for debugging. */
    readonly name?: string;
}

/**
 * Create a typed context token.
 *
 * @example
 * ```ts
 * const Money = createContext<number>(0, "money");
 * // provide:  <Provider context={Money} value={500}>…</Provider>
 * // consume:  init() { const m = this.useContext(Money); }  // m: number
 * ```
 */
export function createContext<T>(defaultValue: T, name?: string): Context<T> {
    return { id: Symbol(name ?? "context"), defaultValue, name };
}

/**
 * An immutable, layered token→value map carried down the node tree. Each
 * provider derives a child map from its parent's via {@link with}, overriding a
 * single token — so a deeper provider naturally shadows a shallower one
 * (nearest-ancestor-wins) without any stack bookkeeping.
 */
export class ContextMap {
    private constructor(private readonly entries: ReadonlyMap<symbol, unknown>) { }

    /** The empty map — every token resolves to its own default. */
    static readonly EMPTY = new ContextMap(new Map());

    /** Return a new map identical to this one but with `ctx` set to `value`. */
    with<T>(ctx: Context<T>, value: T): ContextMap {
        const next = new Map(this.entries);
        next.set(ctx.id, value);
        return new ContextMap(next);
    }

    /** Resolve `ctx`'s value, falling back to its default when unset. */
    get<T>(ctx: Context<T>): T {
        return this.entries.has(ctx.id) ? (this.entries.get(ctx.id) as T) : ctx.defaultValue;
    }
}
